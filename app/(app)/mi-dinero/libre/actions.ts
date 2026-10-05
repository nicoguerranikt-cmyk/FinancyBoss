'use server'

// Dinero libre (manual.md — migración 0021): un movimiento a mano acá no
// pasa por ningún pilar ni categoría, es plata sin destino específico. A
// diferencia del crédito automático de fin de mes (lib/monthClose.ts), esto
// SÍ es una acción del usuario con su propio botón — nunca se asume un
// movimiento de plata sin que él lo confirme.
//
// Dos formularios llaman a esto: el de la propia pantalla /mi-dinero/libre
// (manda date a mano, con selector de fecha) y el acceso rápido del
// Dashboard (QuickAddForm — sin selector de fecha, usa el default de la
// columna: hoy).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type RegisterFreeMoneyMovementInput = {
  type: 'gasto' | 'ingreso'
  amount: number
  description?: string
  date?: string
}

export async function registerFreeMoneyMovement(
  input: RegisterFreeMoneyMovementInput
): Promise<{ error?: string }> {
  if (!(input.amount > 0)) {
    return { error: 'Ingresa un monto mayor a 0.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  }

  const { error } = await supabase.from('free_money_transactions').insert({
    user_id: user.id,
    amount: input.type === 'gasto' ? -input.amount : input.amount,
    description: input.description?.trim() || null,
    ...(input.date ? { date: input.date } : {}),
  })

  if (error) {
    return { error: 'No pudimos registrar el movimiento. Prueba de nuevo.' }
  }

  revalidatePath('/mi-dinero/libre')
  revalidatePath('/mi-dinero')
  revalidatePath('/')
  return {}
}

// Asignar Dinero libre a una categoría (migración 0028): mismo patrón que
// convertir USD a Bs, pero al revés — el origen es el pozo de Dinero libre
// y el destino puede ser cualquier categoría (Ahorro, Gasto o Inversión).
// Las dos escrituras (restar del pozo, sumar el ingreso en la categoría)
// son atómicas adentro de allocate_free_money_to_category — quedan las dos
// o ninguna, nunca a medias.
export async function allocateFreeMoneyToCategory(input: {
  amount: number
  categoryId: string
  description?: string
  date?: string
}): Promise<{ error?: string }> {
  if (!(input.amount > 0)) return { error: 'Ingresa un monto mayor a 0.' }
  if (!input.categoryId) return { error: 'Elige a qué categoría va.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { error } = await supabase.rpc('allocate_free_money_to_category', {
    p_amount: input.amount,
    p_category_id: input.categoryId,
    p_description: input.description?.trim() || null,
    p_date: input.date ?? null,
  })
  if (error) {
    console.error('[allocateFreeMoneyToCategory] rpc error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: error.message || 'No pudimos asignar la plata. Prueba de nuevo.' }
  }

  revalidatePath('/mi-dinero/libre')
  revalidatePath('/mi-dinero')
  revalidatePath('/mi-dinero/[pillarId]', 'page')
  revalidatePath('/mi-dinero/[pillarId]/[categoryId]', 'page')
  revalidatePath('/')
  return {}
}
