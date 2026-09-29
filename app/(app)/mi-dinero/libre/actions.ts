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
    return { error: 'Ingresá un monto mayor a 0.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }
  }

  const { error } = await supabase.from('free_money_transactions').insert({
    user_id: user.id,
    amount: input.type === 'gasto' ? -input.amount : input.amount,
    description: input.description?.trim() || null,
    ...(input.date ? { date: input.date } : {}),
  })

  if (error) {
    return { error: 'No pudimos registrar el movimiento. Probá de nuevo.' }
  }

  revalidatePath('/mi-dinero/libre')
  revalidatePath('/mi-dinero')
  revalidatePath('/')
  return {}
}
