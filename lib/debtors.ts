// Lógica de Deudores (manual.md §7): lo inverso de Deudas — pagos parciales
// reducen el saldo pendiente, y al llegar a 0 el registro se cierra solo.
// Sin imports de Supabase a propósito, mismo criterio que lib/debts.ts.

export type DebtorStateRow = { remaining_amount: number }
export type AppliedCollection = { remainingAmount: number; status: 'pending' | 'paid' }

const EPSILON = 0.005

// Aplica un cobro de `amount` contra remaining_amount y decide si el
// deudor queda saldado (manual §7.3: "pasa a estado paid automáticamente").
// No valida amount <= remaining_amount: esa regla (con su mensaje de error,
// manual §11) vive en la action que llama a esto.
export function applyCollection(debtor: DebtorStateRow, amount: number): AppliedCollection {
  const raw = Math.round((debtor.remaining_amount - amount) * 100) / 100
  const remainingAmount = Math.max(0, raw)
  const status: AppliedCollection['status'] = remainingAmount <= EPSILON ? 'paid' : 'pending'
  return { remainingAmount: status === 'paid' ? 0 : remainingAmount, status }
}
