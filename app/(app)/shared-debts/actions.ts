'use server'

// Deudas vinculadas entre usuarios: una fila de shared_debts es a la vez
// "Deuda" (para el deudor) y "Deudor" (para el acreedor) — por eso esta
// lógica vive en un solo módulo en vez de duplicarse entre
// app/(app)/deudas/actions.ts y app/(app)/deudores/actions.ts.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { todayInBolivia } from '@/lib/dashboard'
import { EPSILON } from '@/lib/domino'
import { validatePillarSource } from '@/lib/pillarSource'

function revalidateShared() {
  revalidatePath('/deudas')
  revalidatePath('/deudores')
  revalidatePath('/')
}

export async function findUserByEmail(
  email: string
): Promise<{ userId: string; name: string } | { error: string }> {
  const trimmed = email.trim()
  if (!trimmed) return { error: 'Ingresá un email.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { data, error } = await supabase.rpc('find_user_by_email', { p_email: trimmed })
  if (error) {
    console.error('[findUserByEmail] rpc error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
    // find_user_by_email solo hace "raise exception" para el caso "es tu
    // propio email" (ese mensaje sí es seguro de mostrar tal cual) — email
    // inexistente o sin onboarding terminar no tira excepción, devuelve 0
    // filas (se maneja más abajo con el mismo mensaje genérico).
    return { error: error.message || 'No pudimos buscar esa cuenta. Probá de nuevo.' }
  }
  const row = data?.[0]
  if (!row) return { error: 'No encontramos una cuenta de FinancyBoss con ese email.' }

  return { userId: row.user_id, name: row.name }
}

export type CreateSharedDebtInvite = {
  direction: 'yo_debo' | 'me_deben'
  counterpartUserId: string // siempre viene de findUserByEmail, nunca escrito a mano
  counterpartName: string // idem — el nombre que devolvió findUserByEmail
  name: string
  description?: string | null
  totalAmount: number
}

export async function createSharedDebtInvite(input: CreateSharedDebtInvite): Promise<{ error?: string }> {
  const name = input.name.trim()
  if (!name) return { error: 'Ingresá un nombre para esta deuda.' }
  if (name.length > 60) return { error: 'El nombre es demasiado largo.' }
  if (!(input.totalAmount > 0)) return { error: 'El monto debe ser mayor a 0.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  // profiles.RLS es "cada uno lee solo su propio perfil" — así que el
  // nombre de la CONTRAPARTE hay que guardarlo ahora (viene de
  // findUserByEmail) para no depender después de una consulta cruzada que
  // el RLS nunca va a dejar pasar. El propio sí lo podemos leer siempre.
  const { data: ownProfile } = await supabase.from('profiles').select('name').eq('id', user.id).maybeSingle()
  const ownName = ownProfile?.name ?? ''

  const debtorUserId = input.direction === 'yo_debo' ? user.id : input.counterpartUserId
  const creditorUserId = input.direction === 'yo_debo' ? input.counterpartUserId : user.id
  const debtorName = input.direction === 'yo_debo' ? ownName : input.counterpartName
  const creditorName = input.direction === 'yo_debo' ? input.counterpartName : ownName

  const { error } = await supabase.from('shared_debts').insert({
    debtor_user_id: debtorUserId,
    creditor_user_id: creditorUserId,
    created_by: user.id,
    debtor_name: debtorName,
    creditor_name: creditorName,
    name,
    description: input.description?.trim() || null,
    total_amount: input.totalAmount,
    remaining_amount: input.totalAmount,
    status: 'pending',
  })
  if (error) {
    console.error('[createSharedDebtInvite] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos enviar la invitación. Probá de nuevo.' }
  }

  revalidateShared()
  return {}
}

export async function acceptSharedDebtInvite(input: { sharedDebtId: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { error } = await supabase
    .from('shared_debts')
    .update({ status: 'active' })
    .eq('id', input.sharedDebtId)
    .eq('status', 'pending')
    .or(`debtor_user_id.eq.${user.id},creditor_user_id.eq.${user.id}`)
  if (error) {
    console.error('[acceptSharedDebtInvite] update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos aceptar la invitación. Probá de nuevo.' }
  }

  revalidateShared()
  return {}
}

export async function rejectSharedDebtInvite(input: { sharedDebtId: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { error } = await supabase
    .from('shared_debts')
    .update({ status: 'rejected' })
    .eq('id', input.sharedDebtId)
    .eq('status', 'pending')
    .or(`debtor_user_id.eq.${user.id},creditor_user_id.eq.${user.id}`)
  if (error) {
    console.error('[rejectSharedDebtInvite] update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos rechazar la invitación. Probá de nuevo.' }
  }

  revalidateShared()
  return {}
}

export async function archiveSharedDebt(input: { sharedDebtId: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { error } = await supabase
    .from('shared_debts')
    .update({ status: 'archived' })
    .eq('id', input.sharedDebtId)
    .eq('status', 'paid')
    .or(`debtor_user_id.eq.${user.id},creditor_user_id.eq.${user.id}`)
  if (error) {
    console.error('[archiveSharedDebt] update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos archivar la deuda. Probá de nuevo.' }
  }

  revalidateShared()
  return {}
}

export type ProposeSharedPaymentInput = {
  sharedDebtId: string
  amount: number
  pillarId: string
  categoryId?: string | null
}

export async function proposeSharedPayment(input: ProposeSharedPaymentInput): Promise<{ error?: string }> {
  if (!(input.amount > 0)) return { error: 'El monto debe ser mayor a 0.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { data: debt } = await supabase
    .from('shared_debts')
    .select('id, remaining_amount, status, debtor_user_id')
    .eq('id', input.sharedDebtId)
    .eq('debtor_user_id', user.id)
    .maybeSingle()
  if (!debt) return { error: 'Deuda vinculada inválida.' }
  if (debt.status !== 'active') return { error: 'Esta deuda no está activa.' }
  if (input.amount > debt.remaining_amount + EPSILON) {
    return { error: 'El pago no puede ser mayor al saldo pendiente.' }
  }

  const source = await validatePillarSource(supabase, user.id, input.pillarId, input.categoryId)
  if (source.error) return { error: source.error }

  const { error } = await supabase.from('shared_debt_payments').insert({
    shared_debt_id: debt.id,
    proposer_user_id: user.id,
    amount: input.amount,
    proposer_pillar_id: source.pillarId,
    proposer_category_id: source.categoryId,
    status: 'pending',
  })
  if (error) {
    console.error('[proposeSharedPayment] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos proponer el pago. Probá de nuevo.' }
  }

  revalidateShared()
  return {}
}

export async function rejectSharedPayment(input: { paymentId: string; note?: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const note = input.note?.trim()
  if (note && note.length > 200) return { error: 'La nota es demasiado larga.' }

  const { error } = await supabase
    .from('shared_debt_payments')
    .update({ status: 'rejected', rejection_note: note || null })
    .eq('id', input.paymentId)
    .eq('status', 'pending')
  if (error) {
    console.error('[rejectSharedPayment] update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos rechazar el pago. Probá de nuevo.' }
  }

  revalidateShared()
  return {}
}

export type ConfirmSharedPaymentInput = {
  paymentId: string
  pillarId: string
  categoryId?: string | null
}

export async function confirmSharedPayment(input: ConfirmSharedPaymentInput): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  // Validación rápida del lado del cliente/servidor Next para dar un buen
  // mensaje de error — la seguridad real la vuelve a chequear
  // confirm_shared_payment() adentro de la base.
  const source = await validatePillarSource(supabase, user.id, input.pillarId, input.categoryId)
  if (source.error) return { error: source.error }

  const { error } = await supabase.rpc('confirm_shared_payment', {
    p_payment_id: input.paymentId,
    p_confirmer_pillar_id: source.pillarId,
    p_confirmer_category_id: source.categoryId,
    p_date: todayInBolivia().iso,
  })
  if (error) {
    console.error('[confirmSharedPayment] rpc error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: error.message || 'No pudimos confirmar el pago. Probá de nuevo.' }
  }

  revalidateShared()
  return {}
}
