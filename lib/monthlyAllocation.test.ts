import { describe, expect, it } from 'vitest'
import { computeMonthlyAllocation, type AllocationCategory } from '@/lib/monthlyAllocation'

const cents = (rows: { amount: number }[]) => Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100)

describe('computeMonthlyAllocation — reparto por categoría', () => {
  it('las categorías con monto lo reciben y el resto va a "general"', () => {
    const cats: AllocationCategory[] = [
      { id: 'c1', fixedAmount: 500, isGeneral: false },
      { id: 'g', fixedAmount: null, isGeneral: true },
    ]
    const rows = computeMonthlyAllocation(2000, cats)
    expect(rows.find((r) => r.categoryId === 'c1')!.amount).toBe(500)
    expect(rows.find((r) => r.categoryId === 'g')!.amount).toBe(1500)
  })

  it('si los montos pasan el presupuesto se escalan, y la suma es EXACTAMENTE el presupuesto (sin perder centavos)', () => {
    const cats: AllocationCategory[] = [
      { id: 'c1', fixedAmount: 100, isGeneral: false },
      { id: 'c2', fixedAmount: 100, isGeneral: false },
      { id: 'c3', fixedAmount: 100, isGeneral: false },
      { id: 'g', fixedAmount: null, isGeneral: true },
    ]
    const rows = computeMonthlyAllocation(100, cats)
    expect(cents(rows)).toBe(10000)
    // Cada monto ya está en centavos exactos (no quedan fracciones).
    for (const r of rows) expect(r.amount).toBe(Math.round(r.amount * 100) / 100)
  })

  it('un presupuesto con centavos se conserva completo', () => {
    const cats: AllocationCategory[] = [
      { id: 'c1', fixedAmount: 10.5, isGeneral: false },
      { id: 'g', fixedAmount: null, isGeneral: true },
    ]
    const rows = computeMonthlyAllocation(100.25, cats)
    expect(cents(rows)).toBe(10025)
  })
})
