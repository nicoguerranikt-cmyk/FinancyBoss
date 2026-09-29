// Dinero libre (manual.md — migración 0021): la plata que sobra de tu
// ingreso después de los 3 montos de pilares (ver lib/dashboard.ts
// computeDashboard). Acá vive su propio historial: un crédito automático
// por cada mes que cierra (lib/monthClose.ts) más lo que el usuario cargue
// a mano, apilado por fecha.

import { createClient } from '@/lib/supabase/server'
import { daysInMonth, todayInBolivia } from '@/lib/dashboard'
import { formatBs } from '@/lib/format'
import Link from '../../AppLink'
import PageReadySignal from '../../PageReadySignal'
import LibreClient from './LibreClient'

export default async function DineroLibrePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // El layout ya garantiza que hay sesión y perfil; user siempre existe acá.
  const userId = user!.id

  const { data: movements } = await supabase
    .from('free_money_transactions')
    .select('id, amount, description, date, credit_month')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  const total = (movements ?? []).reduce((sum, m) => sum + m.amount, 0)

  const today = todayInBolivia()
  const daysRemaining = daysInMonth(today.year, today.month) - today.day + 1
  const weeksRemaining = Math.max(1, Math.ceil(daysRemaining / 7))

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <PageReadySignal />
      <section>
        <Link href="/mi-dinero" className="text-sm text-zinc-500 hover:underline">
          ← Mi Dinero
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Dinero libre</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Lo que te sobra del ingreso después de Ahorro, Gasto e Inversión. No tiene pilar ni
          categoría — es plata sin destino todavía.
        </p>
      </section>

      <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Total disponible</p>
        <p className="text-2xl font-semibold tracking-tight">{formatBs(total)} Bs</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
            <p className="text-xs text-zinc-500">Por mes</p>
            <p className="text-sm font-medium tabular-nums">{formatBs(Math.max(0, total))} Bs</p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
            <p className="text-xs text-zinc-500">Por semana</p>
            <p className="text-sm font-medium tabular-nums">
              {formatBs(Math.max(0, total) / weeksRemaining)} Bs
            </p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
            <p className="text-xs text-zinc-500">Por día</p>
            <p className="text-sm font-medium tabular-nums">
              {formatBs(Math.max(0, total) / daysRemaining)} Bs
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Tres formas de ver el mismo total: cuánto es si lo repartís en lo que queda de este mes.
        </p>
      </div>

      <LibreClient movements={movements ?? []} todayIso={today.iso} />
    </div>
  )
}
