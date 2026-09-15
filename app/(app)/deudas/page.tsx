// Deudas (manual.md v2.0, sección 6): una deuda es solo un registro — no
// resta nada hasta que se registra un pago. El plan automático es un
// recordatorio: nunca se descuenta solo, el usuario confirma con un botón
// ("Ya la pagué", ver confirmAutoPayment en actions.ts).

import { createClient } from '@/lib/supabase/server'
import { monthRangeInBolivia, todayInBolivia } from '@/lib/dashboard'
import { isAutoPayDue } from '@/lib/debts'
import SharedDebtsSection, {
  type PendingSharedPayment,
  type RejectedSharedPayment,
  type SharedDebtRow,
} from '../shared-debts/SharedDebtsSection'
import DeudasClient from './DeudasClient'
import PageReadySignal from '../PageReadySignal'

export default async function DeudasPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // El layout ya garantiza que hay sesión y perfil; user siempre existe acá.
  const userId = user!.id

  const { start, end } = monthRangeInBolivia()
  const today = todayInBolivia()

  const [{ data: debts }, { data: pillars }, { data: categories }, { data: sharedRows }] = await Promise.all([
    supabase
      .from('debts')
      .select(
        'id, name, total_amount, remaining_amount, status, monthly_payment, auto_pay_start_year, auto_pay_start_month, auto_pay_start_day, auto_pay_pillar_id, auto_pay_category_id'
      )
      .eq('user_id', userId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false }),
    supabase.from('pillars').select('id, name, percentage').eq('user_id', userId),
    supabase.from('categories').select('id, pillar_id, name, fixed_amount').eq('user_id', userId).is('deleted_at', null),
    supabase
      .from('shared_debts')
      .select('id, name, description, total_amount, remaining_amount, status, created_by, creditor_name')
      .eq('debtor_user_id', userId)
      .neq('status', 'archived')
      .neq('status', 'rejected')
      .order('created_at', { ascending: false }),
  ])

  // "Deudas vinculadas" (rol deudor): el nombre de la contraparte (acreedor)
  // se guardó en la fila al crearla — profiles.RLS no deja consultar el
  // perfil de otro usuario, así que no hay forma de resolverlo después.
  const sharedDebts: SharedDebtRow[] = (sharedRows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    total_amount: r.total_amount,
    remaining_amount: r.remaining_amount,
    status: r.status,
    created_by: r.created_by,
    counterpartName: r.creditor_name ?? 'esa persona',
  }))

  // Rol deudor: no hay nada que confirmar de este lado (eso es del acreedor,
  // en Deudores), así que no hace falta traer pagos pendientes acá — pero sí
  // los que el acreedor rechazó, para avisarle al deudor.
  const pendingPaymentsByDebtId: Record<string, PendingSharedPayment[]> = {}
  const rejectedPaymentsByDebtId: Record<string, RejectedSharedPayment[]> = {}
  // Solo el rechazo más reciente por deuda (si no, se acumulan para
  // siempre y ensucian la pantalla — con el último alcanza como aviso).
  const { data: myRejectedPayments } = await supabase
    .from('shared_debt_payments')
    .select('id, shared_debt_id, amount, rejection_note')
    .eq('proposer_user_id', userId)
    .eq('status', 'rejected')
    .order('created_at', { ascending: false })
  for (const p of myRejectedPayments ?? []) {
    if (rejectedPaymentsByDebtId[p.shared_debt_id]) continue
    rejectedPaymentsByDebtId[p.shared_debt_id] = [
      { id: p.id, sharedDebtId: p.shared_debt_id, amount: p.amount, note: p.rejection_note },
    ]
  }

  // Deudas cuyo plan automático ya venció este mes y todavía no se confirmó.
  const dueDebtIds = (debts ?? [])
    .filter((d) => d.status === 'active' && isAutoPayDue(d, today))
    .map((d) => d.id)

  let pendingAutoPayIds: string[] = []
  if (dueDebtIds.length > 0) {
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('debt_id')
      .in('debt_id', dueDebtIds)
      .gte('date', start)
      .lte('date', end)
    const yaConfirmados = new Set((existingTx ?? []).map((r) => r.debt_id))
    pendingAutoPayIds = dueDebtIds.filter((id) => !yaConfirmados.has(id))
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <PageReadySignal />
      <SharedDebtsSection
        role="debtor"
        currentUserId={userId}
        debts={sharedDebts}
        pendingPaymentsByDebtId={pendingPaymentsByDebtId}
        rejectedPaymentsByDebtId={rejectedPaymentsByDebtId}
        pillars={pillars ?? []}
        categories={categories ?? []}
      />
      <DeudasClient
        debts={debts ?? []}
        pillars={pillars ?? []}
        categories={categories ?? []}
        pendingAutoPayIds={pendingAutoPayIds}
      />
    </div>
  )
}
