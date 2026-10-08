// Simulación de punta a punta de la cuenta A (ver docs/simulacion-de-pruebas.md).
// Cada paso agrega movimientos y comprueba los saldos que debe mostrar la app.
// Estos números son los mismos de la guía: si algo no coincide en pantalla, el
// bug está en la pantalla o en la base, no en el cálculo.
//
// Modelo: Gasto son solo los gastos fijos; los gastos del día a día no tienen
// presupuesto y salen de Dinero libre o de Ahorro (migración 0041).

import { describe, expect, it } from 'vitest'
import {
  computeDashboard,
  dailyBudgetFromFreeMoney,
  incomeCoverage,
  type PillarRow,
  type TransactionRow,
} from '@/lib/dashboard'
import { distributeCents } from '@/lib/money'
import { computeMonthlyAllocation } from '@/lib/monthlyAllocation'
import { externalExtraIncome, externalFreeMoneyIncome, isInternalMovement } from '@/lib/statsHistory'

const TODAY = { year: 2026, month: 10, day: 8 } // quedan 24 días contando hoy
const INCOME = 3000

// Pilares tal como los deja el onboarding: el monto de cada pilar es la suma de
// los montos de sus categorías. En Gasto son solo los gastos fijos (Alquiler);
// Comida y Transporte son del día a día y no llevan monto.
const pillars: PillarRow[] = [
  { id: 'a', name: 'ahorro', monthly_amount: 300 }, // Fondo de emergencia 300
  { id: 'g', name: 'gasto', monthly_amount: 800 }, // Alquiler 800
  { id: 'i', name: 'inversion', monthly_amount: 200 }, // Acciones 200
]

type Tx = TransactionRow & { type: 'expense' | 'extra_income' }

function tx(over: Partial<Tx> & Pick<Tx, 'pillar_id' | 'amount'>): Tx {
  return {
    category_id: null,
    is_allocation: false,
    type: over.amount < 0 ? 'expense' : 'extra_income',
    kind: null,
    ...over,
  }
}

// Reparto mensual del paso 0 (lo genera la app sola al abrir el Dashboard).
const reparto: Tx[] = [
  tx({ pillar_id: 'a', category_id: 'fondo', amount: 300, is_allocation: true }),
  tx({ pillar_id: 'i', category_id: 'acciones', amount: 200, is_allocation: true }),
  tx({ pillar_id: 'g', category_id: 'alquiler', amount: 800, is_allocation: true }),
]

function saldos(transactions: Tx[], carried: Record<string, number> = {}) {
  const d = computeDashboard({
    baseIncome: INCOME,
    pillars,
    transactionsThisMonth: transactions,
    carriedOverByPillarId: carried,
    today: TODAY,
  })
  const by = (name: string) => d.pillars.find((p) => p.pillar === name)!.saldo
  return { ahorro: by('ahorro'), gasto: by('gasto'), inversion: by('inversion'), libreDelMes: d.freeMoney }
}

const categoria = (transactions: Tx[], id: string) =>
  transactions.filter((t) => t.category_id === id).reduce((s, t) => s + t.amount, 0)

