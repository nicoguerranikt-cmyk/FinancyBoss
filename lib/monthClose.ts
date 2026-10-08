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
  dateIn,
  monthRangeFor,
  resolveTimeZone,
  todayIn,
  type PillarRow,
  type TransactionRow,
} from '@/lib/dashboard'

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

// Cierra UN mes. Devuelve false si no se pudo (alguna lectura falló o no se
// pudo guardar): el que llama deja de cerrar y el mes queda pendiente para el
// próximo intento — nunca se cierra con datos incompletos.
async function closeOneMonth(
  supabase: SupabaseClient,
  userId: string,
  year: number,
  month: number,
  baseIncome: number
): Promise<boolean> {
  const { start, end } = monthRangeFor(year, month)

  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }

  const [
    { data: pillars, error: pillarsError },
    { data: transactions, error: transactionsError },
    { data: carriedRows, error: carriedError },
  ] = await Promise.all([
    supabase.from('pillars').select('id, name, monthly_amount').eq('user_id', userId),
    supabase
      .from('transactions')
      .select('pillar_id, category_id, amount, is_allocation, kind')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end),
    supabase
      .from('monthly_budgets')
      .select('pillar_id, budgeted_amount, carried_over, spent_amount')
      .eq('user_id', userId)
      .is('category_id', null)
      .eq('year', prev.year)
      .eq('month', prev.month),
  ])

  // Una lectura con error NO es "no hay datos": cerrar con eso guardaría un
  // mes con cifras incompletas para siempre. Se aborta y se reintenta después.
  const readError = pillarsError ?? transactionsError ?? carriedError
  if (readError) {
    console.error('[closeOneMonth] read error, month not closed:', {
      message: readError.message,
      code: readError.code,
      year,
      month,
    })
    return false
  }

  const carriedOverByPillarId: Record<string, number> = {}
  for (const row of carriedRows ?? []) {
    carriedOverByPillarId[row.pillar_id] = row.budgeted_amount + row.carried_over - row.spent_amount
  }

  const typedPillars: PillarRow[] = pillars ?? []
  const closingDay = { year, month, day: daysInMonth(year, month) }

  const dashboard = computeDashboard({
    baseIncome,
    pillars: typedPillars,
    transactionsThisMonth: (transactions ?? []) as TransactionRow[],
    carriedOverByPillarId,
    today: closingDay,
  })

  const rows = dashboard.pillars.map((p) => ({
    pillar_id: p.id,
    budgeted_amount: p.budget,
    carried_over: p.carriedOver,
    spent_amount: p.budget + p.carriedOver - p.saldo,
  }))
  if (rows.length === 0) return true

  // El resumen de los pilares, el ingreso del mes (migración 0036) y el
  // sobrante a Dinero libre (migración 0021: lo que sobró de ingreso menos los
  // 3 montos de pilares, ver computeDashboard) se guardan JUNTOS en una
  // función de la base (migración 0038): se hace todo o nada. Antes eran dos
  // pedidos, y si fallaba el segundo el mes quedaba cerrado sin su sobrante y
  // el siguiente cierre ya no lo recuperaba. Es idempotente: si otra carga de
  // página ya cerró este mes, no duplica nada.
  const { error } = await supabase.rpc('save_month_close', {
    p_year: year,
    p_month: month,
    p_income: baseIncome,
    p_rows: rows,
    p_free_money: dashboard.freeMoney,
    p_end: end,
  })
  if (error) {
    console.error('[closeOneMonth] save error, month not closed:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      year,
      month,
    })
    return false
  }
  return true
}

// Al cruzar a un mes nuevo, una deuda/deudor ya "pagado" pasa solo a
// "archivado" (mismo estado que ya usa el archivado manual — Deudas §6.5,
// Deudores §7) para que no siga apareciendo en la lista. Se llama SOLO
// cuando de verdad se cerró al menos un mes (no en cada carga de página):
// lo pagado se sigue viendo el resto del mes en que se pagó, y recién
// desaparece al empezar el siguiente.
async function archivePaidDebtsAndDebtors(supabase: SupabaseClient, userId: string): Promise<void> {
  await Promise.all([
    supabase.from('debts').update({ status: 'archived' }).eq('user_id', userId).eq('status', 'paid'),
    supabase.from('debtors').update({ status: 'archived' }).eq('user_id', userId).eq('status', 'paid'),
  ])
}

// Cierra, en orden cronológico, todos los meses ya terminados que todavía
// no tengan fila en monthly_budgets.
export async function closeElapsedMonths(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('base_income, created_at, timezone')
    .eq('id', userId)
    .single()
  if (!profile) return
  const timeZone = resolveTimeZone(profile.timezone)

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
    : dateIn(new Date(profile.created_at), timeZone)

  const today = todayIn(timeZone)
  let closedAny = false

  while (cursor.year < today.year || (cursor.year === today.year && cursor.month < today.month)) {
    const closed = await closeOneMonth(supabase, userId, cursor.year, cursor.month, profile.base_income)
    // Si un mes no se pudo cerrar, no se salta al siguiente: cada mes usa el
    // arrastre del anterior. Queda pendiente para la próxima carga.
    if (!closed) break
    closedAny = true
    cursor = nextMonth(cursor.year, cursor.month)
  }

  if (closedAny) {
    await archivePaidDebtsAndDebtors(supabase, userId)
  }
}
