import { describe, expect, it } from 'vitest'
import {
  categoryBudgetsForMonth,
  externalExtraIncome,
  externalFreeMoneyIncome,
  incomeForMonth,
  isInternalMovement,
} from '@/lib/statsHistory'

const tx = (over: Partial<{ type: string; amount: number; is_allocation: boolean; kind: string | null }>) => ({
  type: 'extra_income',
  amount: 100,
  is_allocation: false,
  kind: null,
  ...over,
})

describe('ingreso real: los traslados y saldos iniciales no cuentan (H09)', () => {
  it('mover 100 Bs de Dinero libre a Ahorro NO es un ingreso nuevo', () => {
    expect(externalExtraIncome([tx({ amount: 100, kind: 'transfer' })])).toBe(0)
  })

  it('ingresar de verdad 100 Bs sí es un ingreso', () => {
    expect(externalExtraIncome([tx({ amount: 100 })])).toBe(100)
  })

  it('un saldo inicial ("Ahorro previo") no es un ingreso del mes', () => {
    expect(externalExtraIncome([tx({ amount: 5000, kind: 'opening_balance' })])).toBe(0)
  })

  it('el reparto mensual no es un ingreso', () => {
    expect(externalExtraIncome([tx({ amount: 1000, is_allocation: true })])).toBe(0)
  })

  it('un gasto nunca suma como ingreso', () => {
    expect(externalExtraIncome([tx({ type: 'expense', amount: -50 })])).toBe(0)
  })

  it('mezcla: solo cuenta lo real (100 de bono; el traslado y el saldo inicial no)', () => {
    expect(
      externalExtraIncome([
        tx({ amount: 100 }),
        tx({ amount: 300, kind: 'transfer' }),
        tx({ amount: 5000, kind: 'opening_balance' }),
        tx({ amount: 1000, is_allocation: true }),
      ])
    ).toBe(100)
  })

  it('isInternalMovement reconoce reparto, traslado y saldo inicial', () => {
    expect(isInternalMovement({ is_allocation: true, kind: null })).toBe(true)
    expect(isInternalMovement({ is_allocation: false, kind: 'transfer' })).toBe(true)
    expect(isInternalMovement({ is_allocation: false, kind: 'opening_balance' })).toBe(true)
    expect(isInternalMovement({ is_allocation: false, kind: null })).toBe(false)
  })
})

describe('externalFreeMoneyIncome — ingresos a Dinero libre', () => {
  it('un ingreso a mano en Dinero libre sí cuenta en el total del mes', () => {
    expect(externalFreeMoneyIncome([{ amount: 100, kind: null, credit_month: null }])).toBe(100)
  })

  it('asignar Dinero libre a una categoría (traslado, negativo) no cuenta', () => {
    expect(externalFreeMoneyIncome([{ amount: -100, kind: 'transfer', credit_month: null }])).toBe(0)
  })

  it('el "Sobrante del mes" del cierre no es plata nueva', () => {
    expect(externalFreeMoneyIncome([{ amount: 700, kind: null, credit_month: 9 }])).toBe(0)
  })

  it('un gasto a mano de Dinero libre no suma como ingreso', () => {
    expect(externalFreeMoneyIncome([{ amount: -40, kind: null, credit_month: null }])).toBe(0)
  })
})

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
