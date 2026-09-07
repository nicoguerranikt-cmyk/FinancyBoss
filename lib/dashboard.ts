// Lógica del Dashboard (manual.md v2.0, secciones 3.4, 4.1, 4.2, 5). Sin
// imports de Supabase a propósito: recibe filas ya leídas y devuelve
// números, así se puede revisar/probar aislado de la base de datos.

export type PillarName = 'ahorro' | 'gasto' | 'inversion'

export type PillarRow = { id: string; name: PillarName; percentage: number }
// date es opcional: computeDashboard no la usa, pero actions.ts la necesita
// para separar "transacciones de antes de hoy" de "hasta hoy" (Caso 1).
export type TransactionRow = { pillar_id: string; category_id: string | null; amount: number; date?: string }
// Solo categorías CON fixed_amount asignado (gasto fijo, manual §4.2).
export type CategoryFixedRow = { id: string; pillar_id: string; fixed_amount: number }

const BOLIVIA_TZ = 'America/La_Paz'

// Bolivia no tiene horario de verano (UTC-4 fijo), pero el servidor de
// Supabase corre en UTC: hay que calcular "hoy" en el huso del usuario de
// forma explícita, nunca con current_date de Postgres ni new Date() a secas.
export function todayInBolivia(): { year: number; month: number; day: number; iso: string } {
  // 'en-CA' da directo el formato YYYY-MM-DD.
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: BOLIVIA_TZ }).format(new Date())
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day, iso }
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate()
}

// Igual que todayInBolivia(), pero para convertir un Date cualquiera (ej.
// profiles.created_at) a año/mes/día en huso boliviano.
export function dateInBolivia(date: Date): { year: number; month: number; day: number } {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: BOLIVIA_TZ }).format(date)
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

// Rango [primer día, último día] de un mes dado (hora boliviana), para
// filtrar transactions.date en la consulta a Supabase.
export function monthRangeFor(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = daysInMonth(year, month)
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
  }
}

export function monthRangeInBolivia(): { start: string; end: string } {
  const { year, month } = todayInBolivia()
  return monthRangeFor(year, month)
}

// Igual que monthRangeFor, pero como instantes UTC — para filtrar columnas
// timestamptz (domino_events.created_at), donde comparar strings de fecha no
// sirve. Medianoche en Bolivia = 04:00 UTC (sin horario de verano).
export function monthRangeUtcInstantFor(year: number, month: number): { startUtc: string; endUtc: string } {
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  return {
    startUtc: new Date(Date.UTC(year, month - 1, 1, 4, 0, 0)).toISOString(),
    endUtc: new Date(Date.UTC(nextYear, nextMonth - 1, 1, 4, 0, 0)).toISOString(),
  }
}

export function monthRangeUtcInstant(): { startUtc: string; endUtc: string } {
  const { year, month } = todayInBolivia()
  return monthRangeUtcInstantFor(year, month)
}

export type PillarSummary = { id: string; pillar: PillarName; budget: number; carriedOver: number; saldo: number }
export type DashboardData = {
  pillars: PillarSummary[]
  dailyBudget: number
  isDeficit: boolean
  daysRemaining: number
}

export function computeDashboard(input: {
  baseIncome: number
  pillars: PillarRow[]
  transactionsThisMonth: TransactionRow[]
  fixedCategories: CategoryFixedRow[]
  // Efecto dominó (manual §4.3): ajuste CON SIGNO por pilar, ya neto de todo
  // lo declarado este mes. Positivo = un pilar (Ahorro/Inversión) quedó
  // debitado por haber cubierto un déficit de Gasto. Negativo = a Gasto se
  // le acredita de vuelta esa misma plata (para que los días que quedan no
  // sigan apretados por un déficit que el usuario ya cubrió). Ver
  // lib/domino.ts — computeDominoPillarAdjustments.
  dominoPillarAdjustments?: Record<string, number>
  // Arrastre de saldo entre meses (manual §3.3): saldo que sobró/faltó en el
  // mes anterior de cada pilar. 0 si no viene (o si no hay mes anterior
  // cerrado todavía). Ver lib/monthClose.ts.
  carriedOverByPillarId?: Record<string, number>
  today?: { year: number; month: number; day: number }
}): DashboardData {
  const today = input.today ?? todayInBolivia()
  const daysRemaining = daysInMonth(today.year, today.month) - today.day + 1

  const fixedCategoryIds = new Set(input.fixedCategories.map((c) => c.id))

  const pillarSummaries: PillarSummary[] = input.pillars.map((pillar) => {
    // Deudas v2 (manual §6): todo pago de deuda sale de un pilar/categoría
    // específico (transactions.debt_id), ya cubierto por `movimientos` más
    // abajo — no hay más una deducción "de ingreso total antes de repartir".
    const budget = (input.baseIncome * pillar.percentage) / 100

    // Gastos fijos: plata comprometida por CONFIGURACIÓN (manual §4.2/§5.2,
    // "Crítico"), no por si ya existe la transacción del pago. Se resta acá
    // siempre, y sus transacciones (si existen) se excluyen de "movimientos"
    // para no descontarlas dos veces.
    const fixedTotal = input.fixedCategories
      .filter((c) => c.pillar_id === pillar.id)
      .reduce((sum, c) => sum + c.fixed_amount, 0)

    const movimientos = input.transactionsThisMonth
      .filter((t) => t.pillar_id === pillar.id && !fixedCategoryIds.has(t.category_id ?? ''))
      .reduce((sum, t) => sum + t.amount, 0)

    const dominoAdjustment = input.dominoPillarAdjustments?.[pillar.id] ?? 0
    const carriedOver = input.carriedOverByPillarId?.[pillar.id] ?? 0

    return {
      id: pillar.id,
      pillar: pillar.name,
      budget,
      carriedOver,
      saldo: budget + carriedOver - fixedTotal + movimientos - dominoAdjustment,
    }
  })

  const saldoGasto = pillarSummaries.find((p) => p.pillar === 'gasto')?.saldo ?? 0
  const dailyBudget = daysRemaining > 0 ? Math.max(0, saldoGasto / daysRemaining) : 0

  return {
    pillars: pillarSummaries,
    dailyBudget,
    isDeficit: saldoGasto <= 0,
    daysRemaining,
  }
}
