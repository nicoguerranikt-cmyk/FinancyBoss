// Gráficos de Estadísticas. Paleta categórica validada para daltonismo
// (orden fijo azul/naranja/aqua = Ahorro/Gasto/Inversión, nunca reordenada)
// y contraste en modo claro/oscuro. Mismo estilo de barra "rounded-full"
// que ya usan las barras de progreso de Deudas/Deudores, para que se sienta
// consistente con el resto de la app.

import type { PillarName } from '@/lib/dashboard'
import { formatBs } from '@/lib/format'
import type { CategoryStat, DonutSegment, PillarStat, TrendPoint } from './EstadisticasView'

const PILLAR_LABEL: Record<PillarName, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

// Orden fijo — nunca reordenar según el valor: el color identifica al
// pilar, no su magnitud.
const PILLAR_COLOR: Record<PillarName, string> = {
  ahorro: 'bg-[#2a78d6] dark:bg-[#3987e5]',
  gasto: 'bg-[#eb6834] dark:bg-[#d95926]',
  inversion: 'bg-[#1baf7a] dark:bg-[#199e70]',
}
const PILLAR_STROKE: Record<PillarName, string> = {
  ahorro: 'stroke-[#2a78d6] dark:stroke-[#3987e5] fill-[#2a78d6] dark:fill-[#3987e5]',
  gasto: 'stroke-[#eb6834] dark:stroke-[#d95926] fill-[#eb6834] dark:fill-[#d95926]',
  inversion: 'stroke-[#1baf7a] dark:stroke-[#199e70] fill-[#1baf7a] dark:fill-[#199e70]',
}
const PILLAR_ORDER: PillarName[] = ['ahorro', 'gasto', 'inversion']

