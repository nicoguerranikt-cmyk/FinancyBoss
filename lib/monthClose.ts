// Cierre de mes y arrastre de saldo (manual.md §3.3/§8). Cerrar un mes ya
// terminado es aritmética sobre algo que no puede cambiar más — no crea
// ninguna transacción ni toca ningún saldo de hoy, así que se hace solo,
// perezoso e idempotente (mismo criterio que los gastos fijos con
// auto-repeat en app/(app)/page.tsx), sin pedir confirmación.
//
// A diferencia de esos gastos fijos (chequeos de un solo mes,
// independientes entre sí), cerrar meses es una cadena secuencial: el
// arrastre de cada mes depende del anterior recién escrito. Por eso vive en
// un solo lugar (mismo criterio que lib/pillarSource.ts) en vez de
// duplicarse entre page.tsx del Dashboard y de Estadísticas.

import type { createClient } from '@/lib/supabase/server'
import {
  computeDashboard,
  daysInMonth,
  dateInBolivia,
  monthRangeFor,
  monthRangeUtcInstantFor,
  todayInBolivia,
  type CategoryFixedRow,
  type PillarRow,
  type TransactionRow,
} from '@/lib/dashboard'
import { computeDominoPillarAdjustments } from '@/lib/domino'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

// Arrastre entrante de un mes: el saldo final que dejó el mes anterior en
// monthly_budgets. 0 si no hay fila (primer mes, o el anterior no cerró
// todavía por algún motivo).
export async function getCarriedOverByPillarId(
  supabase: SupabaseClient,
  userId: string,
  year: number,
  month: number
): Promise<Record<string, number>> {
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }

  const { data: rows } = await supabase
    .from('monthly_budgets')
    .select('pillar_id, budgeted_amount, carried_over, spent_amount')
    .eq('user_id', userId)
    .is('category_id', null)
    .eq('year', prev.year)
    .eq('month', prev.month)

  const result: Record<string, number> = {}
  for (const row of rows ?? []) {
    result[row.pillar_id] = row.budgeted_amount + row.carried_over - row.spent_amount
  }
  return result
}

async function closeOneMonth(
  supabase: SupabaseClient,
  userId: string,
  year: number,
  month: number,
  baseIncome: number
): Promise<void> {
  const { start, end } = monthRangeFor(year, month)
  const { startUtc, endUtc } = monthRangeUtcInstantFor(year, month)

  const [{ data: pillars }, { data: categories }, { data: transactions }, { data: dominoEvents }, carriedOverByPillarId] =
    await Promise.all([
      supabase.from('pillars').select('id, name, percentage').eq('user_id', userId),
      supabase.from('categories').select('id, pillar_id, fixed_amount, deleted_at').eq('user_id', userId),
      supabase
        .from('transactions')
        .select('pillar_id, category_id, amount')
        .eq('user_id', userId)
        .gte('date', start)
        .lte('date', end),
      supabase
        .from('domino_events')
        .select('source_category_id, affected_category_id, debt_id, amount')
        .eq('user_id', userId)
        .gte('created_at', startUtc)
        .lt('created_at', endUtc),
      getCarriedOverByPillarId(supabase, userId, year, month),
    ])

  const typedPillars: PillarRow[] = pillars ?? []
  const ahorroPillarId = typedPillars.find((p) => p.name === 'ahorro')?.id ?? ''
  const gastoPillarId = typedPillars.find((p) => p.name === 'gasto')?.id ?? ''
  const categoryPillarById = Object.fromEntries((categories ?? []).map((c) => [c.id, c.pillar_id]))
  const dominoPillarAdjustments = computeDominoPillarAdjustments(
    dominoEvents ?? [],
    categoryPillarById,
    ahorroPillarId,
    gastoPillarId
  )

  const fixedCategories: CategoryFixedRow[] = (categories ?? [])
    .filter((c) => !c.deleted_at && c.fixed_amount !== null)
    .map((c) => ({ id: c.id, pillar_id: c.pillar_id, fixed_amount: c.fixed_amount as number }))

  const dashboard = computeDashboard({
    baseIncome,
    pillars: typedPillars,
    transactionsThisMonth: (transactions ?? []) as TransactionRow[],
    fixedCategories,
    dominoPillarAdjustments,
    carriedOverByPillarId,
    today: { year, month, day: daysInMonth(year, month) },
  })

  const rows = dashboard.pillars.map((p) => ({
    user_id: userId,
    pillar_id: p.id,
    category_id: null,
    month,
    year,
    budgeted_amount: p.budget,
    carried_over: p.carriedOver,
    spent_amount: p.budget + p.carriedOver - p.saldo,
  }))
  if (rows.length === 0) return

  const { error } = await supabase.from('monthly_budgets').insert(rows)
  if (error && error.code !== '23505') {
    // 23505 = ya lo cerró otra carga de página en simultáneo — no es un
    // error real, solo una carrera benigna.
    console.error('[closeOneMonth] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      year,
      month,
    })
  }
}

// Cierra, en orden cronológico, todos los meses ya terminados que todavía
// no tengan fila en monthly_budgets.
export async function closeElapsedMonths(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: profile } = await supabase.from('profiles').select('base_income, created_at').eq('id', userId).single()
  if (!profile) return

  const { data: lastClosed } = await supabase
    .from('monthly_budgets')
    .select('year, month')
    .eq('user_id', userId)
    .is('category_id', null)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle()

  let cursor = lastClosed
    ? nextMonth(lastClosed.year, lastClosed.month)
    : dateInBolivia(new Date(profile.created_at))

  const today = todayInBolivia()

  while (cursor.year < today.year || (cursor.year === today.year && cursor.month < today.month)) {
    await closeOneMonth(supabase, userId, cursor.year, cursor.month, profile.base_income)
    cursor = nextMonth(cursor.year, cursor.month)
  }
}
