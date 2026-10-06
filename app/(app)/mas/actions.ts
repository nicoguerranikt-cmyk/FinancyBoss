'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isValidTimeZone, todayIn } from '@/lib/dashboard'
import { getUserTimeZone } from '@/lib/userTimezone.server'
import { ensureMonthlyAllocation } from '@/lib/monthlyAllocation.server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function writeProfileConfirmation(
  supabase: SupabaseClient,
  userId: string,
  input: {
    name: string
    baseIncome: number
    autoRepeatIncome: boolean
    username?: string | null
    timeZone?: string
  }
) {
  // Si el usuario cambia su zona en este mismo guardado, "este mes" ya es el
  // de la zona nueva.
  const timeZone = input.timeZone ?? (await getUserTimeZone(supabase, userId))
  const today = todayIn(timeZone)
  const patch: Record<string, unknown> = {
    name: input.name,
    base_income: input.baseIncome,
    auto_repeat_income: input.autoRepeatIncome,
    income_confirmed_year: today.year,
    income_confirmed_month: today.month,
  }
  if (input.timeZone !== undefined) patch.timezone = input.timeZone
  // username es un campo aparte del resto (no tiene que ver con confirmar
  // el ingreso): si el que llama no lo mandó — ej. IncomeConfirmBanner, que
  // no tiene ese campo — no lo tocamos, para no borrarlo sin querer.
  if (input.username !== undefined) patch.username = input.username
  return supabase.from('profiles').update(patch).eq('id', userId)
}

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/

export type UpdateProfileInput = {
  name: string
  baseIncome: number
  autoRepeatIncome: boolean
  // Nullable: null/'' borra el username (vuelve a no tener uno). Migración
  // 0024 — se usa para vincular deudas sin el email de la otra persona.
  username?: string | null
  // Zona horaria IANA (ej. "America/La_Paz"). Si no viene, no se toca.
  timeZone?: string
}

// manual.md §3.1: el ingreso base se puede ajustar cuando el usuario quiera,
// y el toggle de repetición vive en "Configuración" (sección 9).
export async function updateProfile(input: UpdateProfileInput): Promise<{ error?: string }> {
  const name = input.name.trim()
  if (!name) return { error: 'Ingresa tu nombre.' }
  if (name.length > 60) return { error: 'El nombre es demasiado largo.' }
  if (!(input.baseIncome > 0)) return { error: 'El ingreso debe ser mayor a 0.' }

  let usernameInput: string | null | undefined
  if (input.username !== undefined) {
    usernameInput = input.username?.trim().toLowerCase() || null
    if (usernameInput !== null && !USERNAME_PATTERN.test(usernameInput)) {
      return { error: 'El nombre de usuario debe tener 3-20 caracteres: letras, números o guión bajo.' }
    }
  }

  if (input.timeZone !== undefined && !isValidTimeZone(input.timeZone)) {
    return { error: 'Esa zona horaria no es válida.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  // Guardar acá (desde Más) cuenta como "confirmar el ingreso de este mes"
  // (manual §3.1) — mismo criterio que el resto del proyecto: no hay
  // historial, solo el año/mes vigente.
  const { error } = await writeProfileConfirmation(supabase, user.id, { ...input, name, username: usernameInput })
  if (error?.code === '23505') {
    return { error: 'Ese nombre de usuario ya está en uso. Prueba con otro.' }
  }
  if (error) {
    console.error('[updateProfile] update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos guardar los cambios. Prueba de nuevo.' }
  }

  // El reparto mensual se genera con los montos fijos de cada pilar/
  // categoría (migración 0020: ya no dependen de cuánto ingreso se
  // confirme) — no hace nada si ya se había generado este mes. Misma
  // llamada sin importar si esto se confirmó desde acá (Más) o desde el
  // banner del Dashboard (IncomeConfirmBanner) — ya no hay una pantalla de
  // revisión con montos distinta entre las dos, así que no hace falta una
  // action separada para eso (ver historial: antes existía
  // confirmMonthlyIncome con overrides por categoría).
  await ensureMonthlyAllocation(supabase, user.id)

  revalidatePath('/mas')
  revalidatePath('/')
  revalidatePath('/mi-dinero/[pillarId]', 'page')
  revalidatePath('/mi-dinero/[pillarId]/[categoryId]', 'page')
  return {}
}

// QR de cobro (migración 0026): se muestra al deudor de una deuda vinculada
// activa cuando va a pagar (ver app/(app)/shared-debts/actions.ts
// getCreditorPaymentQrUrl) — nunca a cualquiera en la app. Path fijo por
// usuario (qr/{user_id}/qr, con upsert) para que un re-upload pise el
// anterior en vez de acumular archivos sueltos. Tiene que ser de 3 partes
// ("carpeta/carpeta/archivo"): la política de storage.objects usa
// storage.foldername(name)[2] para saber de quién es — con un path de solo
// 2 partes ese segundo elemento no existe (foldername excluye el último
// tramo, asumiéndolo el nombre de archivo) y la política nunca matchea.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export async function uploadPaymentQr(formData: FormData): Promise<{ error?: string }> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Elige una imagen.' }
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: 'Tiene que ser una imagen (PNG, JPG o WEBP).' }
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: 'La imagen no puede pesar más de 5 MB.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const path = `qr/${user.id}/qr`
  const { error: uploadError } = await supabase.storage
    .from('payment-media')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) {
    console.error('[uploadPaymentQr] upload error:', uploadError)
    return { error: 'No pudimos subir la imagen. Prueba de nuevo.' }
  }

  const { error } = await supabase.from('profiles').update({ payment_qr_path: path }).eq('id', user.id)
  if (error) {
    console.error('[uploadPaymentQr] profile update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
    return { error: 'No pudimos guardar la imagen. Prueba de nuevo.' }
  }

  revalidatePath('/mas')
  return {}
}

export async function removePaymentQr(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  await supabase.storage.from('payment-media').remove([`qr/${user.id}/qr`])

  const { error } = await supabase.from('profiles').update({ payment_qr_path: null }).eq('id', user.id)
  if (error) {
    console.error('[removePaymentQr] profile update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
    return { error: 'No pudimos sacar la imagen. Prueba de nuevo.' }
  }

  revalidatePath('/mas')
  return {}
}
