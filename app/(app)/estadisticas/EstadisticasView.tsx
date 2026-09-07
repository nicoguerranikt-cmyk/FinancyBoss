// Vista de Estadísticas (manual.md v2.0, sección 8). Componente de servidor
// puro (sin 'use client'): es de solo lectura, la navegación entre meses es
// un <Link> normal con query params — no hace falta estado en el navegador.

import Link from 'next/link'
import type { PillarName } from '@/lib/dashboard'
import { formatBs } from '@/lib/format'
import { CategoryBarChart, CategoryDonut, PillarMeters, TrendCharts } from './ChartBars'

const MONTH_LABEL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export type PillarStat = { pillar: PillarName; budgeted: number; carriedIn: number; saldo: number; closed: boolean }
export type TrendPoint = { label: string; saldoByPillar: Record<PillarName, number> }
export type CategoryStat = { name: string; pillarLabel: string; budgeted: number | null; spent: number }
// colorIndex fijo (0-6 = categorías reales en orden, 7 = "Otros"/gris
// siempre): así "Otros" nunca hereda el color de una categoría real solo
// por caer en esa posición de la lista.
export type DonutSegment = { name: string; value: number; colorIndex: number }
export type DebtStat = { name: string; remainingToday: number; paidThisMonth: number }
export type DebtorStat = { name: string; remainingToday: number; collectedThisMonth: number }

function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}
function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

export default function EstadisticasView({
  year,
  month,
  isCurrentMonth,
  canGoPrev,
  canGoNext,
  totalIncome,
  pillarStats,
  trendPoints,
  categoryStats,
  donutSegments,
  dominoCount,
  mostAffected,
  debtStats,
  debtorStats,
}: {
  year: number
  month: number
  isCurrentMonth: boolean
  canGoPrev: boolean
  canGoNext: boolean
  totalIncome: number
  pillarStats: PillarStat[]
  trendPoints: TrendPoint[]
  categoryStats: CategoryStat[]
  donutSegments: DonutSegment[]
  dominoCount: number
  mostAffected: { name: string; amount: number }[]
  debtStats: DebtStat[]
  debtorStats: DebtorStat[]
}) {
  const prev = prevMonth(year, month)
  const next = nextMonth(year, month)

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Estadísticas</h1>

        <div className="mt-3 flex items-center justify-between gap-2">
          {canGoPrev ? (
            <Link
              href={`/estadisticas?year=${prev.year}&month=${prev.month}`}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              ← Anterior
            </Link>
          ) : (
            <span />
          )}

          <span className="text-sm font-medium">
            {MONTH_LABEL[month - 1]} {year}
            {isCurrentMonth ? ' (en curso)' : ' — cerrado'}
          </span>

          {canGoNext ? (
            <Link
              href={`/estadisticas?year=${next.year}&month=${next.month}`}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Siguiente →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </section>

      <section>
        <p className="text-sm text-zinc-500">Ingreso total del mes</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{formatBs(totalIncome)} Bs</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Por pilar</h2>
        <div className="mt-3">
          <PillarMeters pillarStats={pillarStats} />
        </div>
        {!isCurrentMonth && (
          <p className="mt-2 text-xs text-zinc-500">
            Este mes ya cerró — el saldo mostrado es lo que se acumuló para el mes siguiente.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Tendencia</h2>
        <p className="mt-1 text-sm text-zinc-500">Saldo de cada pilar en los últimos meses.</p>
        <div className="mt-3">
          <TrendCharts trendPoints={trendPoints} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Por categoría</h2>

        <h3 className="mt-3 text-sm font-medium text-zinc-500">Proporción del gasto</h3>
        <div className="mt-2">
          <CategoryDonut segments={donutSegments} />
        </div>

        {categoryStats.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No hubo gastos con categoría este mes.</p>
        ) : (
          <>
            <h3 className="mt-4 text-sm font-medium text-zinc-500">Ranking</h3>
            <div className="mt-2">
              <CategoryBarChart categoryStats={categoryStats} />
            </div>
            <div className="mt-3 flex flex-col gap-2">
            {categoryStats.map((c) => (
              <div key={c.name} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-zinc-500">{c.pillarLabel}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-500">
                  Gastado: {formatBs(c.spent)} Bs
                  {c.budgeted !== null && ` de ${formatBs(c.budgeted)} Bs fijos`}
                </p>
              </div>
            ))}
            </div>
          </>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Efecto dominó</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Se activó {dominoCount} {dominoCount === 1 ? 'vez' : 'veces'} este mes.
        </p>
        {mostAffected.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-500">
            {mostAffected.map((m) => (
              <li key={m.name}>
                {m.name}: {formatBs(m.amount)} Bs
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Deudas</h2>
        {debtStats.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Sin actividad de deudas este mes.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {debtStats.map((d) => (
              <div key={d.name} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="font-medium">{d.name}</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Pagado este mes: {formatBs(d.paidThisMonth)} Bs — Pendiente hoy: {formatBs(d.remainingToday)} Bs
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Deudores</h2>
        {debtorStats.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Sin actividad de deudores este mes.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {debtorStats.map((d) => (
              <div key={d.name} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="font-medium">{d.name}</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Cobrado este mes: {formatBs(d.collectedThisMonth)} Bs — Pendiente hoy: {formatBs(d.remainingToday)} Bs
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