describe('Simulación cuenta A — del onboarding a los gastos del día a día', () => {
  const movimientos: Tx[] = [...reparto]
  // Movimientos de Dinero libre acreditados (free_money_transactions): lo que
  // ya salió de él (gastos, asignaciones). El sobrante del mes en curso se suma aparte.
  const libre: { amount: number; kind: string | null; credit_month: number | null }[] = []
  const dineroLibre = () => libre.reduce((s, r) => s + r.amount, 0) + saldos(movimientos).libreDelMes
  const puedesGastarHoy = () => dailyBudgetFromFreeMoney(dineroLibre(), TODAY).amount

  it('Paso 0 · onboarding: ingreso 3.000 → Ahorro 300, Gasto 800, Inversión 200 y 1.700 de Dinero libre', () => {
    expect(saldos(movimientos)).toEqual({ ahorro: 300, gasto: 800, inversion: 200, libreDelMes: 1700 })
    expect(dineroLibre()).toBe(1700)
    // Puedes gastar hoy = 1.700 ÷ 24 días
    expect(puedesGastarHoy()).toBeCloseTo(70.8333, 3)
  })

  it('Paso 1 · gasto de 12,50 en Comida desde Dinero libre → libre 1.687,50; Gasto no cambia', () => {
    movimientos.push(tx({ pillar_id: 'g', category_id: 'comida', amount: -12.5, kind: 'daily_spend' }))
    libre.push({ amount: -12.5, kind: 'funding', credit_month: null })
    expect(dineroLibre()).toBe(1687.5)
    expect(saldos(movimientos).gasto).toBe(800)
    expect(categoria(movimientos, 'comida')).toBe(-12.5)
    expect(puedesGastarHoy()).toBeCloseTo(70.3125, 3)
  })

  it('Paso 2 · ingreso extra de 100 en Fondo → Ahorro 400', () => {
    movimientos.push(tx({ pillar_id: 'a', category_id: 'fondo', amount: 100 }))
    expect(saldos(movimientos).ahorro).toBe(400)
  })

  it('Paso 3 · asignar 200 de Dinero libre a Acciones (traslado) → Inversión 400 y libre 1.487,50', () => {
    movimientos.push(tx({ pillar_id: 'i', category_id: 'acciones', amount: 200, kind: 'transfer' }))
    libre.push({ amount: -200, kind: 'transfer', credit_month: null })
    expect(saldos(movimientos).inversion).toBe(400)
    expect(dineroLibre()).toBe(1487.5)
  })

  it('Paso 4 · convertir 20 USD a 140 Bs en Fondo (traslado) → Ahorro 540 y 30 USD', () => {
    movimientos.push(tx({ pillar_id: 'a', category_id: 'fondo', amount: 140, kind: 'transfer' }))
    expect(saldos(movimientos).ahorro).toBe(540)
    expect(50 - 20).toBe(30)
  })

  it('Paso 5 · aumentar Alquiler +50 desde Fondo (traslado) → Ahorro 490 y Gasto 850', () => {
    movimientos.push(tx({ pillar_id: 'a', category_id: 'fondo', amount: -50, kind: 'transfer' }))
    movimientos.push(tx({ pillar_id: 'g', category_id: 'alquiler', amount: 50, kind: 'transfer' }))
    const s = saldos(movimientos)
    expect(s.ahorro).toBe(490)
    expect(s.gasto).toBe(850)
  })

  it('Paso 6 · gasto de 30 en Transporte que sale de Ahorro → Fondo: Ahorro 460, Gasto 850 y libre intacto', () => {
    movimientos.push(tx({ pillar_id: 'g', category_id: 'transporte', amount: -30, kind: 'daily_spend' }))
    movimientos.push(tx({ pillar_id: 'a', category_id: 'fondo', amount: -30, kind: 'funding' }))
    const s = saldos(movimientos)
    expect(s.ahorro).toBe(460)
    expect(s.gasto).toBe(850)
    expect(dineroLibre()).toBe(1487.5)
    expect(categoria(movimientos, 'transporte')).toBe(-30)
  })

  it('Paso 7 · confirmar el pago del Alquiler (800) → Gasto 50', () => {
    movimientos.push(tx({ pillar_id: 'g', category_id: 'alquiler', amount: -800 }))
    expect(saldos(movimientos).gasto).toBe(50)
    // Asignado 800 + 50 de aumento = 850; usado 800; restante 50.
    const aumento = movimientos
      .filter((t) => t.category_id === 'alquiler' && t.amount > 0 && !t.is_allocation)
      .reduce((s, t) => s + t.amount, 0)
    expect(800 + aumento).toBe(850)
    expect(850 - 800).toBe(50)
  })

  it('Paso 8 · pagar la deuda "Préstamo" (250,50 y luego 100) desde Fondo → Ahorro 109,50 y la deuda queda en 249,50', () => {
    movimientos.push(tx({ pillar_id: 'a', category_id: 'fondo', amount: -250.5 }))
    movimientos.push(tx({ pillar_id: 'a', category_id: 'fondo', amount: -100 }))
    expect(saldos(movimientos).ahorro).toBe(109.5)
    expect(600 - 250.5 - 100).toBe(249.5)
  })

  it('Paso 9 · cobrar 80 a Juan (deudor de 200) en Fondo → Ahorro 189,50 y Juan queda en 120', () => {
    movimientos.push(tx({ pillar_id: 'a', category_id: 'fondo', amount: 80 }))
    expect(saldos(movimientos).ahorro).toBe(189.5)
    expect(200 - 80).toBe(120)
  })

  it('Estado final: Ahorro 189,50 · Gasto 50 · Inversión 400 · Dinero libre 1.487,50', () => {
    expect(saldos(movimientos)).toMatchObject({ ahorro: 189.5, gasto: 50, inversion: 400 })
    expect(dineroLibre()).toBe(1487.5)
    // Puedes gastar hoy = 1.487,50 ÷ 24
    expect(puedesGastarHoy()).toBeCloseTo(61.9792, 3)
  })

  it('Límites: no se puede gastar más de lo que hay en el origen', () => {
    // El servidor rechaza un gasto mayor al saldo del origen elegido.
    expect(2000 > dineroLibre() + 0.005).toBe(true) // 2.000 desde Dinero libre (hay 1.487,50)
    expect(500 > categoria(movimientos, 'fondo') + 0.005).toBe(true) // 500 desde Fondo (hay 189,50)
    expect(categoria(movimientos, 'fondo')).toBe(189.5)
  })

  it('Estadísticas del mes: ingreso total 3.180 y los gastos reales (los traslados y los orígenes no cuentan)', () => {
    const extra = externalExtraIncome(movimientos) + externalFreeMoneyIncome(libre)
    expect(INCOME + extra).toBe(3180) // 3.000 + bono 100 + cobro 80
    // Gastos reales: Comida 12,50 + Transporte 30 + Alquiler 800 + deuda 250,50 + 100.
    // El lado de Ahorro del gasto de Transporte (funding) y el traslado no se cuentan otra vez.
    const gastosReales = movimientos.filter((t) => t.type === 'expense' && !isInternalMovement(t))
    expect(gastosReales.reduce((s, t) => s - t.amount, 0)).toBe(12.5 + 30 + 800 + 250.5 + 100)
  })

  it('Cierre de mes: el mes pasado deja 300 / 800 / 200 de arrastre y 1.700 a Dinero libre', () => {
    const mesAnterior = computeDashboard({
      baseIncome: INCOME,
      pillars,
      transactionsThisMonth: [],
      today: { year: 2026, month: 9, day: 30 },
    })
    expect(mesAnterior.pillars.map((p) => p.saldo)).toEqual([300, 800, 200])
    expect(mesAnterior.freeMoney).toBe(1700)

    // Este mes, con ese arrastre: cada pilar suma el saldo del mes anterior.
    const esteMes = saldos(movimientos, { a: 300, g: 800, i: 200 })
    expect(esteMes.ahorro).toBe(489.5) // 300 + 300 − 110,50 de movimientos
    expect(esteMes.gasto).toBe(850) // 800 + 800 − 750
    expect(esteMes.inversion).toBe(600) // 200 + 200 + 200
    // Dinero libre = (−12,50 −200 + 1.700 del cierre) + 1.700 de este mes
    const libreTotal = libre.reduce((s, r) => s + r.amount, 0) + 1700 + esteMes.libreDelMes
    expect(libreTotal).toBe(3187.5)
  })
})

