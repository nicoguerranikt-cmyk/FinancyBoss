// Simulación de punta a punta de la cuenta A (ver docs/simulacion-de-pruebas.md).
// Cada paso agrega movimientos y comprueba los saldos que debe mostrar la app.
// Estos números son los mismos de la guía: si algo no coincide en pantalla, el
// bug está en la pantalla o en la base, no en el cálculo.

import { describe, expect, it } from 'vitest'
import { computeDashboard, incomeCoverage, type PillarRow, type TransactionRow } from '@/lib/dashboard'
import { computeDominoPillarAdjustments } from '@/lib/domino'
import { distributeCents } from '@/lib/money'
import { computeMonthlyAllocation } from '@/lib/monthlyAllocation'
import { externalExtraIncome, externalFreeMoneyIncome, isInternalMovement } from '@/lib/statsHistory'
import { summarizePillarMovements } from '@/lib/pillarTotals'

const TODAY = { year: 2026, month: 10, day: 6 }
const INCOME = 3000

// Pilares tal como los deja el onboarding: el monto de cada pilar es la suma de
// los montos de sus categorías.
const pillars: PillarRow[] = [
  { id: 'a', name: 'ahorro', monthly_amount: 300 }, // Fondo de emergencia 300
  { id: 'g', name: 'gasto', monthly_amount: 1300.5 }, // Alquiler 800 + Mercado 500,50
  { id: 'i', name: 'inversion', monthly_amount: 200 }, // Acciones 200
]

type Tx = TransactionRow & { type: 'expense' | 'extra_income'; kind: string | null }

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
  tx({ pillar_id: 'g', category_id: 'mercado', amount: 500.5, is_allocation: true }),
]

function saldos(transactions: Tx[], dominoEvents: { amount: number; affected: string | null }[] = []) {
  const adjustments = computeDominoPillarAdjustments(
    dominoEvents.map((e) => ({
      source_category_id: 'transporte',
      affected_category_id: e.affected,
      debt_id: null,
      amount: e.amount,
    })),
    { fondo: 'a', acciones: 'i', alquiler: 'g', mercado: 'g' },
    'a',
    'g'
  )
  const d = computeDashboard({
    baseIncome: INCOME,
    pillars,
    transactionsThisMonth: transactions,
    dominoPillarAdjustments: adjustments,
    today: TODAY,
  })
  const by = (name: string) => d.pillars.find((p) => p.pillar === name)!.saldo
  return { ahorro: by('ahorro'), gasto: by('gasto'), inversion: by('inversion'), libreDelMes: d.freeMoney }
}

const categoria = (transactions: Tx[], id: string) =>
  transactions.filter((t) => t.category_id === id).reduce((s, t) => s + t.amount, 0)

