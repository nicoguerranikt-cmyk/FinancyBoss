'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isValidTimeZone } from '@/lib/dashboard'

export type PillarKey = 'ahorro' | 'gasto' | 'inversion'

export type OnboardingInput = {
  income: number
  autoRepeat: boolean
  // Migración 0030: ya no se pide un monto por pilar aparte — el monto de
  // cada pilar sale de sumar el de sus categorías (amount ausente o 0 = sin
  // monto fijo, queda como bolsa variable de ese pilar).
  categories: { pillar: PillarKey; name: string; amount?: number }[]
  // Cuánto de tu ingreso se descuenta cada mes para Gasto (migración 0039). Los
  // gastos fijos (categorías de Gasto con monto) salen de ese monto, y lo que
  // queda es el dinero para el día a día. Si falta, el monto de Gasto es la
  // suma de sus categorías.
  gastoAmount?: number
  // Zona horaria detectada por el navegador (ej. "America/La_Paz"). Es
  // opcional: si falta o es inválida queda la de Bolivia (la del default de la
  // columna, migración 0035) y se puede cambiar después en Más → Perfil.
  timeZone?: string
}

export async function completeOnboarding(
  input: OnboardingInput
): Promise<{ error?: string } | void> {
  // Validación en el servidor (nunca confiamos solo en el navegador).
  if (!(input.income > 0)) {
    return { error: 'El ingreso debe ser mayor a 0.' }
  }
  if (input.categories.some((c) => c.amount !== undefined && c.amount < 0)) {
    return { error: 'Los montos de las categorías no pueden ser negativos.' }
  }
  if (input.gastoAmount !== undefined && !(input.gastoAmount >= 0)) {
    return { error: 'El monto de Gasto no puede ser negativo.' }
  }
  const amountOf = (pillar: PillarKey) =>
    input.categories
      .filter((c) => c.pillar === pillar)
      .reduce((acc, c) => acc + (c.amount && c.amount > 0 ? c.amount : 0), 0)
  const fixedGasto = amountOf('gasto')
  if (input.gastoAmount !== undefined && input.gastoAmount < fixedGasto) {
    return { error: 'El monto de Gasto no puede ser menor que la suma de tus gastos fijos.' }
  }
  // "No se puede fabricar plata de la nada": la suma de los montos puede ser
  // menor que el ingreso (el resto queda como dinero libre), pero nunca más.
  const sum = amountOf('ahorro') + (input.gastoAmount ?? fixedGasto) + amountOf('inversion')
  if (sum > input.income) {
    return { error: `Esos montos suman ${sum} Bs, más que tu ingreso de ${input.income} Bs.` }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  }

  // El nombre y el username los tomamos de los metadatos del usuario
  // (guardados en /registro, migración 0029) y se los pasamos a la función.
  // Así la función NO necesita leer auth.users.
  const name =
    (user.user_metadata?.name as string | undefined)?.trim() ||
    user.email ||
    'Usuario'
  const username = (user.user_metadata?.username as string | undefined)?.trim() || null

  // Llamamos a la función de Postgres que guarda todo en una transacción.
  const { error } = await supabase.rpc('complete_onboarding', {
    p_income: input.income,
    p_auto_repeat: input.autoRepeat,
    p_name: name,
    p_categories: input.categories,
    p_username: username,
    p_gasto_amount: input.gastoAmount ?? null,
  })

  if (error) {
    // Log detallado en la terminal del server para diagnosticar.
    console.error('[completeOnboarding] RPC error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      categoriesEnviadas: input.categories,
    })
    return { error: 'No pudimos guardar tu configuración. Prueba de nuevo.' }
  }

  // Zona horaria del usuario. Va aparte de la transacción de arriba a
  // propósito: si falla, el onboarding no se pierde — queda la de Bolivia y
  // la puede cambiar en Más → Perfil.
  if (input.timeZone && isValidTimeZone(input.timeZone)) {
    const { error: timeZoneError } = await supabase
      .from('profiles')
      .update({ timezone: input.timeZone })
      .eq('id', user.id)
    if (timeZoneError) {
      console.error('[completeOnboarding] timezone update error:', {
        message: timeZoneError.message,
        code: timeZoneError.code,
      })
    }
  }

  // Limpiamos el cache y entramos al dashboard.
  revalidatePath('/', 'layout')
  redirect('/')
}
