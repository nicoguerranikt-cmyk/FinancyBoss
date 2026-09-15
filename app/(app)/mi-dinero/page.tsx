// Mi Dinero (manual.md v2.0, sección 9): acá el usuario ve sus 3 pilares y
// edita cómo está distribuido su ingreso entre ellos (% conjunto, deben
// sumar 100). Categorías, saldo acumulado real e historial de movimientos
// viven un nivel más adentro (click en un pilar), en /mi-dinero/[pillarId].

import { createClient } from '@/lib/supabase/server'
import { formatBs } from '@/lib/format'
import type { PillarName } from '@/lib/dashboard'
import Link from '../AppLink'
import MiDineroClient from './MiDineroClient'
import PageReadySignal from '../PageReadySignal'

const PILLAR_ORDER: PillarName[] = ['ahorro', 'gasto', 'inversion']
const PILLAR_LABEL: Record<PillarName, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

type PillarRow = { id: string; name: PillarName; percentage: number }

export default async function MiDineroPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // El layout ya garantiza que hay sesión y perfil; user siempre existe acá.
  const userId = user!.id

  const [{ data: pillars }, { data: transactions }] = await Promise.all([
    supabase.from('pillars').select('id, name, percentage').eq('user_id', userId),
    supabase.from('transactions').select('pillar_id, amount').eq('user_id', userId),
  ])

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

      <MiDineroClient pillars={sortedPillars} />

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Tus pilares</h2>
        <div className="mt-3 flex flex-col gap-2">
          {sortedPillars.map((pillar) => (
            <Link
              key={pillar.id}
              href={`/mi-dinero/${pillar.id}`}
              className="flex items-center justify-between rounded-xl border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <div>
                <p className="font-medium">{PILLAR_LABEL[pillar.name]}</p>
                <p className="text-sm text-zinc-500">{pillar.percentage}% de tu ingreso</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatBs(accumulatedByPillarId[pillar.id] ?? 0)} Bs</p>
                <p className="text-sm text-zinc-500">acumulado</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
