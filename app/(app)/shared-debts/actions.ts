'use server'

// Deudas vinculadas entre usuarios: una fila de shared_debts es a la vez
// "Deuda" (para el deudor) y "Deudor" (para el acreedor) — por eso esta
// lógica vive en un solo módulo en vez de duplicarse entre
// app/(app)/deudas/actions.ts y app/(app)/deudores/actions.ts.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { todayIn } from '@/lib/dashboard'
import { getUserTimeZone } from '@/lib/userTimezone.server'
import { validateAutoPayFrequency, type AutoPayFrequencyInput } from '@/lib/debts'
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
  if (!trimmed) return { error: 'Ingresa un email.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

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
    return { error: error.message || 'No pudimos buscar esa cuenta. Prueba de nuevo.' }
  }
  const row = data?.[0]
  if (!row) return { error: 'No encontramos una cuenta de FinancyBoss con ese email.' }

  return { userId: row.user_id, name: row.name }
}

export async function findUserByUsername(
  username: string
): Promise<{ userId: string; name: string } | { error: string }> {
  const trimmed = username.trim()
  if (!trimmed) return { error: 'Ingresa un nombre de usuario.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { data, error } = await supabase.rpc('find_user_by_username', { p_username: trimmed })
  if (error) {
    console.error('[findUserByUsername] rpc error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
    return { error: error.message || 'No pudimos buscar esa cuenta. Prueba de nuevo.' }
  }
  const row = data?.[0]
  if (!row) return { error: 'No encontramos una cuenta de FinancyBoss con ese nombre de usuario.' }

  return { userId: row.user_id, name: row.name }
}

export type CreateSharedDebtInvite = {
  direction: 'yo_debo' | 'me_deben'
  counterpartUserId: string // siempre viene de findUserByEmail, nunca escrito a mano
  counterpartName: string // idem — el nombre que devolvió findUserByEmail
  name: string
  description?: string | null
  totalAmount: number
  // Recordatorio opcional ("te toca proponer el pago") — nunca pilar acá,
  // eso se elige recién al proponer el pago (ver proposeSharedPayment).
  autoPay?: AutoPayFrequencyInput
}

export async function createSharedDebtInvite(input: CreateSharedDebtInvite): Promise<{ error?: string }> {
  const name = input.name.trim()
  if (!name) return { error: 'Ingresa un nombre para esta deuda.' }
  if (name.length > 60) return { error: 'El nombre es demasiado largo.' }
  if (!(input.totalAmount > 0)) return { error: 'El monto debe ser mayor a 0.' }

  if (input.autoPay) {
    const frequencyError = validateAutoPayFrequency(input.autoPay, input.totalAmount)
    if (frequencyError) return { error: frequencyError }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

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
    auto_pay_amount: input.autoPay?.amount ?? null,
    auto_pay_start_date: input.autoPay?.startDate ?? null,
    auto_pay_interval_unit: input.autoPay?.intervalUnit ?? null,
    auto_pay_interval_count: input.autoPay?.intervalCount ?? null,
  })
  if (error) {
    console.error('[createSharedDebtInvite] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos enviar la invitación. Prueba de nuevo.' }
  }

  revalidateShared()
  return {}
}

export async function acceptSharedDebtInvite(input: { sharedDebtId: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

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
    return { error: 'No pudimos aceptar la invitación. Prueba de nuevo.' }
  }

  revalidateShared()
  return {}
}

export async function rejectSharedDebtInvite(input: { sharedDebtId: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

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
    return { error: 'No pudimos rechazar la invitación. Prueba de nuevo.' }
  }

  revalidateShared()
  return {}
}

export async function archiveSharedDebt(input: { sharedDebtId: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

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
    return { error: 'No pudimos archivar la deuda. Prueba de nuevo.' }
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

export async function proposeSharedPayment(
  input: ProposeSharedPaymentInput
): Promise<{ paymentId?: string; error?: string }> {
  if (!(input.amount > 0)) return { error: 'El monto debe ser mayor a 0.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

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

  const { data: payment, error } = await supabase
    .from('shared_debt_payments')
    .insert({
      shared_debt_id: debt.id,
      proposer_user_id: user.id,
      amount: input.amount,
      proposer_pillar_id: source.pillarId,
      proposer_category_id: source.categoryId,
      status: 'pending',
    })
    .select('id')
    .single()
  if (error) {
    console.error('[proposeSharedPayment] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos proponer el pago. Prueba de nuevo.' }
  }

  revalidateShared()
  return { paymentId: payment.id }
}

export async function rejectSharedPayment(input: { paymentId: string; note?: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

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
    return { error: 'No pudimos rechazar el pago. Prueba de nuevo.' }
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
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  // Validación rápida del lado del cliente/servidor Next para dar un buen
  // mensaje de error — la seguridad real la vuelve a chequear
  // confirm_shared_payment() adentro de la base.
  const source = await validatePillarSource(supabase, user.id, input.pillarId, input.categoryId)
  if (source.error) return { error: source.error }

  const { error } = await supabase.rpc('confirm_shared_payment', {
    p_payment_id: input.paymentId,
    p_confirmer_pillar_id: source.pillarId,
    p_confirmer_category_id: source.categoryId,
    p_date: todayIn(await getUserTimeZone(supabase, user.id)).iso,
  })
  if (error) {
    console.error('[confirmSharedPayment] rpc error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: error.message || 'No pudimos confirmar el pago. Prueba de nuevo.' }
  }

  revalidateShared()
  return {}
}

// ============================================================================
// Vincular por link (migración 0025) — alternativa a buscar por email/
// username: el creador arma los datos sin elegir contraparte, genera un
// link, y quien lo abre ve una pantalla de confirmación ("X quiere vincular
// esta deuda con vos") con un botón Aceptar. Recién ahí se crea la fila real
// de shared_debts — nunca al solo abrir el link.
// ============================================================================

export type CreateSharedDebtLinkInvite = {
  direction: 'yo_debo' | 'me_deben'
  name: string
  description?: string | null
  totalAmount: number
  autoPay?: AutoPayFrequencyInput
}

export async function createSharedDebtLinkInvite(
  input: CreateSharedDebtLinkInvite
): Promise<{ token: string } | { error: string }> {
  const name = input.name.trim()
  if (!name) return { error: 'Ingresa un nombre para esta deuda.' }
  if (name.length > 60) return { error: 'El nombre es demasiado largo.' }
  if (!(input.totalAmount > 0)) return { error: 'El monto debe ser mayor a 0.' }

  if (input.autoPay) {
    const frequencyError = validateAutoPayFrequency(input.autoPay, input.totalAmount)
    if (frequencyError) return { error: frequencyError }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { data, error } = await supabase
    .from('shared_debt_link_invites')
    .insert({
      created_by: user.id,
      direction: input.direction,
      name,
      description: input.description?.trim() || null,
      total_amount: input.totalAmount,
      auto_pay_amount: input.autoPay?.amount ?? null,
      auto_pay_start_date: input.autoPay?.startDate ?? null,
      auto_pay_interval_unit: input.autoPay?.intervalUnit ?? null,
      auto_pay_interval_count: input.autoPay?.intervalCount ?? null,
    })
    .select('token')
    .single()
  if (error) {
    console.error('[createSharedDebtLinkInvite] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos crear el link. Prueba de nuevo.' }
  }

  return { token: data.token }
}

export type SharedDebtLinkInvitePreview = {
  name: string
  description: string | null
  totalAmount: number
  direction: 'yo_debo' | 'me_deben'
  creatorName: string
  status: 'pending' | 'used' | 'revoked'
}

export async function getSharedDebtLinkInvite(
  token: string
): Promise<SharedDebtLinkInvitePreview | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { data, error } = await supabase.rpc('get_shared_debt_link_invite', { p_token: token })
  if (error) {
    console.error('[getSharedDebtLinkInvite] rpc error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
    return { error: 'No pudimos abrir este link. Prueba de nuevo.' }
  }
  const row = data?.[0]
  if (!row) return { error: 'Este link no es válido.' }

  return {
    name: row.name,
    description: row.description,
    totalAmount: row.total_amount,
    direction: row.direction,
    creatorName: row.creator_name,
    status: row.status,
  }
}

export async function acceptSharedDebtLinkInvite(
  token: string
): Promise<{ role: 'debtor' | 'creditor' } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { data, error } = await supabase.rpc('accept_shared_debt_link_invite', { p_token: token })
  if (error) {
    console.error('[acceptSharedDebtLinkInvite] rpc error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
    return { error: error.message || 'No pudimos aceptar este link. Prueba de nuevo.' }
  }
  const row = data?.[0]
  if (!row) return { error: 'No pudimos aceptar este link. Prueba de nuevo.' }

  revalidateShared()
  return { role: row.your_role }
}

export async function revokeSharedDebtLinkInvite(input: { token: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { error } = await supabase
    .from('shared_debt_link_invites')
    .update({ status: 'revoked' })
    .eq('token', input.token)
    .eq('created_by', user.id)
    .eq('status', 'pending')
  if (error) {
    console.error('[revokeSharedDebtLinkInvite] update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos cancelar el link. Prueba de nuevo.' }
  }

  revalidateShared()
  return {}
}

// ============================================================================
// QR de cobro y comprobante de pago (migración 0026) — solo deudas
// vinculadas: el deudor ya es un usuario real, así que puede ver el QR del
// acreedor y adjuntar su comprobante todo adentro de la app. Las políticas
// de storage.objects son las que de verdad deciden quién puede leer/escribir
// cada archivo (ver la migración) — esto solo arma el pedido y valida antes
// para dar buenos mensajes de error.
// ============================================================================

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export async function getCreditorPaymentQrUrl(input: {
  sharedDebtId: string
}): Promise<{ qrUrl: string | null } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  // El perfil del acreedor no es legible por el deudor (RLS: cada uno ve solo
  // el suyo), así que la ruta del QR sale de una función que valida la
  // relación y entrega únicamente ese dato (migración 0032).
  const { data: qrPath, error: pathError } = await supabase.rpc('get_creditor_payment_qr_path', {
    p_shared_debt_id: input.sharedDebtId,
  })
  if (pathError) {
    console.error('[getCreditorPaymentQrUrl] qr path error:', pathError)
    return { error: 'No pudimos cargar el QR. Prueba de nuevo.' }
  }
  if (!qrPath) return { qrUrl: null }

  const { data: signed, error } = await supabase.storage.from('payment-media').createSignedUrl(qrPath, 60 * 10)
  if (error) {
    console.error('[getCreditorPaymentQrUrl] signed url error:', error)
    return { error: 'No pudimos cargar el QR. Prueba de nuevo.' }
  }

  return { qrUrl: signed.signedUrl }
}

export async function uploadPaymentReceipt(formData: FormData): Promise<{ error?: string }> {
  const paymentId = String(formData.get('paymentId') ?? '')
  const file = formData.get('file')
  if (!paymentId) return { error: 'Pago inválido.' }
  if (!(file instanceof File) || file.size === 0) return { error: 'Elige una imagen.' }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return { error: 'Tiene que ser una imagen (PNG, JPG o WEBP).' }
  if (file.size > MAX_IMAGE_BYTES) return { error: 'La imagen no puede pesar más de 5 MB.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { data: payment } = await supabase
    .from('shared_debt_payments')
    .select('id')
    .eq('id', paymentId)
    .eq('proposer_user_id', user.id)
    .maybeSingle()
  if (!payment) return { error: 'Pago inválido.' }

  // 3 partes ("receipts/{payment_id}/receipt"): la política de
  // storage.objects usa storage.foldername(name)[2] para saber a qué pago
  // pertenece — con 2 partes ese elemento no existe (ver el mismo comentario
  // en mas/actions.ts uploadPaymentQr).
  const path = `receipts/${paymentId}/receipt`
  const { error: uploadError } = await supabase.storage
    .from('payment-media')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) {
    console.error('[uploadPaymentReceipt] upload error:', uploadError)
    return { error: 'No pudimos subir el comprobante. Prueba de nuevo.' }
  }

  // Un UPDATE directo no sirve: RLS no deja al deudor tocar shared_debt_payments
  // y el UPDATE "tiene éxito" con 0 filas. La función (migración 0032) valida
  // que el pago sea suyo y esté pendiente, y falla si no actualizó exactamente
  // una fila — así nunca se responde "listo" sin que el comprobante quede.
  const { error } = await supabase.rpc('attach_payment_receipt', { p_payment_id: paymentId, p_path: path })
  if (error) {
    console.error('[uploadPaymentReceipt] update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
    return { error: 'No pudimos guardar el comprobante. Prueba de nuevo.' }
  }

  revalidateShared()
  return {}
}

export async function getPaymentReceiptUrl(input: {
  paymentId: string
}): Promise<{ receiptUrl: string | null } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { data: payment } = await supabase
    .from('shared_debt_payments')
    .select('receipt_path, shared_debt_id')
    .eq('id', input.paymentId)
    .maybeSingle()
  if (!payment) return { error: 'Pago inválido.' }
  if (!payment.receipt_path) return { receiptUrl: null }

  // Confirma que quien pide sea parte de esa deuda (debtor o creditor) — la
  // policy de storage ya lo exige igual, esto es para un buen mensaje.
  const { data: debt } = await supabase
    .from('shared_debts')
    .select('id')
    .eq('id', payment.shared_debt_id)
    .or(`debtor_user_id.eq.${user.id},creditor_user_id.eq.${user.id}`)
    .maybeSingle()
  if (!debt) return { error: 'No tienes acceso a este comprobante.' }

  const { data: signed, error } = await supabase.storage
    .from('payment-media')
    .createSignedUrl(payment.receipt_path, 60 * 10)
  if (error) {
    console.error('[getPaymentReceiptUrl] signed url error:', error)
    return { error: 'No pudimos cargar el comprobante. Prueba de nuevo.' }
  }

  return { receiptUrl: signed.signedUrl }
}
