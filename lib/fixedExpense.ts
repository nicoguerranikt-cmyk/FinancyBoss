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

function toRecurrenceConfig(c: FixedExpenseConfig) {
  return {
    start_date: c.fixed_start_date,
    interval_unit: c.fixed_interval_unit,
    interval_count: c.fixed_interval_count,
  }
}

// ¿Esta categoría es un gasto fijo? Solo en Gasto: desde la migración 0023
// toda categoría puede tener fixed_amount, pero en Ahorro/Inversión es el
// aporte mensual y no un gasto programado. Una categoría de Gasto con monto
// fijo no puede ser origen/destino de un pago de deuda o cobro (su plata
// queda comprometida). Misma regla que confirm_shared_payment (migración 0033).
export function isFixedExpenseCategory(pillarName: string, fixedAmount: number | null): boolean {
  return pillarName === 'gasto' && fixedAmount !== null
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

// ¿Ya se pagó la cuota vencida? Un pago es un GASTO (amount < 0) de la
// categoría. Un reparto mensual o un ingreso extra son positivos y NO cuentan
// como pago: si no, un reparto posterior al vencimiento ocultaría el aviso o
// respondería "ya confirmaste" sin que se haya pagado nada.
export function lastFixedExpensePaymentDate(transactions: { amount: number; date: string }[]): string | null {
  let last: string | null = null
  for (const t of transactions) {
    if (t.amount < 0 && (last === null || t.date > last)) last = t.date
  }
  return last
}

// La cuota que venció en `dueDate` está pendiente si todavía no hay un pago
// (ver lastFixedExpensePaymentDate) con fecha igual o posterior.
export function isFixedExpensePending(dueDate: string, lastPaymentDate: string | null | undefined): boolean {
  return !lastPaymentDate || lastPaymentDate < dueDate
}

// Aumento puntual del presupuesto de este mes de una categoría de Gasto:
// solo ingresos extra reales. El reparto mensual (is_allocation) ya está en
// el monto fijo de la categoría; sumarlo otra vez duplicaría lo asignado.
export function fixedExpenseExtraThisMonth(transactions: { amount: number; is_allocation: boolean }[]): number {
  return transactions.filter((t) => t.amount > 0 && !t.is_allocation).reduce((sum, t) => sum + t.amount, 0)
}
