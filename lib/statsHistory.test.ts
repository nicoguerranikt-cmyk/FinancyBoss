import { describe, expect, it } from 'vitest'
import { categoryBudgetsForMonth, incomeForMonth } from '@/lib/statsHistory'

describe('incomeForMonth — cambiar el sueldo no altera los meses pasados (H08)', () => {
  it('septiembre cerró con 3.000: sigue mostrando 3.000 aunque hoy el sueldo sea 4.000', () => {
    expect(incomeForMonth({ isCurrentMonth: false, currentBaseIncome: 4000, storedIncome: 3000 })).toBe(3000)
  })

  it('el mes en curso usa el sueldo actual', () => {
    expect(incomeForMonth({ isCurrentMonth: true, currentBaseIncome: 4000, storedIncome: 3000 })).toBe(4000)
  })

  it('un mes cerrado sin dato guardado usa el sueldo actual (como antes)', () => {
    expect(incomeForMonth({ isCurrentMonth: false, currentBaseIncome: 4000, storedIncome: null })).toBe(4000)
    expect(incomeForMonth({ isCurrentMonth: false, currentBaseIncome: 4000, storedIncome: undefined })).toBe(4000)
  })

  it('un ingreso guardado de 0 es un dato real, no "sin dato"', () => {
    expect(incomeForMonth({ isCurrentMonth: false, currentBaseIncome: 4000, storedIncome: 0 })).toBe(0)
  })
})

describe('categoryBudgetsForMonth — presupuesto = lo que se repartió ese mes', () => {
  const general = new Set(['g'])

  it('suma el reparto del mes de cada categoría con monto, sin importar su monto actual', () => {
    const budgets = categoryBudgetsForMonth(
      [
        { category_id: 'mercado', amount: 500, is_allocation: true },
        { category_id: 'g', amount: 1500, is_allocation: true },
      ],
      general
    )
    expect(budgets.get('mercado')).toBe(500)
  })

  it('la categoría general no tiene presupuesto (recibe lo que sobra)', () => {
    const budgets = categoryBudgetsForMonth([{ category_id: 'g', amount: 1500, is_allocation: true }], general)
    expect(budgets.has('g')).toBe(false)
  })

  it('un gasto o un ingreso extra no cuentan como presupuesto', () => {
    const budgets = categoryBudgetsForMonth(
      [
        { category_id: 'mercado', amount: -200, is_allocation: false },
        { category_id: 'mercado', amount: 100, is_allocation: false },
      ],
      general
    )
    expect(budgets.size).toBe(0)
  })

  it('una categoría sin reparto ese mes no tiene presupuesto', () => {
    expect(categoryBudgetsForMonth([], general).get('mercado')).toBeUndefined()
  })
})
