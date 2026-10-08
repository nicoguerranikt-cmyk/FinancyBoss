// Lógica de Deudas (manual.md §6, modelo v2: un pago real reduce el saldo,
// crear la deuda no toca nada). Sin imports de Supabase a propósito, mismo
// criterio que lib/dashboard.ts.

import {
  lastDueOccurrence as lastRecurrenceOccurrence,
  validateRecurrenceFrequency,
  type DateYMD,
  type RecurrenceUnit,
} from './recurrence'

export type { DateYMD }

// Registrar un pago (bajar remaining_amount y marcar la deuda como saldada al
// llegar a 0, manual §6.5) vive en la función de Postgres register_debt_payment
// (migración 0038): el movimiento y el saldo se actualizan juntos, atómicamente.

// Plan de pago automático (manual §6.2): es un RECORDATORIO, no descuenta
// solo — el usuario confirma con un botón ("Ya la pagué"). Nunca hay que
// asumir que una cuota se pagó porque ya pasó la fecha.
//
// La frecuencia flexible ("cada N días/meses" desde una fecha de inicio) es
// la misma matemática genérica de lib/recurrence.ts — acá solo se adapta a
// los nombres de columna de `debts` y se le suma la validación de monto
// (una deuda sí tiene un total contra el cual la cuota no puede pasarse; un
// gasto fijo de categoría, en cambio, no — ver lib/recurrence.ts).
export type AutoPayInterval = RecurrenceUnit

export type AutoPayConfig = {
  auto_pay_amount: number | null
  auto_pay_start_date: string | null // 'YYYY-MM-DD'
  auto_pay_interval_unit: AutoPayInterval | null
  auto_pay_interval_count: number | null
}

function toRecurrenceConfig(debt: AutoPayConfig) {
  return {
    start_date: debt.auto_pay_start_date,
    interval_unit: debt.auto_pay_interval_unit,
    interval_count: debt.auto_pay_interval_count,
  }
}

// Fecha (YYYY-MM-DD) del vencimiento más reciente que ya llegó (<= today).
// null si el plan no está configurado o todavía no arrancó.
export function lastDueOccurrence(debt: AutoPayConfig, today: DateYMD): string | null {
  if (debt.auto_pay_amount === null) return null
  return lastRecurrenceOccurrence(toRecurrenceConfig(debt), today)
}

export type AutoPayFrequencyInput = {
  amount: number
  startDate: string
  intervalUnit: AutoPayInterval
  intervalCount: number
}

export const validateAutoPayFrequency = validateRecurrenceFrequency
