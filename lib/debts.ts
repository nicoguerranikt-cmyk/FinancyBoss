// Lógica de Deudas (manual.md §6, modelo v2: un pago real reduce el saldo,
// crear la deuda no toca nada). Sin imports de Supabase a propósito, mismo
// criterio que lib/dashboard.ts y lib/domino.ts.

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
export type AutoPayConfig = {
  monthly_payment: number | null
  auto_pay_start_year: number | null
  auto_pay_start_month: number | null
  auto_pay_start_day: number | null
  auto_pay_pillar_id: string | null
}

export function isAutoPayConfigured(debt: AutoPayConfig): boolean {
  return (
    debt.monthly_payment !== null &&
    debt.auto_pay_pillar_id !== null &&
    debt.auto_pay_start_year !== null &&
    debt.auto_pay_start_month !== null
  )
}

// ¿Ya llegó el momento de recordar la cuota de este mes? (No dice si ya se
// confirmó — eso se chequea aparte, contra las transacciones del mes.)
export function isAutoPayDue(
  debt: AutoPayConfig,
  today: { year: number; month: number; day: number }
): boolean {
  if (!isAutoPayConfigured(debt)) return false
  const startYear = debt.auto_pay_start_year as number
  const startMonth = debt.auto_pay_start_month as number

  if (startYear > today.year) return false
  if (startYear === today.year && startMonth > today.month) return false

  // En el mes exacto de inicio, si se configuró un día, hay que esperarlo.
  if (startYear === today.year && startMonth === today.month && debt.auto_pay_start_day) {
    return today.day >= debt.auto_pay_start_day
  }
  return true
}
