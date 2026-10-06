// Deudas (manual.md v2.0, sección 6): una deuda es solo un registro — no
// resta nada hasta que se registra un pago. El plan automático es un
// recordatorio: nunca se descuenta solo, el usuario confirma con un botón
// ("Ya la pagué", ver confirmAutoPayment en actions.ts).

import { createClient } from '@/lib/supabase/server'
import { dateIn, todayIn } from '@/lib/dashboard'
import { getUserTimeZone } from '@/lib/userTimezone.server'
import { lastDueOccurrence } from '@/lib/debts'
import SharedDebtsSection, {
  type PendingSharedPayment,
  type RejectedSharedPayment,
  type SharedDebtRow,
} from '../shared-debts/SharedDebtsSection'
import DeudasClient from './DeudasClient'
import NewDebtForm from './NewDebtForm'
import PageReadySignal from '../PageReadySignal'

export default async function DeudasPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // El layout ya garantiza que hay sesión y perfil; user siempre existe acá.
  const userId = user!.id

  const timeZone = await getUserTimeZone(supabase, userId)
  const today = todayIn(timeZone)

  const [{ data: debts }, { data: pillars }, { data: categories }, { data: sharedRows }] = await Promise.all([
    supabase
      .from('debts')
      .select(
        'id, name, total_amount, remaining_amount, status, auto_pay_amount, auto_pay_start_date, auto_pay_interval_unit, auto_pay_interval_count, auto_pay_pillar_id, auto_pay_category_id'
      )
      .eq('user_id', userId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false }),
    supabase.from('pillars').select('id, name').eq('user_id', userId),
    supabase.from('categories').select('id, pillar_id, name, fixed_amount').eq('user_id', userId).is('deleted_at', null),
    supabase
      .from('shared_debts')
      .select(
        'id, name, description, total_amount, remaining_amount, status, created_by, creditor_name, auto_pay_amount, auto_pay_start_date, auto_pay_interval_unit, auto_pay_interval_count'
      )
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

  // Recordatorio de deudas vinculadas (rol deudor): a diferencia de las
  // deudas propias, esto NUNCA registra ni propone nada solo — solo avisa
  // "te toca proponer el pago", el paso de dos manos (proponer + confirmar)
  // sigue intacto.
  const sharedDueOccurrenceById: Record<string, string> = {}
  for (const r of sharedRows ?? []) {
    if (r.status !== 'active') continue
    const due = lastDueOccurrence(r, today)
    if (due) sharedDueOccurrenceById[r.id] = due
  }
  const sharedDueIds = Object.keys(sharedDueOccurrenceById)

  let pendingSharedAutoPayIds: string[] = []
  if (sharedDueIds.length > 0) {
    const { data: myProposals } = await supabase
      .from('shared_debt_payments')
      .select('shared_debt_id, created_at')
      .eq('proposer_user_id', userId)
      .in('shared_debt_id', sharedDueIds)
    const lastProposedById: Record<string, string> = {}
    for (const p of myProposals ?? []) {
      const proposedDate = dateIn(new Date(p.created_at), timeZone)
      const pad = (n: number) => String(n).padStart(2, '0')
      const iso = `${proposedDate.year}-${pad(proposedDate.month)}-${pad(proposedDate.day)}`
      if (!lastProposedById[p.shared_debt_id] || iso > lastProposedById[p.shared_debt_id]) {
        lastProposedById[p.shared_debt_id] = iso
      }
    }
    pendingSharedAutoPayIds = sharedDueIds.filter(
      (id) => !lastProposedById[id] || lastProposedById[id] < sharedDueOccurrenceById[id]
    )
  }

  // Deudas cuyo plan automático ya tiene una cuota vencida (fecha de la
  // última cuota que corresponde según su frecuencia, ver lib/debts.ts) y
  // todavía no se confirmó ningún pago desde esa fecha.
  const dueOccurrenceByDebtId: Record<string, string> = {}
  for (const d of debts ?? []) {
    if (d.status !== 'active' || !d.auto_pay_pillar_id) continue
    const due = lastDueOccurrence(d, today)
    if (due) dueOccurrenceByDebtId[d.id] = due
  }
  const dueDebtIds = Object.keys(dueOccurrenceByDebtId)

  let pendingAutoPayIds: string[] = []
  if (dueDebtIds.length > 0) {
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('debt_id, date')
      .in('debt_id', dueDebtIds)
    const lastConfirmedByDebtId: Record<string, string> = {}
    for (const tx of existingTx ?? []) {
      if (!tx.debt_id) continue
      if (!lastConfirmedByDebtId[tx.debt_id] || tx.date > lastConfirmedByDebtId[tx.debt_id]) {
        lastConfirmedByDebtId[tx.debt_id] = tx.date
      }
    }
    pendingAutoPayIds = dueDebtIds.filter(
      (id) => !lastConfirmedByDebtId[id] || lastConfirmedByDebtId[id] < dueOccurrenceByDebtId[id]
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <PageReadySignal />
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Deudas</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Crear una deuda no resta nada. Solo un pago registrado resta, en el momento en que lo
          registras.
        </p>
      </section>
      <NewDebtForm pillars={pillars ?? []} categories={categories ?? []} todayIso={today.iso} />
      <SharedDebtsSection
        role="debtor"
        currentUserId={userId}
        debts={sharedDebts}
        pendingPaymentsByDebtId={pendingPaymentsByDebtId}
        rejectedPaymentsByDebtId={rejectedPaymentsByDebtId}
        pendingAutoPayIds={pendingSharedAutoPayIds}
        pillars={pillars ?? []}
        categories={categories ?? []}
      />
      <DeudasClient
        debts={debts ?? []}
        pillars={pillars ?? []}
        categories={categories ?? []}
        pendingAutoPayIds={pendingAutoPayIds}
        todayIso={today.iso}
      />
    </div>
  )
}
