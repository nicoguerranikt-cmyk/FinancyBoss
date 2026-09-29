// Lógica de Deudas (manual.md §6, modelo v2: un pago real reduce el saldo,
// crear la deuda no toca nada). Sin imports de Supabase a propósito, mismo
// criterio que lib/dashboard.ts y lib/domino.ts.

import {
  isRecurrenceConfigured,
  lastDueOccurrence as lastRecurrenceOccurrence,
  validateRecurrenceFrequency,
  type DateYMD,
  type RecurrenceUnit,
} from './recurrence'

export type { DateYMD }

export type DebtStateRow = { remaining_amount: number }
export type AppliedPayment = { remainingAmount: number; status: 'active' | 'paid' }

const EPSILON = 0.005

// Aplica un pago de `amount` contra remaining_amount y decide si la deuda
// queda saldada (manual §6.5: "se marca como saldada automáticamente"). No
// valida amount <= remaining_amount: esa regla de negocio (con su mensaje
// de error) vive en la action que llama a esto.
export function applyDebtPayment(debt: DebtStateRow, amount: number): AppliedPayment {
  const raw = Math.round((debt.remaining_amount - amount) * 100) / 100
  const remainingAmount = Math.max(0, raw)
  const status: AppliedPayment['status'] = remainingAmount <= EPSILON ? 'paid' : 'active'
  return { remainingAmount: status === 'paid' ? 0 : remainingAmount, status }
}

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

export function isAutoPayConfigured(debt: AutoPayConfig): boolean {
  return debt.auto_pay_amount !== null && isRecurrenceConfigured(toRecurrenceConfig(debt))
}

// Fecha (YYYY-MM-DD) del vencimiento más reciente que ya llegó (<= today).
// null si el plan no está configurado o todavía no arrancó.
export function lastDueOccurrence(debt: AutoPayConfig, today: DateYMD): string | null {
  if (debt.auto_pay_amount === null) return null
  return lastRecurrenceOccurrence(toRecurrenceConfig(debt), today)
}

// ¿Ya llegó el momento de recordar una cuota? (No dice si ya se confirmó —
// eso se chequea comparando contra la fecha de la última transacción de
// esta deuda, ver app/(app)/deudas/page.tsx y app/(app)/page.tsx.)
export function isAutoPayDue(debt: AutoPayConfig, today: DateYMD): boolean {
  return lastDueOccurrence(debt, today) !== null
}

export type AutoPayFrequencyInput = {
  amount: number
  startDate: string
  intervalUnit: AutoPayInterval
  intervalCount: number
}

export const validateAutoPayFrequency = validateRecurrenceFrequency
