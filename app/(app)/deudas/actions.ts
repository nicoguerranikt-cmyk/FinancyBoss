'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { monthRangeInBolivia, todayInBolivia } from '@/lib/dashboard'
import { applyDebtPayment, isAutoPayDue } from '@/lib/debts'
import { EPSILON } from '@/lib/domino'
import { validatePillarSource } from '@/lib/pillarSource'

export type CreateDebtInput = {
  name: string
  totalAmount: number
  autoPay?: {
    monthlyAmount: number
    startYear: number
    startMonth: number
    startDay?: number | null
    pillarId: string
    categoryId?: string | null
  }
}

export async function createDebt(input: CreateDebtInput): Promise<{ error?: string }> {
  const name = input.name.trim()
  if (!name) return { error: 'Ingresá un nombre para la deuda.' }
  if (name.length > 60) return { error: 'El nombre es demasiado largo.' }
  if (!(input.totalAmount > 0)) return { error: 'El monto debe ser mayor a 0.' }

  if (input.autoPay) {
    if (!(input.autoPay.monthlyAmount > 0)) return { error: 'La cuota fija debe ser mayor a 0.' }
    if (input.autoPay.monthlyAmount > input.totalAmount) {
      return { error: 'La cuota fija no puede ser mayor al monto total.' }
    }
    if (!(input.autoPay.startMonth >= 1 && input.autoPay.startMonth <= 12)) {
      return { error: 'Mes de inicio inválido.' }
    }
    if (!(input.autoPay.startYear >= 2000)) return { error: 'Año de inicio inválido.' }
    if (!input.autoPay.pillarId) return { error: 'Elegí de qué pilar sale el pago automático.' }
    if (
      input.autoPay.startDay != null &&
      !(input.autoPay.startDay >= 1 && input.autoPay.startDay <= 31)
    ) {
      return { error: 'Día de inicio inválido.' }
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  let pillarId: string | null = null
  let categoryId: string | null = null
  if (input.autoPay) {
    const result = await validatePillarSource(supabase, user.id, input.autoPay.pillarId, input.autoPay.categoryId)
    if (result.error) return { error: result.error }
    pillarId = result.pillarId
    categoryId = result.categoryId
  }

  const { error } = await supabase.from('debts').insert({
    user_id: user.id,
    name,
    total_amount: input.totalAmount,
    remaining_amount: input.totalAmount,
    monthly_payment: input.autoPay?.monthlyAmount ?? null,
    status: 'active',
    auto_pay_start_year: input.autoPay?.startYear ?? null,
    auto_pay_start_month: input.autoPay?.startMonth ?? null,
    auto_pay_start_day: input.autoPay?.startDay ?? null,
    auto_pay_pillar_id: pillarId,
    auto_pay_category_id: categoryId,
  })
  if (error) {
    console.error('[createDebt] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos crear la deuda. Probá de nuevo.' }
  }

  revalidatePath('/deudas')
  return {}
}

export type RegisterPaymentInput = {
  debtId: string
  amount: number
  pillarId: string
  categoryId?: string | null
}

export async function registerPayment(input: RegisterPaymentInput): Promise<{ error?: string }> {
  if (!(input.amount > 0)) return { error: 'El monto debe ser mayor a 0.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { data: debt } = await supabase
    .from('debts')
    .select('id, remaining_amount, status')
    .eq('id', input.debtId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!debt) return { error: 'Deuda inválida.' }
  if (debt.status === 'paid') return { error: 'Esta deuda ya está saldada.' }
  if (input.amount > debt.remaining_amount + EPSILON) {
    return { error: 'El pago no puede ser mayor al saldo pendiente.' }
  }

  const source = await validatePillarSource(supabase, user.id, input.pillarId, input.categoryId)
  if (source.error) return { error: source.error }

  const { remainingAmount, status } = applyDebtPayment(debt, input.amount)

  const { error } = await supabase.from('transactions').insert({
    user_id: user.id,
    pillar_id: source.pillarId,
    category_id: source.categoryId,
    debt_id: debt.id,
    amount: -input.amount,
    type: 'expense' as const,
    description: null,
    date: todayInBolivia().iso,
  })
  if (error) {
    console.error('[registerPayment] transactions insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos registrar el pago. Probá de nuevo.' }
  }

  const { error: updateError } = await supabase
    .from('debts')
    .update({ remaining_amount: remainingAmount, status })
    .eq('id', debt.id)
    .eq('user_id', user.id)
  if (updateError) {
    console.error('[registerPayment] debts update error:', {
      message: updateError.message,
      details: updateError.details,
      hint: updateError.hint,
      code: updateError.code,
      input,
    })
    return { error: 'No pudimos actualizar la deuda. Probá de nuevo.' }
  }

  revalidatePath('/deudas')
  revalidatePath('/') // un pago de deuda baja el saldo del pilar elegido
  return {}
}

// Confirma la cuota del plan de pago automático de este mes (manual §6.2):
// el plan es un RECORDATORIO, nunca se descuenta solo por haber llegado la
// fecha — recién acá, cuando el usuario toca "Ya la pagué", se registra el
// pago de verdad.
export async function confirmAutoPayment(input: { debtId: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { data: debt } = await supabase
    .from('debts')
    .select(
      'id, remaining_amount, status, monthly_payment, auto_pay_start_year, auto_pay_start_month, auto_pay_start_day, auto_pay_pillar_id, auto_pay_category_id'
    )
    .eq('id', input.debtId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!debt) return { error: 'Deuda inválida.' }
  if (debt.status === 'paid') return { error: 'Esta deuda ya está saldada.' }
  // No confiamos en que el cliente solo muestre el botón cuando corresponde.
  if (!debt.auto_pay_pillar_id || !isAutoPayDue(debt, todayInBolivia())) {
    return { error: 'Todavía no te toca confirmar esta cuota.' }
  }

  const { start, end } = monthRangeInBolivia()
  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('debt_id', debt.id)
    .gte('date', start)
    .lte('date', end)
    .maybeSingle()
  if (existing) return { error: 'Ya confirmaste el pago de este mes.' }

  const amount = Math.min(debt.monthly_payment as number, debt.remaining_amount)
  const { remainingAmount, status } = applyDebtPayment(debt, amount)

  const { error } = await supabase.from('transactions').insert({
    user_id: user.id,
    pillar_id: debt.auto_pay_pillar_id,
    category_id: debt.auto_pay_category_id,
    debt_id: debt.id,
    amount: -amount,
    type: 'expense' as const,
    description: null,
    date: todayInBolivia().iso,
  })
  if (error) {
    console.error('[confirmAutoPayment] transactions insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos registrar el pago. Probá de nuevo.' }
  }

  const { error: updateError } = await supabase
    .from('debts')
    .update({ remaining_amount: remainingAmount, status })
    .eq('id', debt.id)
    .eq('user_id', user.id)
  if (updateError) {
    console.error('[confirmAutoPayment] debts update error:', {
      message: updateError.message,
      details: updateError.details,
      hint: updateError.hint,
      code: updateError.code,
      input,
    })
    return { error: 'No pudimos actualizar la deuda. Probá de nuevo.' }
  }

  revalidatePath('/deudas')
  revalidatePath('/')
  return {}
}

export async function markDebtPaid(input: { debtId: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  // Perdonar saldo no es lo mismo que pagar: no se registra ningún pago,
  // solo se cierra la deuda.
  const { error } = await supabase
    .from('debts')
    .update({ remaining_amount: 0, status: 'paid' })
    .eq('id', input.debtId)
    .eq('user_id', user.id)
  if (error) {
    console.error('[markDebtPaid] update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos marcar la deuda como pagada. Probá de nuevo.' }
  }

  revalidatePath('/deudas')
  return {}
}

// Saca una deuda pagada de la vista sin borrar su historial
// (transactions.debt_id sigue apuntando a ella) — mismo criterio que
// archiveDebtor en app/(app)/deudores/actions.ts.
export async function archiveDebt(input: { debtId: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { data: debt } = await supabase
    .from('debts')
    .select('id, status')
    .eq('id', input.debtId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!debt) return { error: 'Deuda inválida.' }
  if (debt.status !== 'paid') return { error: 'Solo se puede archivar una deuda ya pagada.' }

  const { error } = await supabase
    .from('debts')
    .update({ status: 'archived' })
    .eq('id', input.debtId)
    .eq('user_id', user.id)
  if (error) {
    console.error('[archiveDebt] update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos archivar la deuda. Probá de nuevo.' }
  }

  revalidatePath('/deudas')
  return {}
}