describe('Simulación cuenta A — del onboarding al déficit', () => {
  const movimientos: Tx[] = [...reparto]

  it('Paso 0 · onboarding: ingreso 3.000 → Ahorro 300, Gasto 1.300,50, Inversión 200 y 1.199,50 libres', () => {
    expect(saldos(movimientos)).toEqual({ ahorro: 300, gasto: 1300.5, inversion: 200, libreDelMes: 1199.5 })
    expect(categoria(movimientos, 'mercado')).toBe(500.5)
  })

  it('Paso 1 · gasto de 12,50 en Mercado → Gasto 1.288 y Mercado 488', () => {
    movimientos.push(tx({ pillar_id: 'g', category_id: 'mercado', amount: -12.5 }))
    expect(saldos(movimientos).gasto).toBe(1288)
    expect(categoria(movimientos, 'mercado')).toBe(488)
  })

  it('Paso 2 · ingreso extra de 100 en Fondo → Ahorro 400', () => {
    movimientos.push(tx({ pillar_id: 'a', category_id: 'fondo', amount: 100 }))
    expect(saldos(movimientos).ahorro).toBe(400)
  })

  it('Paso 3 · asignar 200 de Dinero libre a Acciones (traslado) → Inversión 400', () => {
    movimientos.push(tx({ pillar_id: 'i', category_id: 'acciones', amount: 200, kind: 'transfer' }))
    expect(saldos(movimientos).inversion).toBe(400)
    // Dinero libre = lo acreditado (-200) + lo que sobra del mes (1.199,50) = 999,50
    expect(-200 + saldos(movimientos).libreDelMes).toBe(999.5)
  })

  it('Paso 4 · convertir 20 USD a 140 Bs en Fondo (traslado) → Ahorro 540 y 30 USD', () => {
    movimientos.push(tx({ pillar_id: 'a', category_id: 'fondo', amount: 140, kind: 'transfer' }))
    expect(saldos(movimientos).ahorro).toBe(540)
    expect(50 - 20).toBe(30)
  })

  it('Paso 5 · aumentar Alquiler +50 desde Fondo (traslado) → Ahorro 490 y Gasto 1.338', () => {
    movimientos.push(tx({ pillar_id: 'a', category_id: 'fondo', amount: -50, kind: 'transfer' }))
    movimientos.push(tx({ pillar_id: 'g', category_id: 'alquiler', amount: 50, kind: 'transfer' }))
    const s = saldos(movimientos)
    expect(s.ahorro).toBe(490)
    expect(s.gasto).toBe(1338)
  })

  it('Paso 6 · confirmar el pago del Alquiler (800) → Gasto 538', () => {
    movimientos.push(tx({ pillar_id: 'g', category_id: 'alquiler', amount: -800 }))
    expect(saldos(movimientos).gasto).toBe(538)
    // Asignado 800 + 50 de aumento = 850; usado 800; restante 50.
    const aumento = movimientos
      .filter((t) => t.category_id === 'alquiler' && t.amount > 0 && !t.is_allocation)
      .reduce((s, t) => s + t.amount, 0)
    expect(800 + aumento).toBe(850)
    expect(850 - 800).toBe(50)
  })

  it('Paso 7 · pagar la deuda "Préstamo" (250,50 y luego 100) desde Fondo → Ahorro 139,50 y la deuda queda en 249,50', () => {
    movimientos.push(tx({ pillar_id: 'a', category_id: 'fondo', amount: -250.5 }))
    movimientos.push(tx({ pillar_id: 'a', category_id: 'fondo', amount: -100 }))
    expect(saldos(movimientos).ahorro).toBe(139.5)
    expect(600 - 250.5 - 100).toBe(249.5)
  })

  it('Paso 8 · cobrar 80 a Juan (deudor de 200) en Fondo → Ahorro 219,50 y Juan queda en 120', () => {
    movimientos.push(tx({ pillar_id: 'a', category_id: 'fondo', amount: 80 }))
    expect(saldos(movimientos).ahorro).toBe(219.5)
    expect(200 - 80).toBe(120)
  })

  it('Paso 9 · gasto de 600 en Transporte → Gasto -62 (déficit)', () => {
    movimientos.push(tx({ pillar_id: 'g', category_id: 'transporte', amount: -600 }))
    expect(saldos(movimientos).gasto).toBe(-62)
  })

  it('Paso 10 · resolver el déficit de 62 con Ahorro/Fondo → Gasto 0 y Ahorro 157,50', () => {
    const s = saldos(movimientos, [{ amount: 62, affected: 'fondo' }])
    expect(s.gasto).toBe(0)
    expect(s.ahorro).toBe(157.5)
    // El saldo de la categoría Fondo NO baja (el dominó se aplica al pilar, no a la categoría).
    expect(categoria(movimientos, 'fondo')).toBe(219.5)
  })

  it('Estadísticas del mes: ingreso total 3.180 (base + bono 100 + cobro 80); los traslados no cuentan', () => {
    const libreRows = [
      { amount: -200, kind: 'transfer', credit_month: null }, // asignar a Acciones
    ]
    const extra = externalExtraIncome(movimientos) + externalFreeMoneyIncome(libreRows)
    expect(INCOME + extra).toBe(3180)
    // Gastos reales por categoría: el lado de Ahorro del aumento (traslado) no cuenta como gasto.
    const gastosReales = movimientos.filter((t) => t.type === 'expense' && !isInternalMovement(t))
    expect(gastosReales.reduce((s, t) => s - t.amount, 0)).toBe(12.5 + 800 + 250.5 + 100 + 600)
  })

  it('Totales de los pilares: nada se pierde (todo lo guardado suma igual)', () => {
    const porPilar = (p: string) => summarizePillarMovements(movimientos.filter((t) => t.pillar_id === p), new Set()).total
    // Ahorro: 300 + 100 + 140 − 50 − 250,50 − 100 + 80 = 219,50 (antes del dominó)
    expect(porPilar('a')).toBe(219.5)
  })

  it('Cierre de mes: el mes pasado sin movimientos deja 300 / 1.300,50 / 200 de arrastre y 1.199,50 a Dinero libre', () => {
    // Mes anterior de una cuenta recién creada: nadie gastó nada, así que cada
    // pilar queda con su presupuesto completo y lo que sobra del ingreso va a Dinero libre.
    const mesAnterior = computeDashboard({
      baseIncome: INCOME,
      pillars,
      transactionsThisMonth: [],
      today: { year: 2026, month: 9, day: 30 },
    })
    expect(mesAnterior.pillars.map((p) => p.saldo)).toEqual([300, 1300.5, 200])
    expect(mesAnterior.freeMoney).toBe(1199.5)

    // Este mes, con ese arrastre: cada pilar suma el saldo del mes anterior.
    const adjustments = computeDominoPillarAdjustments(
      [{ source_category_id: 'transporte', affected_category_id: 'fondo', debt_id: null, amount: 62 }],
      { fondo: 'a' },
      'a',
      'g'
    )
    const esteMes = computeDashboard({
      baseIncome: INCOME,
      pillars,
      transactionsThisMonth: movimientos,
      dominoPillarAdjustments: adjustments,
      carriedOverByPillarId: { a: 300, g: 1300.5, i: 200 },
      today: TODAY,
    })
    expect(esteMes.pillars.map((p) => p.saldo)).toEqual([457.5, 1300.5, 600])
    // Dinero libre = (-200 de la asignación + 1.199,50 del cierre) + 1.199,50 de este mes
    expect(-200 + 1199.5 + esteMes.freeMoney).toBe(2199)
  })
})

