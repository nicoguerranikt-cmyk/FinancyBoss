// Gasto fijo de categoría (categories.fixed_*, manual §4.2/§5.2): mismo
// mecanismo de "fecha de inicio + cada N días/meses" que el plan de pago
// automático de Deudas (lib/debts.ts), pero sin monto tope ni pilar propio
// (el pilar ya lo tiene la categoría). Sin imports de Supabase a propósito.

import {
  isRecurrenceConfigured,
  lastDueOccurrence as lastRecurrenceOccurrence,
  type DateYMD,
  type RecurrenceUnit,
} from './recurrence'

export type FixedExpenseConfig = {
  fixed_amount: number | null
  fixed_start_date: string | null
  fixed_interval_unit: RecurrenceUnit | null
  fixed_interval_count: number | null
}

export type FixedExpenseReserveConfig = FixedExpenseConfig & { fixed_reserve_ahead: boolean }

function toRecurrenceConfig(c: FixedExpenseConfig) {
  return {
    start_date: c.fixed_start_date,
    interval_unit: c.fixed_interval_unit,
    interval_count: c.fixed_interval_count,
  }
}

export function isFixedExpenseScheduled(c: FixedExpenseConfig): boolean {
  return c.fixed_amount !== null && isRecurrenceConfigured(toRecurrenceConfig(c))
}

// Fecha (YYYY-MM-DD) del descuento más reciente que ya corresponde (<=
// today). null si no está programado o todavía no arrancó.
export function lastFixedExpenseOccurrence(c: FixedExpenseConfig, today: DateYMD): string | null {
  if (c.fixed_amount === null) return null
  return lastRecurrenceOccurrence(toRecurrenceConfig(c), today)
}

// Cuánto de este gasto fijo corresponde reservar del presupuesto diario
// ESTE mes calendario, prorrateado según la frecuencia — solo para
// categorías con fixed_reserve_ahead = true (decisión configurable por
// categoría, ver migración 0018). Ej.: 200 Bs cada 2 meses = 100 Bs/mes;
// 300 Bs cada 15 días en un mes de 30 días = 600 Bs ese mes. 0 si el plan
// todavía no arrancó o no pidió reservarse por adelantado.
export function monthlyReserveAmount(
  c: FixedExpenseReserveConfig,
  today: DateYMD,
  daysInThisMonth: number
): number {
  if (!c.fixed_reserve_ahead) return 0
  if (lastFixedExpenseOccurrence(c, today) === null) return 0
  const amount = c.fixed_amount as number
  const count = c.fixed_interval_count as number
  if (c.fixed_interval_unit === 'month') return amount / count
  return (amount / count) * daysInThisMonth
}
