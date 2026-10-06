import { describe, expect, it } from 'vitest'
import { computeDashboard, incomeCoverage, type PillarRow, type TransactionRow } from '@/lib/dashboard'

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
      { pillar_id: 'p-gasto', category_id: 'c1', amount: 1000, is_allocation: true },
      { pillar_id: 'p-gasto', category_id: 'c1', amount: -1200, is_allocation: false },
    ])
    expect(saldo).toBe(-200)
  })

  it('un ingreso extra real (no reparto) sí suma al saldo', () => {
    const saldo = saldoGasto([
      { pillar_id: 'p-gasto', category_id: 'c1', amount: 1000, is_allocation: true },
      { pillar_id: 'p-gasto', category_id: 'c1', amount: 300, is_allocation: false },
      { pillar_id: 'p-gasto', category_id: 'c1', amount: -200, is_allocation: false },
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
