'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { todayIn } from '@/lib/dashboard'
import { getUserTimeZone } from '@/lib/userTimezone.server'
import { lastDueOccurrence, validateAutoPayFrequency, type AutoPayInterval } from '@/lib/debts'
import { validatePillarSource } from '@/lib/pillarSource'
import { userFacingRpcError } from '@/lib/rpcError'

export type AutoPayInput = {
  amount: number
  startDate: string // 'YYYY-MM-DD'
  intervalUnit: AutoPayInterval
  intervalCount: number
  pillarId: string
  categoryId?: string | null
}

export type CreateDebtInput = {
  name: string
  totalAmount: number
  autoPay?: AutoPayInput
}

export async function createDebt(input: CreateDebtInput): Promise<{ error?: string }> {
  const name = input.name.trim()
  if (!name) return { error: 'Ingresa un nombre para la deuda.' }
  if (name.length > 60) return { error: 'El nombre es demasiado largo.' }
  if (!(input.totalAmount > 0)) return { error: 'El monto debe ser mayor a 0.' }

  if (input.autoPay) {
    const frequencyError = validateAutoPayFrequency(input.autoPay, input.totalAmount)
    if (frequencyError) return { error: frequencyError }
    if (!input.autoPay.pillarId) return { error: 'Elige de qué pilar sale el pago automático.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

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
    auto_pay_amount: input.autoPay?.amount ?? null,
    status: 'active',
    auto_pay_start_date: input.autoPay?.startDate ?? null,
    auto_pay_interval_unit: input.autoPay?.intervalUnit ?? null,
    auto_pay_interval_count: input.autoPay?.intervalCount ?? null,
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
    return { error: 'No pudimos crear la deuda. Prueba de nuevo.' }
  }

  revalidatePath('/deudas')
  return {}
}

// Configura, edita o quita (autoPay: null) el plan de pago automático de una
// deuda que YA existe — hasta ahora eso solo se podía elegir al crearla.
export type UpdateAutoPayInput = {
  debtId: string
  autoPay: AutoPayInput | null
}

export async function updateAutoPay(input: UpdateAutoPayInput): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { data: debt } = await supabase
    .from('debts')
    .select('id, total_amount, status')
    .eq('id', input.debtId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!debt) return { error: 'Deuda inválida.' }
  if (debt.status === 'paid') return { error: 'Esta deuda ya está saldada.' }

  let patch: Record<string, unknown> = {
    auto_pay_amount: null,
    auto_pay_start_date: null,
    auto_pay_interval_unit: null,
    auto_pay_interval_count: null,
    auto_pay_pillar_id: null,
    auto_pay_category_id: null,
  }

  if (input.autoPay) {
    const frequencyError = validateAutoPayFrequency(input.autoPay, debt.total_amount)
    if (frequencyError) return { error: frequencyError }
    if (!input.autoPay.pillarId) return { error: 'Elige de qué pilar sale el pago automático.' }

    const source = await validatePillarSource(supabase, user.id, input.autoPay.pillarId, input.autoPay.categoryId)
    if (source.error) return { error: source.error }

    patch = {
      auto_pay_amount: input.autoPay.amount,
      auto_pay_start_date: input.autoPay.startDate,
      auto_pay_interval_unit: input.autoPay.intervalUnit,
      auto_pay_interval_count: input.autoPay.intervalCount,
      auto_pay_pillar_id: source.pillarId,
      auto_pay_category_id: source.categoryId,
    }
  }

  const { error } = await supabase.from('debts').update(patch).eq('id', input.debtId).eq('user_id', user.id)
  if (error) {
    console.error('[updateAutoPay] update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos guardar el plan automático. Prueba de nuevo.' }
  }

  revalidatePath('/deudas')
  revalidatePath('/')
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
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  // El pago y la baja del saldo de la deuda corren juntos en una función de
  // la base (migración 0038): se hacen los dos o ninguno, y dos pagos
  // simultáneos de la misma deuda se atienden de a uno. Antes eran dos pedidos
  // separados, y un fallo entre ambos dejaba un pago sin descontar.
  const timeZone = await getUserTimeZone(supabase, user.id)
  const { error } = await supabase.rpc('register_debt_payment', {
    p_debt_id: input.debtId,
    p_amount: input.amount,
    p_pillar_id: input.pillarId,
    p_category_id: input.categoryId ?? null,
    p_date: todayIn(timeZone).iso,
  })
  if (error) {
    console.error('[registerPayment] rpc error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: userFacingRpcError(error, 'No pudimos registrar el pago. Prueba de nuevo.') }
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
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { data: debt } = await supabase
    .from('debts')
    .select(
      'id, remaining_amount, status, auto_pay_amount, auto_pay_start_date, auto_pay_interval_unit, auto_pay_interval_count, auto_pay_pillar_id, auto_pay_category_id'
    )
    .eq('id', input.debtId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!debt) return { error: 'Deuda inválida.' }
  if (debt.status === 'paid') return { error: 'Esta deuda ya está saldada.' }
  // No confiamos en que el cliente solo muestre el botón cuando corresponde.
  const timeZone = await getUserTimeZone(supabase, user.id)
  const today = todayIn(timeZone)
  const dueDate = debt.auto_pay_pillar_id ? lastDueOccurrence(debt, today) : null
  if (!dueDate) return { error: 'Todavía no te toca confirmar esta cuota.' }

  // Todo adentro de la función (migración 0038): "ya confirmaste esta cuota"
  // se comprueba con la deuda bloqueada, así un doble clic no registra dos
  // cuotas, y el pago y la baja del saldo se hacen juntos o no se hacen.
  const amount = Math.min(debt.auto_pay_amount as number, debt.remaining_amount)
  const { error } = await supabase.rpc('register_debt_payment', {
    p_debt_id: debt.id,
    p_amount: amount,
    p_pillar_id: debt.auto_pay_pillar_id,
    p_category_id: debt.auto_pay_category_id,
    p_date: today.iso,
    p_dedupe_since: dueDate,
  })
  if (error) {
    console.error('[confirmAutoPayment] rpc error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: userFacingRpcError(error, 'No pudimos registrar el pago. Prueba de nuevo.') }
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
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

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
    return { error: 'No pudimos marcar la deuda como pagada. Prueba de nuevo.' }
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
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

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
    return { error: 'No pudimos archivar la deuda. Prueba de nuevo.' }
  }

  revalidatePath('/deudas')
  return {}
}
