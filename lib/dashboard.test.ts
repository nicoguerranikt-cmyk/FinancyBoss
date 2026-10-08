import { describe, expect, it } from 'vitest'
import {
  computeDashboard,
  dailyBudgetFromFreeMoney,
  incomeCoverage,
  type PillarRow,
  type TransactionRow,
} from '@/lib/dashboard'

const TODAY = { year: 2026, month: 10, day: 10 }

const pillars: PillarRow[] = [
  { id: 'p-ahorro', name: 'ahorro', monthly_amount: 0 },
  { id: 'p-gasto', name: 'gasto', monthly_amount: 1000 },
  { id: 'p-inversion', name: 'inversion', monthly_amount: 0 },
]

function saldoGasto(transactionsThisMonth: TransactionRow[]) {
  const dashboard = computeDashboard({ baseIncome: 1000, pillars, transactionsThisMonth, today: TODAY })
  return dashboard.pillars.find((p) => p.pillar === 'gasto')!.saldo
}

describe('computeDashboard — saldo del pilar Gasto', () => {
  // H01: el reparto mensual ya está contado en el presupuesto del pilar; si se
  // sumara otra vez como movimiento, el saldo quedaría inflado.
  it('no cuenta el reparto como plata nueva (presupuesto 1000, reparto 1000, gasto 1200 → -200)', () => {
    const saldo = saldoGasto([
      { pillar_id: 'p-gasto', category_id: 'c1', amount: 1000, is_allocation: true, kind: null },
      { pillar_id: 'p-gasto', category_id: 'c1', amount: -1200, is_allocation: false, kind: null },
    ])
    expect(saldo).toBe(-200)
  })

  it('un ingreso extra real (no reparto) sí suma al saldo', () => {
    const saldo = saldoGasto([
      { pillar_id: 'p-gasto', category_id: 'c1', amount: 1000, is_allocation: true, kind: null },
      { pillar_id: 'p-gasto', category_id: 'c1', amount: 300, is_allocation: false, kind: null },
      { pillar_id: 'p-gasto', category_id: 'c1', amount: -200, is_allocation: false, kind: null },
    ])
    expect(saldo).toBe(1100)
  })
})

// H04: el Dashboard y el reparto a categorías usan la MISMA reducción, así que
// no pueden mostrar presupuestos distintos cuando el ingreso no alcanza.
describe('incomeCoverage — ingreso que no cubre los pilares', () => {
  const tres: PillarRow[] = [
    { id: 'a', name: 'ahorro', monthly_amount: 300 },
    { id: 'g', name: 'gasto', monthly_amount: 700 },
    { id: 'i', name: 'inversion', monthly_amount: 200 },
  ]

  it('ingreso 600 con pilares que suman 1200: faltan 600 y se reduce a la mitad', () => {
    const c = incomeCoverage(600, tres)
    expect(c.committed).toBe(1200)
    expect(c.shortfall).toBe(600)
    expect(c.isShort).toBe(true)
    expect(c.scaleFactor).toBe(0.5)
  })

  it('los pilares reducidos suman exactamente el ingreso', () => {
    const c = incomeCoverage(600, tres)
    const total = tres.reduce((sum, p) => sum + p.monthly_amount * c.scaleFactor, 0)
    expect(total).toBeCloseTo(600, 6)
  })

  it('si el ingreso alcanza (o sobra) no hay faltante ni reducción', () => {
    for (const income of [1200, 5000]) {
      const c = incomeCoverage(income, tres)
      expect(c.isShort).toBe(false)
      expect(c.shortfall).toBe(0)
      expect(c.scaleFactor).toBe(1)
    }
  })

  it('el presupuesto del Dashboard coincide con el monto reducido', () => {
    const dashboard = computeDashboard({ baseIncome: 600, pillars: tres, transactionsThisMonth: [], today: TODAY })
    const gasto = dashboard.pillars.find((p) => p.pillar === 'gasto')!
    expect(gasto.budget).toBe(700 * incomeCoverage(600, tres).scaleFactor)
  })
})

// Gastos del día a día (migración 0041): no tienen presupuesto propio y NO bajan
// el saldo de Gasto; la plata sale de Dinero libre o de Ahorro.
describe('gastos del día a día — no mueven el saldo de Gasto', () => {
  const pilares: PillarRow[] = [
    { id: 'p-ahorro', name: 'ahorro', monthly_amount: 300 },
    { id: 'p-gasto', name: 'gasto', monthly_amount: 800 },
    { id: 'p-inversion', name: 'inversion', monthly_amount: 0 },
  ]
  const saldoDe = (nombre: string, transactionsThisMonth: TransactionRow[]) =>
    computeDashboard({ baseIncome: 3000, pillars: pilares, transactionsThisMonth, today: TODAY }).pillars.find(
      (p) => p.pillar === nombre
    )!.saldo

  it('un gasto del día a día (daily_spend) no baja el saldo de Gasto', () => {
    const tx: TransactionRow[] = [
      { pillar_id: 'p-gasto', category_id: 'comida', amount: -12.5, is_allocation: false, kind: 'daily_spend' },
    ]
    expect(saldoDe('gasto', tx)).toBe(800)
  })

  it('pagar un gasto fijo (movimiento normal) sí baja el saldo de Gasto', () => {
    const tx: TransactionRow[] = [
      { pillar_id: 'p-gasto', category_id: 'alquiler', amount: -800, is_allocation: false, kind: null },
    ]
    expect(saldoDe('gasto', tx)).toBe(0)
  })

  it('si el gasto sale de Ahorro, el lado de origen (funding) baja el saldo de Ahorro', () => {
    const tx: TransactionRow[] = [
      { pillar_id: 'p-gasto', category_id: 'comida', amount: -12.5, is_allocation: false, kind: 'daily_spend' },
      { pillar_id: 'p-ahorro', category_id: 'fondo', amount: -12.5, is_allocation: false, kind: 'funding' },
    ]
    expect(saldoDe('ahorro', tx)).toBe(287.5)
    expect(saldoDe('gasto', tx)).toBe(800)
  })
})

describe('dailyBudgetFromFreeMoney — "Puedes gastar hoy" sale de Dinero libre', () => {
  it('1.700 de Dinero libre con 24 días por delante = 70,83 por día', () => {
    // 8 de octubre: quedan 24 días contando hoy (8 al 31).
    const d = dailyBudgetFromFreeMoney(1700, { year: 2026, month: 10, day: 8 })
    expect(d.daysRemaining).toBe(24)
    expect(d.amount).toBeCloseTo(70.8333, 3)
    expect(d.isOver).toBe(false)
  })

  it('el último día del mes todo el Dinero libre es para hoy', () => {
    expect(dailyBudgetFromFreeMoney(300, { year: 2026, month: 10, day: 31 }).amount).toBe(300)
  })

  it('sin Dinero libre no hay nada para gastar', () => {
    const d = dailyBudgetFromFreeMoney(0, { year: 2026, month: 10, day: 8 })
    expect(d.amount).toBe(0)
    expect(d.isOver).toBe(true)
  })

  it('con Dinero libre negativo tampoco, y nunca da un monto negativo', () => {
    const d = dailyBudgetFromFreeMoney(-50, { year: 2026, month: 10, day: 8 })
    expect(d.amount).toBe(0)
    expect(d.isOver).toBe(true)
  })
})
