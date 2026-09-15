// Deudores (manual.md v2.0, sección 7): lo inverso de Deudas — acá el
// usuario registra a quién le prestó plata. Un cobro es un ingreso extra
// (ver app/(app)/deudores/actions.ts registerCollection).

import { createClient } from '@/lib/supabase/server'
import { todayInBolivia } from '@/lib/dashboard'
import SharedDebtsSection, { type PendingSharedPayment, type SharedDebtRow } from '../shared-debts/SharedDebtsSection'
import DeudoresClient from './DeudoresClient'
import PageReadySignal from '../PageReadySignal'

export default async function DeudoresPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // El layout ya garantiza que hay sesión y perfil; user siempre existe acá.
  const userId = user!.id

  const [{ data: debtors }, { data: pillars }, { data: categories }, { data: sharedRows }] = await Promise.all([
    supabase
      .from('debtors')
      .select('id, name, total_amount, remaining_amount, lent_date, expected_date, description, status')
      .eq('user_id', userId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false }),
    supabase.from('pillars').select('id, name, percentage').eq('user_id', userId),
    supabase.from('categories').select('id, pillar_id, name, fixed_amount').eq('user_id', userId).is('deleted_at', null),
    supabase
      .from('shared_debts')
      .select('id, name, description, total_amount, remaining_amount, status, created_by, debtor_name')
      .eq('creditor_user_id', userId)
      .neq('status', 'archived')
      .neq('status', 'rejected')
      .order('created_at', { ascending: false }),
  ])

  // "Deudas vinculadas" (rol acreedor): el nombre de la contraparte (deudor)
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
    counterpartName: r.debtor_name ?? 'esa persona',
  }))

  // Pagos propuestos (por el deudor) que este usuario, como acreedor,
  // todavía tiene que confirmar o rechazar.
  const activeSharedIds = sharedDebts.filter((d) => d.status === 'active').map((d) => d.id)
  const pendingPaymentsByDebtId: Record<string, PendingSharedPayment[]> = {}
  if (activeSharedIds.length > 0) {
    const { data: myPendingPayments } = await supabase
      .from('shared_debt_payments')
      .select('id, shared_debt_id, amount')
      .in('shared_debt_id', activeSharedIds)
      .eq('status', 'pending')
    for (const p of myPendingPayments ?? []) {
      ;(pendingPaymentsByDebtId[p.shared_debt_id] ??= []).push({
        id: p.id,
        sharedDebtId: p.shared_debt_id,
        amount: p.amount,
      })
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <PageReadySignal />
      <SharedDebtsSection
        role="creditor"
        currentUserId={userId}
        debts={sharedDebts}
        pendingPaymentsByDebtId={pendingPaymentsByDebtId}
        pillars={pillars ?? []}
        categories={categories ?? []}
      />
      <DeudoresClient
        debtors={debtors ?? []}
        pillars={pillars ?? []}
        categories={categories ?? []}
        todayIso={todayInBolivia().iso}
      />
    </div>
  )
}