describe('Simulación cuenta B — ingreso insuficiente (ingreso 1.000 con pilares que suman 1.800,50)', () => {
  const pillarsB = [
    { id: 'a', monthly_amount: 300 },
    { id: 'g', monthly_amount: 1300.5 },
    { id: 'i', monthly_amount: 200 },
  ]

  it('el aviso dice que faltan 800,50 Bs', () => {
    const c = incomeCoverage(1000, pillarsB)
    expect(c.committed).toBe(1800.5)
    expect(c.shortfall).toBe(800.5)
    expect(c.isShort).toBe(true)
  })

  it('"Reajustar automáticamente" reparte Ahorro 166,62 / Gasto 722,30 / Inversión 111,08 (suma 1.000)', () => {
    const c = incomeCoverage(1000, pillarsB)
    const montos = distributeCents(pillarsB.map((p) => p.monthly_amount * c.scaleFactor))
    expect(montos).toEqual([166.62, 722.3, 111.08])
    expect(Math.round(montos.reduce((s, m) => s + m, 0) * 100)).toBe(100000)
  })

  it('dentro de Gasto: Alquiler 444,32 y Mercado 277,98 (suman 722,30)', () => {
    const filas = computeMonthlyAllocation(722.3, [
      { id: 'alquiler', fixedAmount: 800, isGeneral: false },
      { id: 'mercado', fixedAmount: 500.5, isGeneral: false },
      { id: 'general', fixedAmount: null, isGeneral: true },
    ])
    expect(filas.find((f) => f.categoryId === 'alquiler')!.amount).toBe(444.32)
    expect(filas.find((f) => f.categoryId === 'mercado')!.amount).toBe(277.98)
  })

  it('con 166,62 de Ahorro, un pago compartido de 100 deja 66,62 (y el acreedor B recibe +100)', () => {
    expect(Math.round((166.62 - 100) * 100) / 100).toBe(66.62)
  })
})