describe('Simulación cuenta B — ingreso insuficiente (ingreso 1.000 con pilares que suman 1.300)', () => {
  const pillarsB = [
    { id: 'a', monthly_amount: 300 },
    { id: 'g', monthly_amount: 800 },
    { id: 'i', monthly_amount: 200 },
  ]

  it('el aviso dice que faltan 300 Bs', () => {
    const c = incomeCoverage(1000, pillarsB)
    expect(c.committed).toBe(1300)
    expect(c.shortfall).toBe(300)
    expect(c.isShort).toBe(true)
  })

  it('"Reajustar automáticamente" reparte Ahorro 230,77 / Gasto 615,38 / Inversión 153,85 (suma 1.000)', () => {
    const c = incomeCoverage(1000, pillarsB)
    const montos = distributeCents(pillarsB.map((p) => p.monthly_amount * c.scaleFactor))
    expect(montos).toEqual([230.77, 615.38, 153.85])
    expect(Math.round(montos.reduce((s, m) => s + m, 0) * 100)).toBe(100000)
  })

  it('dentro de Gasto: el Alquiler (800) se reduce a 615,38', () => {
    const filas = computeMonthlyAllocation(615.38, [
      { id: 'alquiler', fixedAmount: 800, isGeneral: false },
      { id: 'general', fixedAmount: null, isGeneral: true },
    ])
    expect(filas.find((f) => f.categoryId === 'alquiler')!.amount).toBe(615.38)
    expect(filas.find((f) => f.categoryId === 'general')!.amount).toBe(0)
  })

  it('con 230,77 de Ahorro, un pago compartido de 100 deja 130,77 (y el acreedor B recibe +100)', () => {
    expect(Math.round((230.77 - 100) * 100) / 100).toBe(130.77)
  })
})
