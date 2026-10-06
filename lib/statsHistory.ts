// Cifras de Estadísticas de un mes: los meses pasados leen lo que quedó
// congelado al cerrarlos, no la configuración de hoy. Cambiar el sueldo o el
// monto de una categoría no debe alterar un mes que ya terminó (H08).

// Ingreso base de un mes. El mes en curso usa el ingreso actual; un mes cerrado
// usa el que se guardó al cerrarlo (monthly_budgets.income_amount, migración
// 0036). Si esa fila no tiene dato (null), se usa el actual: es lo que se
// mostraba antes de guardarlo.
export function incomeForMonth(input: {
  isCurrentMonth: boolean
  currentBaseIncome: number
  storedIncome: number | null | undefined
}): number {
  if (input.isCurrentMonth) return input.currentBaseIncome
  return input.storedIncome ?? input.currentBaseIncome
}

// ¿Este movimiento es interno, o sea NO es un ingreso ni un gasto real?
//   - is_allocation: el reparto mensual del propio ingreso en categorías.
//   - kind 'transfer': un lado de un traslado entre cuentas propias (asignar
//     Dinero libre, aumentar un gasto fijo desde Ahorro, convertir USD a Bs).
//   - kind 'opening_balance': saldo inicial, plata que ya tenías.
// Mover plata propia nunca es un ingreso nuevo ni un gasto (migración 0037).
export function isInternalMovement(t: { is_allocation: boolean; kind: string | null }): boolean {
  return t.is_allocation || t.kind !== null
}

// Ingreso extra REAL de un mes registrado en las categorías: ingresos que
// entraron al sistema (un bono, un cobro de deudor, el pago que recibes de una
// deuda vinculada, la ganancia de una inversión), sin los movimientos internos.
export function externalExtraIncome(
  transactions: { type: string; amount: number; is_allocation: boolean; kind: string | null }[]
): number {
  return transactions
    .filter((t) => t.type === 'extra_income' && !isInternalMovement(t))
    .reduce((sum, t) => sum + t.amount, 0)
}

// Ingreso real que entró directo a Dinero libre en el mes (un movimiento
// "Ingreso" a mano). No cuentan: los traslados (asignar a una categoría, que
// ya son negativos), ni el "Sobrante del mes" que el cierre acredita
// (credit_month): ese es el propio ingreso base que no se asignó, no plata
// nueva.
export function externalFreeMoneyIncome(
  rows: { amount: number; kind: string | null; credit_month: number | null }[]
): number {
  return rows
    .filter((r) => r.amount > 0 && r.kind === null && r.credit_month === null)
    .reduce((sum, r) => sum + r.amount, 0)
}

// Presupuesto de cada categoría EN ESE MES: lo que de verdad se le repartió
// (movimientos is_allocation, ver lib/monthlyAllocation.server.ts), no su monto
// configurado hoy. Solo cuentan las categorías con monto propio: la
// "general" recibe lo que sobra, no un presupuesto, y se deja afuera (igual
// que antes, que mostraba presupuesto solo en las de monto fijo).
export function categoryBudgetsForMonth(
  transactions: { category_id: string | null; amount: number; is_allocation: boolean }[],
  generalCategoryIds: ReadonlySet<string>
): Map<string, number> {
  const budgets = new Map<string, number>()
  for (const t of transactions) {
    if (!t.is_allocation || !t.category_id || t.amount <= 0) continue
    if (generalCategoryIds.has(t.category_id)) continue
    budgets.set(t.category_id, (budgets.get(t.category_id) ?? 0) + t.amount)
  }
  return budgets
}
