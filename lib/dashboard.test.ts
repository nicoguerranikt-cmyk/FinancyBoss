import { describe, expect, it } from 'vitest'
import { computeDashboard, type PillarRow, type TransactionRow } from '@/lib/dashboard'

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
