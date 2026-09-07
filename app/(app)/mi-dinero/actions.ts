'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { PillarName } from '@/lib/dashboard'

const PILLAR_NAMES: PillarName[] = ['ahorro', 'gasto', 'inversion']

// Distribución de pilares (manual §2.1): los 3 % siempre deben sumar 100.
// No hay RPC/transacción acá: son 3 filas fijas de un solo usuario, cada
// update es atómico por sí solo — el peor caso de una falla parcial es que
// el usuario reintente, no vale la pena una migración nueva para esto.
export async function updatePillarPercentages(input: {
  ahorro: number
  gasto: number
  inversion: number
}): Promise<{ error?: string }> {
  for (const key of PILLAR_NAMES) {
    const v = input[key]
    if (!(v >= 0 && v <= 100)) {
      return { error: 'Los porcentajes deben estar entre 0 y 100.' }
    }
  }
  if (Math.round(input.ahorro + input.gasto + input.inversion) !== 100) {
    return { error: 'Los porcentajes de los pilares deben sumar 100%.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }
  }

  // No confiamos en ids que vengan del cliente para esto: resolvemos
  // nosotros mismos qué fila es cada pilar del usuario logueado.
  const { data: pillars } = await supabase
    .from('pillars')
    .select('id, name')
    .eq('user_id', user.id)
  const idByName = Object.fromEntries(
    (pillars ?? []).map((p) => [p.name, p.id])
  ) as Record<PillarName, string | undefined>
  if (!idByName.ahorro || !idByName.gasto || !idByName.inversion) {
    return { error: 'No pudimos encontrar tus 3 pilares. Recargá la página.' }
  }

  for (const key of PILLAR_NAMES) {
    const { error } = await supabase
      .from('pillars')
      .update({ percentage: input[key] })
      .eq('id', idByName[key])
      .eq('user_id', user.id)
    if (error) {
      console.error('[updatePillarPercentages] update error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        pillar: key,
      })
      return { error: 'No pudimos guardar los porcentajes. Probá de nuevo.' }
    }
  }

  revalidatePath('/mi-dinero')
  revalidatePath('/') // el Dashboard usa percentage para calcular el budget de cada pilar
  return {}
}

export async function createCategory(input: {
  pillarId: string
  name: string
}): Promise<{ error?: string }> {
  const name = input.name.trim()
  if (!name) {
    return { error: 'Ingresá un nombre para la categoría.' }
  }
  if (name.length > 60) {
    return { error: 'El nombre es demasiado largo.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }
  }

  const { data: pillar } = await supabase
    .from('pillars')
    .select('id')
    .eq('id', input.pillarId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!pillar) {
    return { error: 'Pilar inválido.' }
  }

  const { error } = await supabase.from('categories').insert({
    user_id: user.id,
    pillar_id: input.pillarId,
    name,
    percentage: null,
    fixed_amount: null,
    auto_repeat: false,
  })
  if (error) {
    console.error('[createCategory] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos crear la categoría. Probá de nuevo.' }
  }

  revalidatePath('/mi-dinero')
  return {}
}

export type UpdateCategoryInput = {
  categoryId: string
  name?: string
  percentage?: number | null
  fixedAmount?: number | null
  autoRepeat?: boolean
}

// Una sola acción para nombre/%/gasto fijo: el cliente arma el patch con
// solo los campos que cambiaron en la fila, en vez de 3 llamadas separadas.
export async function updateCategory(input: UpdateCategoryInput): Promise<{ error?: string }> {
  const patch: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) return { error: 'Ingresá un nombre para la categoría.' }
    if (name.length > 60) return { error: 'El nombre es demasiado largo.' }
    patch.name = name
  }

  if (input.percentage !== undefined) {
    if (input.percentage !== null && !(input.percentage >= 0 && input.percentage <= 100)) {
      return { error: 'El porcentaje debe estar entre 0 y 100.' }
    }
    patch.percentage = input.percentage
  }

  const touchesFixed = input.fixedAmount !== undefined || input.autoRepeat !== undefined

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }
  }

  if (touchesFixed) {
    if (input.fixedAmount !== undefined && input.fixedAmount !== null && !(input.fixedAmount >= 0)) {
      return { error: 'El monto fijo debe ser mayor o igual a 0.' }
    }

    // Doble consulta (categoría → pilar) en vez de un embedded select, para
    // seguir el mismo patrón que resolveDeficit en app/(app)/actions.ts.
    const { data: category } = await supabase
      .from('categories')
      .select('id, pillar_id')
      .eq('id', input.categoryId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!category) {
      return { error: 'Categoría inválida.' }
    }

    const { data: pillar } = await supabase
      .from('pillars')
      .select('name')
      .eq('id', category.pillar_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!pillar || pillar.name !== 'gasto') {
      return { error: 'Los gastos fijos solo aplican a categorías del pilar Gasto.' }
    }

    if (input.fixedAmount !== undefined) patch.fixed_amount = input.fixedAmount
    // Sin monto fijo, "repetir cada mes" no tiene sentido: se apaga solo.
    if (input.fixedAmount === null) {
      patch.auto_repeat = false
    } else if (input.autoRepeat !== undefined) {
      patch.auto_repeat = input.autoRepeat
    }
  }

  if (Object.keys(patch).length === 0) {
    return {}
  }

  const { error } = await supabase
    .from('categories')
    .update(patch)
    .eq('id', input.categoryId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
  if (error) {
    console.error('[updateCategory] update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos guardar los cambios. Probá de nuevo.' }
  }

  revalidatePath('/mi-dinero')
  if (input.fixedAmount !== undefined) {
    revalidatePath('/') // fixed_amount se resta del saldo del pilar y del presupuesto diario
  }
  return {}
}

export async function deleteCategory(input: { categoryId: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }
  }

  const { error } = await supabase
    .from('categories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', input.categoryId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
  if (error) {
    console.error('[deleteCategory] soft-delete error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos eliminar la categoría. Probá de nuevo.' }
  }

  revalidatePath('/mi-dinero')
  revalidatePath('/') // desaparece del selector de QuickAddForm y, si tenía fixed_amount, cambia el presupuesto
  return {}
}
