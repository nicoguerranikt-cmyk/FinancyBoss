// Estadísticas (manual.md v2.0, sección 8): selector de mes navegable. El
// mes en curso se calcula en vivo (igual que el Dashboard); los meses
// pasados leen el resumen congelado en monthly_budgets (ver
// lib/monthClose.ts) para "presupuesto asignado / saldo acumulado", y
// calculan en vivo el resto (categorías, dominó, deudas, deudores) contra
// las fechas de ese mes — esos datos son hechos históricos, no cambian
// según cuándo se consulten.

import { createClient } from '@/lib/supabase/server'
import {
  computeDashboard,
  dateIn,
  daysInMonth,
  monthRangeFor,
  monthRangeUtcInstantFor,
  resolveTimeZone,
  todayIn,
  type PillarName,
  type PillarRow,
} from '@/lib/dashboard'
import { computeDominoPillarAdjustments } from '@/lib/domino'
import { isFixedExpenseScheduled, monthlyReserveAmount } from '@/lib/fixedExpense'
import { closeElapsedMonths, getCarriedOverByPillarId } from '@/lib/monthClose'
import { categoryBudgetsForMonth, incomeForMonth } from '@/lib/statsHistory'
import EstadisticasView, {
  type CategoryStat,
  type DebtStat,
  type DebtorStat,
  type DonutSegment,
  type PillarStat,
  type TrendPoint,
} from './EstadisticasView'
import PageReadySignal from '../PageReadySignal'

const PILLAR_LABEL: Record<PillarName, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const TREND_MONTHS = 6

function toAbsoluteMonth(year: number, month: number) {
  return year * 12 + (month - 1)
}
function fromAbsoluteMonth(abs: number) {
  return { year: Math.floor(abs / 12), month: (abs % 12) + 1 }
}

