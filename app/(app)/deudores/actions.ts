'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { todayInBolivia } from '@/lib/dashboard'
import { applyCollection } from '@/lib/debtors'
import { EPSILON } from '@/lib/domino'
import { validatePillarSource } from '@/lib/pillarSource'

export type CreateDebtorInput = {
  name: string
  totalAmount: number
  lentDate: string // YYYY-MM-DD
  expectedDate?: string | null
  description?: string | null
}

export async function createDebtor(input: CreateDebtorInput): Promise<{ error?: string }> {
  const name = input.name.trim()
  if (!name) return { error: 'Ingresá el nombre de quién te debe.' }
  if (name.length > 60) return { error: 'El nombre es demasiado largo.' }
  if (!(input.totalAmount > 0)) return { error: 'El monto debe ser mayor a 0.' }
  if (!input.lentDate) return { error: 'Ingresá la fecha del préstamo.' }

  const description = input.description?.trim() || null
  if (description && description.length > 200) return { error: 'La descripción es demasiado larga.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

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
    return { error: 'No pudimos guardar el registro. Probá de nuevo.' }
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
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { data: debtor } = await supabase
    .from('debtors')
    .select('id, remaining_amount, status')
    .eq('id', input.debtorId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!debtor) return { error: 'Deudor inválido.' }
  if (debtor.status !== 'pending') return { error: 'Este registro ya no está pendiente.' }
  // manual §11: "Un deudor paga más de lo que debe → el sistema no acepta
  // un pago mayor al saldo pendiente. Muestra error."
  if (input.amount > debtor.remaining_amount + EPSILON) {
    return { error: 'El cobro no puede ser mayor al saldo pendiente.' }
  }

  const source = await validatePillarSource(supabase, user.id, input.pillarId, input.categoryId)
  if (source.error) return { error: source.error }

  const { remainingAmount, status } = applyCollection(debtor, input.amount)

  const { error } = await supabase.from('transactions').insert({
    user_id: user.id,
    pillar_id: source.pillarId,
    category_id: source.categoryId,
    debtor_id: debtor.id,
    amount: input.amount,
    type: 'extra_income' as const,
    description: null,
    date: todayInBolivia().iso,
  })
  if (error) {
    console.error('[registerCollection] transactions insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos registrar el cobro. Probá de nuevo.' }
  }

  const { error: updateError } = await supabase
    .from('debtors')
    .update({ remaining_amount: remainingAmount, status })
    .eq('id', debtor.id)
    .eq('user_id', user.id)
  if (updateError) {
    console.error('[registerCollection] debtors update error:', {
      message: updateError.message,
      details: updateError.details,
      hint: updateError.hint,
      code: updateError.code,
      input,
    })
    return { error: 'No pudimos actualizar el registro. Probá de nuevo.' }
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
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

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
    return { error: 'No pudimos archivar el registro. Probá de nuevo.' }
  }

  revalidatePath('/deudores')
  return {}
}
