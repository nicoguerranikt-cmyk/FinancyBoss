// Matemática de "fecha de inicio + cada N días/meses" — genérica, sin
// imports de Supabase, mismo criterio que lib/dashboard.ts. Nació en Deudas
// (plan de pago automático) y ahora también la usa Gasto fijo
// (categories.fixed_*), así que vive en su propio módulo en vez de
// duplicarse o vivir escondida dentro de lib/debts.ts.

import { daysInMonth } from './dashboard'

export type RecurrenceUnit = 'day' | 'month'

export type RecurrenceConfig = {
  start_date: string | null // 'YYYY-MM-DD'
  interval_unit: RecurrenceUnit | null
  interval_count: number | null
}

export type DateYMD = { year: number; month: number; day: number }

export function isRecurrenceConfigured(r: RecurrenceConfig): boolean {
  return r.start_date !== null && r.interval_unit !== null && r.interval_count !== null && r.interval_count > 0
}

function parseYmd(iso: string): DateYMD {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

function toIso({ year, month, day }: DateYMD): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

// Cuántos períodos completos de `count` días/meses ya pasaron entre `start`
// y `today` (0 = todavía estamos en el primer período). -1 si `today` es
// anterior a `start` (todavía no arrancó).
function elapsedPeriods(start: DateYMD, unit: RecurrenceUnit, count: number, today: DateYMD): number {
  if (unit === 'day') {
    const startMs = Date.UTC(start.year, start.month - 1, start.day)
    const todayMs = Date.UTC(today.year, today.month - 1, today.day)
    const diffDays = Math.round((todayMs - startMs) / 86_400_000)
    if (diffDays < 0) return -1
    return Math.floor(diffDays / count)
  }

  // unit === 'month': meses completos entre las dos fechas, restando uno si
  // todavía no llegamos al "día del mes" de partida en el mes actual.
  let months = (today.year - start.year) * 12 + (today.month - start.month)
  if (today.day < Math.min(start.day, daysInMonth(today.year, today.month))) months -= 1
  if (months < 0) return -1
  return Math.floor(months / count)
}

// Fecha del vencimiento número `k` (0-indexado) de la recurrencia.
function occurrenceDate(start: DateYMD, unit: RecurrenceUnit, count: number, k: number): DateYMD {
  if (unit === 'day') {
    const d = new Date(Date.UTC(start.year, start.month - 1, start.day + k * count))
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
  }

  const totalMonths = start.month - 1 + k * count
  const year = start.year + Math.floor(totalMonths / 12)
  const month = (((totalMonths % 12) + 12) % 12) + 1
  // Si el mes de la cuota tiene menos días que el día de inicio (ej.
  // empezó el 31 y este mes tiene 30), cae en el último día del mes — nunca
  // se corre al mes siguiente.
  const day = Math.min(start.day, daysInMonth(year, month))
  return { year, month, day }
}

// Fecha (YYYY-MM-DD) del vencimiento más reciente que ya llegó (<= today).
// null si no está configurada o todavía no arrancó.
export function lastDueOccurrence(r: RecurrenceConfig, today: DateYMD): string | null {
  if (!isRecurrenceConfigured(r)) return null
  const start = parseYmd(r.start_date as string)
  const unit = r.interval_unit as RecurrenceUnit
  const count = r.interval_count as number

  const k = elapsedPeriods(start, unit, count, today)
  if (k < 0) return null
  return toIso(occurrenceDate(start, unit, count, k))
}

export type RecurrenceInput = {
  startDate: string
  intervalUnit: RecurrenceUnit
  intervalCount: number
}

// Validación de "fecha + frecuencia" sola, sin monto (la usa Gasto fijo,
// que no tiene un "monto total" contra el cual comparar la cuota).
export function validateRecurrenceSchedule(input: RecurrenceInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) return 'Elige una fecha de inicio válida.'
  if (input.intervalUnit !== 'day' && input.intervalUnit !== 'month') return 'Frecuencia inválida.'
  if (!(Number.isInteger(input.intervalCount) && input.intervalCount > 0)) {
    return 'La frecuencia debe ser un número entero mayor a 0.'
  }
  return null
}

export type RecurrenceAmountInput = RecurrenceInput & { amount: number }

// Igual que validateRecurrenceSchedule, más el chequeo de monto — lo usan
// Deudas y Deudas vinculadas (ver lib/debts.ts), que sí tienen un monto
// total contra el cual la cuota no puede pasarse.
export function validateRecurrenceFrequency(input: RecurrenceAmountInput, totalAmount: number): string | null {
  if (!(input.amount > 0)) return 'La cuota debe ser mayor a 0.'
  if (input.amount > totalAmount) return 'La cuota no puede ser mayor al monto total.'
  return validateRecurrenceSchedule(input)
}
