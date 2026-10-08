// Datos del pilar Gasto, compartidos entre la pantalla "elegí" (page.tsx),
// "Gastos fijos" (fijos/page.tsx) y "Gastos del día a día" (cotidianos/page.tsx)
// — separarlos en pantallas propias fue pedido del usuario (antes vivían
// juntos en una sola lista larga). Un solo lugar para las 4 consultas evita
// triplicarlas entre las 3 pantallas.

import { createClient } from '@/lib/supabase/server'
import type { PillarName } from '@/lib/dashboard'
import { summarizePillarMovements } from '@/lib/pillarTotals'
import type { CategoryListRow } from './CategoryCard'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function loadGastoPillarData(supabase: SupabaseClient, userId: string, pillarId: string) {
  const [{ data: pillarRow, error: pillarError }, { data: categories }, { data: transactions }] = await Promise.all([
    supabase.from('pillars').select('id, name, monthly_amount').eq('id', pillarId).eq('user_id', userId).maybeSingle(),
    supabase
      .from('categories')
      .select(
        'id, name, fixed_amount, is_general, auto_repeat, fixed_start_date, fixed_interval_unit, fixed_interval_count'
      )
      .eq('pillar_id', pillarId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase.from('transactions').select('category_id, amount, date, kind').eq('user_id', userId).eq('pillar_id', pillarId),
  ])

  // La página que llama a esto hace `if (!data.pillar) notFound()` — sin
  // este log, un error transitorio de Supabase (red, sesión refrescándose)
  // se ve idéntico a "el pilar no existe" y termina en un 404 sin pista de
  // qué pasó. Esto no cambia el comportamiento, solo lo hace diagnosticable.
  if (pillarError) {
    console.error('[loadGastoPillarData] pillar query error:', {
      message: pillarError.message,
      details: pillarError.details,
      hint: pillarError.hint,
      code: pillarError.code,
      pillarId,
    })
  }

  // Última fecha con transacción por categoría — usado en fijos/page.tsx
  // para saber si un gasto fijo con cuota vencida ya se confirmó este mes
  // (mismo chequeo que hace confirmFixedExpense en mi-dinero/actions.ts).
  const lastTransactionDateByCategoryId: Record<string, string> = {}
  for (const t of transactions ?? []) {
    // Solo los gastos (amount < 0) cuentan como pago: un reparto o un
    // ingreso extra no confirman una cuota (ver lastFixedExpensePaymentDate).
    if (
      t.category_id &&
      t.amount < 0 &&
      (!lastTransactionDateByCategoryId[t.category_id] || t.date > lastTransactionDateByCategoryId[t.category_id])
    ) {
      lastTransactionDateByCategoryId[t.category_id] = t.date
    }
  }

  const pillar = pillarRow as { id: string; name: PillarName; monthly_amount: number } | null
  const allCategories: CategoryListRow[] = categories ?? []
  const fixedCategories = allCategories.filter((c) => c.fixed_amount !== null)
  const everydayCategories = allCategories.filter((c) => c.fixed_amount === null)

  // Un gasto del día a día (kind 'daily_spend') se registra en su categoría de
  // Gasto pero NO es plata del pilar: sale de Dinero libre o de Ahorro. Por eso
  // el total del pilar y el de los gastos fijos no lo cuentan; en las
  // categorías del día a día sí se ve lo gastado (negativo).
  const activeIds = new Set(allCategories.map((c) => c.id))
  const allRows = transactions ?? []
  const pillarRows = allRows.filter((t) => t.kind !== 'daily_spend')
  const byCategory = summarizePillarMovements(allRows, activeIds).byCategoryId
  // Una categoría eliminada (borrado suave) conserva sus movimientos: su plata
  // sigue en el pilar, así que cuenta en el total (ver lib/pillarTotals.ts).
  const {
    sinCategoria,
    categoriasEliminadas,
    total: totalAcumulado,
  } = summarizePillarMovements(pillarRows, activeIds)
  const accumulatedByCategoryId = byCategory

  const sum = (rows: CategoryListRow[]) => rows.reduce((s, c) => s + (accumulatedByCategoryId[c.id] ?? 0), 0)
  // Lo que no está en una categoría activa (movimientos directos al pilar y
  // categorías eliminadas) va con los gastos fijos, así los gastos fijos son
  // siempre el total del pilar.
  const fixedAccumulated = sum(fixedCategories) + sinCategoria + categoriasEliminadas
  // Gastos del día a día: lo gastado (negativo), sin presupuesto. Se suma lo
  // de sus categorías activas, lo registrado sin categoría y lo de categorías
  // eliminadas, para que el total sea todo lo gastado en el día a día.
  const dailyRows = allRows.filter((t) => t.kind === 'daily_spend')
  const everydaySinCategoria = dailyRows.filter((t) => !t.category_id).reduce((s, t) => s + t.amount, 0)
  const everydayEliminadas = dailyRows
    .filter((t) => t.category_id && !activeIds.has(t.category_id))
    .reduce((s, t) => s + t.amount, 0)
  const everydayAccumulated = sum(everydayCategories) + everydaySinCategoria + everydayEliminadas

  return {
    pillar,
    allCategories,
    fixedCategories,
    everydayCategories,
    accumulatedByCategoryId,
    lastTransactionDateByCategoryId,
    sinCategoria,
    categoriasEliminadas,
    everydaySinCategoria,
    everydayEliminadas,
    fixedAccumulated,
    everydayAccumulated,
    totalAcumulado,
  }
}
