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
