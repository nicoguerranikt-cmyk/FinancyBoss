// Mi Dinero (manual.md v2.0, sección 9): acá el usuario ve sus 3 pilares y
// edita cómo está distribuido su ingreso entre ellos (montos fijos en Bs,
// migración 0020 — ya no %). Categorías, saldo acumulado real e historial
// de movimientos viven un nivel más adentro (click en un pilar), en
// /mi-dinero/[pillarId].

import { createClient } from '@/lib/supabase/server'
import { formatBs } from '@/lib/format'
import type { PillarName } from '@/lib/dashboard'
import { PILLAR_COLOR, PILLAR_TINT, PILLAR_BORDER, PILLAR_TEXT } from '@/lib/pillarColors'
import Link from '../AppLink'
import MiDineroClient from './MiDineroClient'
import PageReadySignal from '../PageReadySignal'

const PILLAR_ORDER: PillarName[] = ['ahorro', 'gasto', 'inversion']
const PILLAR_LABEL: Record<PillarName, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

type PillarRow = { id: string; name: PillarName; monthly_amount: number }

export default async function MiDineroPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // El layout ya garantiza que hay sesión y perfil; user siempre existe acá.
  const userId = user!.id

  const [{ data: pillars }, { data: transactions }, { data: profile }, { data: freeMoneyRows }] = await Promise.all([
    supabase.from('pillars').select('id, name, monthly_amount').eq('user_id', userId),
    supabase.from('transactions').select('pillar_id, amount').eq('user_id', userId),
    supabase.from('profiles').select('base_income').eq('id', userId).single(),
    supabase.from('free_money_transactions').select('amount').eq('user_id', userId),
  ])
  const baseIncome = profile?.base_income ?? 0
  const freeMoneyAccumulated = (freeMoneyRows ?? []).reduce((sum, r) => sum + r.amount, 0)

  // El orden de fila en Postgres no está garantizado: ordenamos acá para que
  // los 3 pilares siempre aparezcan en el mismo orden en pantalla.
  const sortedPillars: PillarRow[] = [...(pillars ?? [])].sort(
    (a, b) => PILLAR_ORDER.indexOf(a.name) - PILLAR_ORDER.indexOf(b.name)
  )

  // Acumulado histórico por pilar (todas las transacciones de siempre, sin
  // filtro de mes — a diferencia del Dashboard, que sí es mensual).
  const accumulatedByPillarId: Record<string, number> = {}
  for (const t of transactions ?? []) {
    accumulatedByPillarId[t.pillar_id] = (accumulatedByPillarId[t.pillar_id] ?? 0) + t.amount
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8">
      <PageReadySignal />
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Mi Dinero</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Organizá cómo se distribuye tu ingreso entre los 3 pilares. Entrá a cada uno para ver sus
          categorías, cuánta plata tenés acumulada y el historial de movimientos.
        </p>
      </section>

      <MiDineroClient pillars={sortedPillars} baseIncome={baseIncome} />

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Tus pilares</h2>
        <div className="mt-3 flex flex-col gap-3">
          {sortedPillars.map((pillar) => {
            const accumulated = accumulatedByPillarId[pillar.id] ?? 0
            return (
              <Link
                key={pillar.id}
                href={`/mi-dinero/${pillar.id}`}
                className={`flex items-center justify-between rounded-xl border-l-4 p-4 transition-colors hover:brightness-95 dark:hover:brightness-110 ${PILLAR_BORDER[pillar.name]} ${PILLAR_TINT[pillar.name]}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${PILLAR_COLOR[pillar.name]}`}
                  >
                    {PILLAR_LABEL[pillar.name].charAt(0)}
                  </span>
                  <div>
                    <p className="font-medium">{PILLAR_LABEL[pillar.name]}</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {formatBs(pillar.monthly_amount)} Bs de tu ingreso
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${PILLAR_TEXT[pillar.name]}`}>{formatBs(accumulated)} Bs</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">acumulado</p>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Dinero libre</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Lo que sobra del ingreso después de tus 3 pilares. No tiene destino fijo — es tuyo para
          usar como quieras.
        </p>
        <Link
          href="/mi-dinero/libre"
          className="mt-3 flex items-center justify-between rounded-xl border-l-4 border-brand-violet bg-brand-violet/10 p-4 transition-colors hover:brightness-95 dark:hover:brightness-110"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-violet text-sm font-semibold text-white">
              $
            </span>
            <p className="font-medium">Dinero libre</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-brand-violet">{formatBs(freeMoneyAccumulated)} Bs</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">acumulado</p>
          </div>
        </Link>
      </section>
    </div>
  )
}
