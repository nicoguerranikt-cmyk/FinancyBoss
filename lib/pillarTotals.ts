// Acumulado de un pilar a partir de TODOS sus movimientos. Una categoría
// eliminada es un borrado suave (deleted_at): sus movimientos se conservan, así
// que su plata sigue existiendo en el pilar. Si el total solo sumara las
// categorías activas, eliminar una categoría haría desaparecer su saldo del
// total sin que nadie lo moviera. Por eso se separan tres grupos y el total
// siempre es la suma de los tres.

export type PillarMovement = { category_id: string | null; amount: number }

export function summarizePillarMovements(movements: PillarMovement[], activeCategoryIds: ReadonlySet<string>) {
  const byCategoryId: Record<string, number> = {}
  let sinCategoria = 0
  let categoriasEliminadas = 0

  for (const m of movements) {
    if (!m.category_id) {
      sinCategoria += m.amount
      continue
    }
    byCategoryId[m.category_id] = (byCategoryId[m.category_id] ?? 0) + m.amount
    if (!activeCategoryIds.has(m.category_id)) categoriasEliminadas += m.amount
  }

  const activas = Object.entries(byCategoryId)
    .filter(([id]) => activeCategoryIds.has(id))
    .reduce((sum, [, amount]) => sum + amount, 0)

  return {
    byCategoryId,
    sinCategoria,
    categoriasEliminadas,
    total: activas + sinCategoria + categoriasEliminadas,
  }
}