export default async function EstadisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // El layout ya garantiza que hay sesión y perfil; user siempre existe acá.
  const userId = user!.id

  await closeElapsedMonths(supabase, userId)

  const { data: profile } = await supabase
    .from('profiles')
    .select('base_income, created_at, timezone')
    .eq('id', userId)
    .single()
  const baseIncome = profile?.base_income ?? 0

  const timeZone = resolveTimeZone(profile?.timezone)
  const today = todayIn(timeZone)
  const earliest = profile?.created_at ? dateIn(new Date(profile.created_at), timeZone) : today
  const minAbs = toAbsoluteMonth(earliest.year, earliest.month)
  const maxAbs = toAbsoluteMonth(today.year, today.month)

  const params = await searchParams
  const requestedAbs = toAbsoluteMonth(Number(params.year) || today.year, Number(params.month) || today.month)
  const clampedAbs = Math.min(maxAbs, Math.max(minAbs, requestedAbs))
  const { year, month } = fromAbsoluteMonth(clampedAbs)
  const isCurrentMonth = clampedAbs === maxAbs

  const { start, end } = monthRangeFor(year, month)
  const { startUtc, endUtc } = monthRangeUtcInstantFor(year, month, timeZone)

  const [
    { data: pillars },
    { data: categories },
    { data: transactions },
    { data: dominoEvents },
    { data: debts },
    { data: debtors },
    { data: budgetHistory },
  ] = await Promise.all([
    supabase.from('pillars').select('id, name, monthly_amount').eq('user_id', userId),
    supabase
      .from('categories')
      .select(
        'id, name, pillar_id, fixed_amount, is_general, auto_repeat, fixed_start_date, fixed_interval_unit, fixed_interval_count, fixed_reserve_ahead, deleted_at'
      )
      .eq('user_id', userId),
    supabase
      .from('transactions')
      .select('pillar_id, category_id, amount, type, debt_id, debtor_id, is_allocation')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end),
    supabase
      .from('domino_events')
      .select('source_category_id, affected_category_id, debt_id, amount')
      .eq('user_id', userId)
      .gte('created_at', startUtc)
      .lt('created_at', endUtc),
    supabase.from('debts').select('id, name, remaining_amount, status').eq('user_id', userId),
    supabase.from('debtors').select('id, name, remaining_amount, status').eq('user_id', userId),
    supabase
      .from('monthly_budgets')
      .select('pillar_id, year, month, budgeted_amount, carried_over, spent_amount, income_amount')
      .eq('user_id', userId)
      .is('category_id', null),
  ])

  const typedPillars: PillarRow[] = pillars ?? []
  const allTx = transactions ?? []
  const categoryById = Object.fromEntries((categories ?? []).map((c) => [c.id, c]))
  const ahorroPillarId = typedPillars.find((p) => p.name === 'ahorro')?.id ?? ''
  const gastoPillarId = typedPillars.find((p) => p.name === 'gasto')?.id ?? ''

  // ---------- Por pilar: presupuesto asignado, arrastre, saldo ----------
  let pillarStats: PillarStat[]
  if (isCurrentMonth) {
    const categoryPillarById = Object.fromEntries((categories ?? []).map((c) => [c.id, c.pillar_id]))
    const dominoPillarAdjustments = computeDominoPillarAdjustments(
      dominoEvents ?? [],
      categoryPillarById,
      ahorroPillarId,
      gastoPillarId
    )
    const carriedOverByPillarId = await getCarriedOverByPillarId(supabase, userId, year, month)

    // isCurrentMonth === true acá siempre (este bloque solo corre en ese
    // caso), así que la reserva se calcula contra "hoy" de verdad.
    const daysThisMonth = daysInMonth(year, month)
    const fixedReserveByPillarId: Record<string, number> = {}
    const reservedCategoryIds: string[] = []
    for (const c of categories ?? []) {
      if (c.deleted_at || !c.auto_repeat || !c.fixed_reserve_ahead || !isFixedExpenseScheduled(c)) continue
      reservedCategoryIds.push(c.id)
      const reserve = monthlyReserveAmount(c, today, daysThisMonth)
      fixedReserveByPillarId[c.pillar_id] = (fixedReserveByPillarId[c.pillar_id] ?? 0) + reserve
    }

    const dashboard = computeDashboard({
      baseIncome,
      pillars: typedPillars,
      transactionsThisMonth: allTx,
      fixedReserveByPillarId,
      reservedCategoryIds,
      dominoPillarAdjustments,
      carriedOverByPillarId,
      today: { year, month, day: daysThisMonth },
    })
    pillarStats = dashboard.pillars.map((p) => ({
      pillar: p.pillar,
      budgeted: p.budget,
      carriedIn: p.carriedOver,
      saldo: p.saldo,
      closed: false,
    }))
  } else {
    const rows = (budgetHistory ?? []).filter((r) => r.year === year && r.month === month)
    const byPillarId = Object.fromEntries(rows.map((r) => [r.pillar_id, r]))
    pillarStats = typedPillars.map((p) => {
      const row = byPillarId[p.id]
      const budgeted = row?.budgeted_amount ?? 0
      const carriedIn = row?.carried_over ?? 0
      const spent = row?.spent_amount ?? 0
      return { pillar: p.name, budgeted, carriedIn, saldo: budgeted + carriedIn - spent, closed: true }
    })
  }

  // ---------- Tendencia: saldo por pilar en los últimos meses ----------
  const budgetByKey = new Map<string, { budgeted_amount: number; carried_over: number; spent_amount: number }>()
  for (const r of budgetHistory ?? []) {
    budgetByKey.set(`${r.year}-${r.month}-${r.pillar_id}`, r)
  }
  const trendAbs = Array.from({ length: TREND_MONTHS }, (_, i) => clampedAbs - (TREND_MONTHS - 1 - i)).filter(
    (abs) => abs >= minAbs
  )
  const trendPoints: TrendPoint[] = trendAbs.map((abs) => {
    const { year: y, month: m } = fromAbsoluteMonth(abs)
    const label = MONTH_SHORT[m - 1]
    const saldoByPillar: Record<PillarName, number> = { ahorro: 0, gasto: 0, inversion: 0 }
    if (abs === clampedAbs) {
      for (const p of pillarStats) saldoByPillar[p.pillar] = p.saldo
      return { label, saldoByPillar }
    }
    for (const p of typedPillars) {
      const row = budgetByKey.get(`${y}-${m}-${p.id}`)
      saldoByPillar[p.name] = row ? row.budgeted_amount + row.carried_over - row.spent_amount : 0
    }
    return { label, saldoByPillar }
  })

  // ---------- Ingreso total del mes ----------
  // is_allocation se excluye: es el reparto del propio baseIncome en
  // categorías (ver migración 0015), no ingreso nuevo — si no, se contaría
  // dos veces.
  const extraIncome = allTx
    .filter((t) => t.type === 'extra_income' && !t.is_allocation)
    .reduce((sum, t) => sum + t.amount, 0)
  // Un mes cerrado usa el ingreso con el que se cerró, no el sueldo de hoy
  // (ver lib/statsHistory.ts).
  const storedIncome = (budgetHistory ?? []).find((r) => r.year === year && r.month === month)?.income_amount
  const totalIncome = incomeForMonth({ isCurrentMonth, currentBaseIncome: baseIncome, storedIncome }) + extraIncome

  // ---------- Por subcategoría ----------
  const spentByCategory = new Map<string, number>()
  for (const t of allTx) {
    if (t.type !== 'expense' || !t.category_id) continue
    spentByCategory.set(t.category_id, (spentByCategory.get(t.category_id) ?? 0) + -t.amount)
  }
  // Presupuesto de cada categoría EN ESE MES: lo que se le repartió, no su
  // monto configurado hoy (ver lib/statsHistory.ts).
  const generalCategoryIds = new Set((categories ?? []).filter((c) => c.is_general).map((c) => c.id))
  const budgetByCategoryId = categoryBudgetsForMonth(allTx, generalCategoryIds)
  const categoryStats: CategoryStat[] = [...spentByCategory.entries()]
    .map(([categoryId, spent]) => {
      const category = categoryById[categoryId]
      return {
        name: category ? category.name + (category.deleted_at ? ' (eliminada)' : '') : 'Categoría eliminada',
        pillarLabel: category ? PILLAR_LABEL[typedPillars.find((p) => p.id === category.pillar_id)?.name ?? 'gasto'] : '—',
        budgeted: budgetByCategoryId.get(categoryId) ?? null,
        spent,
      }
    })
    .sort((a, b) => b.spent - a.spent)

  // ---------- Dona: proporción de gasto por categoría (dentro de Gasto) ----------
  const gastoExpenseTotal = allTx
    .filter((t) => t.type === 'expense' && t.pillar_id === gastoPillarId)
    .reduce((sum, t) => sum + -t.amount, 0)
  const gastoCategorySpent = [...spentByCategory.entries()]
    .filter(([categoryId]) => categoryById[categoryId]?.pillar_id === gastoPillarId)
    .map(([categoryId, value]) => ({ name: categoryById[categoryId]?.name ?? 'Categoría eliminada', value }))
    .sort((a, b) => b.value - a.value)
  const gastoCategorizedTotal = gastoCategorySpent.reduce((sum, c) => sum + c.value, 0)
  // Lo sin categoría más lo que excede las primeras 7 categorías se pliega
  // en un solo balde "Otros" (nunca se genera un 9° color). colorIndex fijo
  // 0-6 para categorías reales, 7 (gris) SIEMPRE para "Otros" — nunca por
  // posición en la lista, para que no herede el color de una categoría real.
  const donutSegments: DonutSegment[] = gastoCategorySpent
    .slice(0, 7)
    .map((c, i) => ({ ...c, colorIndex: i }))
  const foldedExcess = gastoCategorySpent.slice(7).reduce((sum, c) => sum + c.value, 0)
  const otros = gastoExpenseTotal - gastoCategorizedTotal + foldedExcess
  if (otros > 0.01) donutSegments.push({ name: 'Sin categoría / otros', value: otros, colorIndex: 7 })

  // ---------- Efecto dominó ----------
  const dominoCount = (dominoEvents ?? []).length
  const affectedTotals = new Map<string, number>()
  for (const e of dominoEvents ?? []) {
    if (!e.affected_category_id) continue
    affectedTotals.set(e.affected_category_id, (affectedTotals.get(e.affected_category_id) ?? 0) + e.amount)
  }
  const mostAffected = [...affectedTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([categoryId, amount]) => ({
      name: categoryById[categoryId]?.name ?? 'Categoría eliminada',
      amount,
    }))

  // ---------- Deudas / deudores ----------
  const paidByDebtId = new Map<string, number>()
  const collectedByDebtorId = new Map<string, number>()
  for (const t of allTx) {
    if (t.debt_id) paidByDebtId.set(t.debt_id, (paidByDebtId.get(t.debt_id) ?? 0) + -t.amount)
    if (t.debtor_id) collectedByDebtorId.set(t.debtor_id, (collectedByDebtorId.get(t.debtor_id) ?? 0) + t.amount)
  }
  const debtStats: DebtStat[] = (debts ?? [])
    .filter((d) => d.status !== 'archived' && (paidByDebtId.has(d.id) || d.status === 'active'))
    .map((d) => ({ name: d.name, remainingToday: d.remaining_amount, paidThisMonth: paidByDebtId.get(d.id) ?? 0 }))
  const debtorStats: DebtorStat[] = (debtors ?? [])
    .filter((d) => d.status !== 'archived' && (collectedByDebtorId.has(d.id) || d.status === 'pending'))
    .map((d) => ({
      name: d.name,
      remainingToday: d.remaining_amount,
      collectedThisMonth: collectedByDebtorId.get(d.id) ?? 0,
    }))

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <PageReadySignal />
      <EstadisticasView
        year={year}
        month={month}
        isCurrentMonth={isCurrentMonth}
        canGoPrev={clampedAbs > minAbs}
        canGoNext={clampedAbs < maxAbs}
        totalIncome={totalIncome}
        pillarStats={pillarStats}
        trendPoints={trendPoints}
        categoryStats={categoryStats}
        donutSegments={donutSegments}
        dominoCount={dominoCount}
        mostAffected={mostAffected}
        debtStats={debtStats}
        debtorStats={debtorStats}
      />
    </div>
  )
}
