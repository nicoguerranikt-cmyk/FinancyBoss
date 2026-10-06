'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { todayIn } from '@/lib/dashboard'
import { getUserTimeZone } from '@/lib/userTimezone.server'
import { userFacingRpcError } from '@/lib/rpcError'

export type CreateDebtorInput = {
  name: string
  totalAmount: number
  lentDate: string // YYYY-MM-DD
  expectedDate?: string | null
  description?: string | null
}

export async function createDebtor(input: CreateDebtorInput): Promise<{ error?: string }> {
  const name = input.name.trim()
  if (!name) return { error: 'Ingresa el nombre de quién te debe.' }
  if (name.length > 60) return { error: 'El nombre es demasiado largo.' }
  if (!(input.totalAmount > 0)) return { error: 'El monto debe ser mayor a 0.' }
  if (!input.lentDate) return { error: 'Ingresa la fecha del préstamo.' }

  const description = input.description?.trim() || null
  if (description && description.length > 200) return { error: 'La descripción es demasiado larga.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { error } = await supabase.from('debtors').insert({
    user_id: user.id,
    name,
    total_amount: input.totalAmount,
    remaining_amount: input.totalAmount,
    lent_date: input.lentDate,
    expected_date: input.expectedDate || null,
    description,
    status: 'pending',
  })
  if (error) {
    console.error('[createDebtor] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos guardar el registro. Prueba de nuevo.' }
  }

  revalidatePath('/deudores')
  return {}
}

export type RegisterCollectionInput = {
  debtorId: string
  amount: number
  pillarId: string
  categoryId?: string | null
}

// Manual §7.3: un cobro se convierte en un ingreso extra, a donde el
// usuario elige mandarlo. Reduce el saldo pendiente del deudor y, si lo
// cubre entero, lo pasa a "paid" solo (manual §7.5).
export async function registerCollection(input: RegisterCollectionInput): Promise<{ error?: string }> {
  if (!(input.amount > 0)) return { error: 'El monto debe ser mayor a 0.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  // El cobro y la baja del saldo del deudor corren juntos en una función de la
  // base (migración 0038): los dos o ninguno, y dos cobros simultáneos del
  // mismo deudor se atienden de a uno. La función también aplica manual §11
  // ("el sistema no acepta un cobro mayor al saldo pendiente").
  const timeZone = await getUserTimeZone(supabase, user.id)
  const { error } = await supabase.rpc('register_debtor_collection', {
    p_debtor_id: input.debtorId,
    p_amount: input.amount,
    p_pillar_id: input.pillarId,
    p_category_id: input.categoryId ?? null,
    p_date: todayIn(timeZone).iso,
  })
  if (error) {
    console.error('[registerCollection] rpc error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: userFacingRpcError(error, 'No pudimos registrar el cobro. Prueba de nuevo.') }
  }

  revalidatePath('/deudores')
  revalidatePath('/') // un cobro sube el saldo del pilar elegido
  return {}
}

// manual §11: borrar un deudor con pagos parciales conserva el historial de
// cobros y archiva el registro en vez de borrarlo.
export async function archiveDebtor(input: { debtorId: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { error } = await supabase
    .from('debtors')
    .update({ status: 'archived' })
    .eq('id', input.debtorId)
    .eq('user_id', user.id)
  if (error) {
    console.error('[archiveDebtor] update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos archivar el registro. Prueba de nuevo.' }
  }

  revalidatePath('/deudores')
  return {}
}
