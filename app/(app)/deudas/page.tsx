// Deudas (manual.md v2.0, sección 6): una deuda es solo un registro — no
// resta nada hasta que se registra un pago. El plan automático es un
// recordatorio: nunca se descuenta solo, el usuario confirma con un botón
// ("Ya la pagué", ver confirmAutoPayment en actions.ts).

import { createClient } from '@/lib/supabase/server'
import { monthRangeInBolivia, todayInBolivia } from '@/lib/dashboard'
import { isAutoPayDue } from '@/lib/debts'
import DeudasClient from './DeudasClient'

export default async function DeudasPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // El layout ya garantiza que hay sesión y perfil; user siempre existe acá.
  const userId = user!.id

  const { start, end } = monthRangeInBolivia()
  const today = todayInBolivia()

  const [{ data: debts }, { data: pillars }, { data: categories }] = await Promise.all([
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
  ])

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
      <DeudasClient
        debts={debts ?? []}
        pillars={pillars ?? []}
        categories={categories ?? []}
        pendingAutoPayIds={pendingAutoPayIds}
      />
    </div>
  )
}
