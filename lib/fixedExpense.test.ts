import { describe, expect, it } from 'vitest'
import {
  fixedExpenseExtraThisMonth,
  isFixedExpenseCategory,
  isFixedExpensePending,
  lastFixedExpensePaymentDate,
} from '@/lib/fixedExpense'

describe('gasto fijo pagado o pendiente (H03)', () => {
  const dueDate = '2026-10-05'

  it('un reparto posterior al vencimiento NO cuenta como pago', () => {
    const tx = [{ amount: 500, date: '2026-10-08' }]
    expect(isFixedExpensePending(dueDate, lastFixedExpensePaymentDate(tx))).toBe(true)
  })

  it('un ingreso extra posterior al vencimiento tampoco cuenta como pago', () => {
    const tx = [{ amount: 100, date: '2026-10-06' }]
    expect(isFixedExpensePending(dueDate, lastFixedExpensePaymentDate(tx))).toBe(true)
  })

  it('un gasto con fecha igual o posterior al vencimiento sí lo deja pagado', () => {
    expect(isFixedExpensePending(dueDate, lastFixedExpensePaymentDate([{ amount: -500, date: '2026-10-05' }]))).toBe(false)
    expect(isFixedExpensePending(dueDate, lastFixedExpensePaymentDate([{ amount: -500, date: '2026-10-07' }]))).toBe(false)
  })

  it('el pago del vencimiento anterior no cubre la cuota de este', () => {
    const tx = [{ amount: -500, date: '2026-09-05' }]
    expect(isFixedExpensePending(dueDate, lastFixedExpensePaymentDate(tx))).toBe(true)
  })

  it('sin movimientos, la cuota está pendiente', () => {
    expect(isFixedExpensePending(dueDate, lastFixedExpensePaymentDate([]))).toBe(true)
  })

  it('con un reparto y un gasto, manda el gasto', () => {
    const tx = [
      { amount: 500, date: '2026-10-08' },
      { amount: -500, date: '2026-10-05' },
    ]
    expect(isFixedExpensePending(dueDate, lastFixedExpensePaymentDate(tx))).toBe(false)
  })
})

describe('categoría con monto fijo: gasto fijo o aporte mensual (H12)', () => {
  it('en Gasto, una categoría con monto fijo es un gasto fijo (se rechaza como origen/destino)', () => {
    expect(isFixedExpenseCategory('gasto', 500)).toBe(true)
  })

  it('en Ahorro e Inversión el monto fijo es el aporte mensual, no un gasto fijo', () => {
    expect(isFixedExpenseCategory('ahorro', 300)).toBe(false)
    expect(isFixedExpenseCategory('inversion', 200)).toBe(false)
  })

  it('una categoría sin monto fijo nunca es un gasto fijo', () => {
    expect(isFixedExpenseCategory('gasto', null)).toBe(false)
  })
})

describe('aumento del presupuesto de un gasto fijo este mes (H02)', () => {
  it('el reparto mensual NO cuenta como aumento (monto 500, reparto 500 → extra 0)', () => {
    expect(fixedExpenseExtraThisMonth([{ amount: 500, is_allocation: true }])).toBe(0)
  })

  it('un aumento real de 100 sí suma, aunque haya reparto (asignado 500 + 100 = 600)', () => {
    const extra = fixedExpenseExtraThisMonth([
      { amount: 500, is_allocation: true },
      { amount: 100, is_allocation: false },
    ])
    expect(500 + extra).toBe(600)
  })

  it('los gastos no cuentan como aumento', () => {
    expect(fixedExpenseExtraThisMonth([{ amount: -200, is_allocation: false }])).toBe(0)
  })
})