// Un "medidor" por pilar: cuánto había disponible (presupuesto + arrastre)
// vs. cuánto se usó, con el saldo final destacado. Reemplaza las tarjetas
// de texto sueltas — toda la info vive acá.
export function PillarMeters({ pillarStats }: { pillarStats: PillarStat[] }) {
  return (
    <div className="flex flex-col gap-4">
      {pillarStats.map((p) => {
        const available = p.budgeted + p.carriedIn
        const overBudget = p.saldo < 0
        const usedPct = available > 0 ? Math.min(100, Math.max(0, ((available - p.saldo) / available) * 100)) : 0

        return (
          <div key={p.pillar} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">{PILLAR_LABEL[p.pillar]}</span>
              <span className={`text-xs font-medium ${overBudget ? 'text-red-600' : 'text-zinc-500'}`}>
                {overBudget ? 'Excedido' : `${Math.round(usedPct)}% usado`}
              </span>
            </div>

            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className={`h-1.5 rounded-full ${overBudget ? 'bg-red-600' : PILLAR_COLOR[p.pillar]}`}
                style={{ width: `${overBudget ? 100 : usedPct}%` }}
              />
            </div>

            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-xs text-zinc-500">
                Disponible: {formatBs(available)} Bs
                {p.carriedIn !== 0 && ` (${formatBs(p.budgeted)} + ${formatBs(p.carriedIn)} de arrastre)`}
              </span>
              <span
                className={`text-sm font-semibold tabular-nums ${overBudget ? 'text-red-600' : ''}`}
              >
                Saldo: {formatBs(p.saldo)} Bs
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Tendencia mensual: un mini-gráfico de línea por pilar (small multiples,
// no un solo eje compartido — Ahorro/Inversión suelen acumular mucho más
// que Gasto, meterlos en la misma escala aplastaría a Gasto).
export function TrendCharts({ trendPoints }: { trendPoints: TrendPoint[] }) {
  if (trendPoints.length < 2) {
    return <p className="text-sm text-zinc-500">Hace falta más de un mes de historial para ver la tendencia.</p>
  }

  const width = 280
  const height = 56
  const pad = 6
  const stepX = (width - pad * 2) / (trendPoints.length - 1)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {PILLAR_ORDER.map((pillar) => {
        const values = trendPoints.map((p) => p.saldoByPillar[pillar] ?? 0)
        const max = Math.max(0, ...values)
        const min = Math.min(0, ...values)
        const domain = max - min || 1
        const toY = (v: number) => height - pad - ((v - min) / domain) * (height - pad * 2)
        const zeroY = toY(0)

        const coords = values.map((v, i) => [pad + i * stepX, toY(v)] as const)
        const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
        const areaPath = `${linePath} L${coords[coords.length - 1][0]},${height - pad} L${coords[0][0]},${height - pad} Z`
        const last = values[values.length - 1]

        return (
          <div key={pillar} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{PILLAR_LABEL[pillar]}</span>
              <span className={`tabular-nums ${last < 0 ? 'text-red-600' : 'text-zinc-500'}`}>
                {formatBs(last)} Bs
              </span>
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} className="mt-1 w-full" preserveAspectRatio="none">
              {min < 0 && max > 0 && (
                <line
                  x1={pad}
                  x2={width - pad}
                  y1={zeroY}
                  y2={zeroY}
                  className="stroke-zinc-300 dark:stroke-zinc-600"
                  strokeWidth={1}
                />
              )}
              <path d={areaPath} className={PILLAR_STROKE[pillar]} stroke="none" opacity={0.12} />
              <path
                d={linePath}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={PILLAR_STROKE[pillar]}
              />
              {coords.map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={i === coords.length - 1 ? 3.5 : 2.5}
                  className={`${PILLAR_STROKE[pillar]} stroke-white dark:stroke-zinc-950`}
                  strokeWidth={2}
                />
              ))}
            </svg>
            <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
              {trendPoints.map((p, i) => (
                <span key={i}>{p.label}</span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// 8 pasos categóricos validados para daltonismo, en orden fijo. El octavo
// (gris) es el balde "Otros" — nunca se genera un color extra para una
// novena categoría, se pliega ahí (ver page.tsx).
const DONUT_HEX: { light: string; dark: string }[] = [
  { light: '#2a78d6', dark: '#3987e5' },
  { light: '#eb6834', dark: '#d95926' },
  { light: '#1baf7a', dark: '#199e70' },
  { light: '#eda100', dark: '#c98500' },
  { light: '#e87ba4', dark: '#d55181' },
  { light: '#4a3aa7', dark: '#9085e9' },
  { light: '#e34948', dark: '#e66767' },
  { light: '#898781', dark: '#898781' },
]

export function CategoryDonut({ segments }: { segments: DonutSegment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  if (total <= 0) return <p className="text-sm text-zinc-500">Sin gastos de Gasto categorizados este mes.</p>

  const stops = segments.reduce<Array<DonutSegment & { startPct: number; endPct: number }>>((acc, s) => {
    const before = acc.length > 0 ? acc[acc.length - 1].endPct : 0
    const endPct = before + (s.value / total) * 100
    acc.push({ ...s, startPct: before, endPct })
    return acc
  }, [])

  // Nada de clases de Tailwind armadas con un índice en runtime (ej.
  // `[--donut-${i}:...]`): Tailwind solo genera CSS para clases que puede
  // leer como texto literal en el código, así que esas nunca se generan y
  // el degradé sale invisible. En cambio: colores por `style` (siempre
  // funciona en runtime) y dos versiones (clara/oscura) alternadas con
  // clases fijas `dark:hidden` / `hidden dark:block`, que sí son literales.
  const gradientFor = (mode: 'light' | 'dark') =>
    `conic-gradient(${stops.map((s) => `${DONUT_HEX[s.colorIndex][mode]} ${s.startPct}% ${s.endPct}%`).join(', ')})`

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-28 w-28 shrink-0 rounded-full dark:hidden" style={{ background: gradientFor('light') }}>
        <div className="absolute inset-3 rounded-full bg-white" />
      </div>
      <div
        className="relative hidden h-28 w-28 shrink-0 rounded-full dark:block"
        style={{ background: gradientFor('dark') }}
      >
        <div className="absolute inset-3 rounded-full bg-zinc-950" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        {stops.map((s) => (
          <div key={s.name} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full dark:hidden"
              style={{ backgroundColor: DONUT_HEX[s.colorIndex].light }}
            />
            <span
              className="hidden h-2.5 w-2.5 shrink-0 rounded-full dark:inline-block"
              style={{ backgroundColor: DONUT_HEX[s.colorIndex].dark }}
            />
            <span className="truncate text-zinc-500" title={s.name}>
              {s.name}
            </span>
            <span className="ml-auto shrink-0 font-medium tabular-nums">
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CategoryBarChart({ categoryStats }: { categoryStats: CategoryStat[] }) {
  const top = categoryStats.slice(0, 8)
  const max = Math.max(1, ...top.map((c) => c.spent))

  return (
    <div className="flex flex-col gap-3">
      {top.map((c) => {
        const width = (c.spent / max) * 100
        return (
          <div key={c.name} className="flex items-center gap-3">
            <span className="w-20 shrink-0 truncate text-xs text-zinc-500" title={c.name}>
              {c.name}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-1.5 rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${width}%` }} />
            </div>
            <span className="w-20 shrink-0 text-right text-sm tabular-nums">{formatBs(c.spent)} Bs</span>
          </div>
        )
      })}
    </div>
  )
}
