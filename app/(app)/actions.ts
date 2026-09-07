'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  computeDashboard,
  monthRangeInBolivia,
  monthRangeUtcInstant,
  todayInBolivia,
  type CategoryFixedRow,
} from '@/lib/dashboard'
import { EPSILON, buildCaso1Message, computeDominoPillarAdjustments } from '@/lib/domino'
import { getCarriedOverByPillarId } from '@/lib/monthClose'

export type RegisterTransactionInput = {
  type: 'expense' | 'extra_income'
  pillarId: string
  categoryId: string | null
  amount: number // sin signo, > 0 — el signo se deriva acá según el tipo
  description?: string
}

// Caso 1 (manual §4.3): informativo, con un botón opcional para cubrir el
// exceso de HOY con Ahorro — no bloquea nada.
// Caso 2: el discrecional del MES quedó en negativo — hace falta que el
// usuario declare de dónde salió esa plata (resolveDeficit).
export type DominoOutcome =
  | { case: 1; message: string; transactionId: string; sourceCategoryId: string | null; amount: number }
  | { case: 2; deficitAmount: number; transactionId: string; sourceCategoryId: string | null }

export type RegisterTransactionResult = {
  error?: string
  domino?: DominoOutcome
}

export async function registerTransaction(
  input: RegisterTransactionInput
): Promise<RegisterTransactionResult> {
  // Validación en el servidor (nunca confiamos solo en el navegador).
  if (!(input.amount > 0)) {
    return { error: 'El monto debe ser mayor a 0.' }
  }
  if (input.type !== 'expense' && input.type !== 'extra_income') {
    return { error: 'Tipo de movimiento inválido.' }
  }
  if (!input.pillarId) {
    return { error: 'Elegí un pilar.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }
  }

  // El pillarId/categoryId vienen del cliente: un server action es un
  // endpoint público, así que hay que confirmar que de verdad son del
  // usuario logueado (esto además queda reforzado por las políticas RLS de
  // pillars/categories, que ya filtran por dueño).
  const { data: pillar } = await supabase
    .from('pillars')
    .select('id')
    .eq('id', input.pillarId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!pillar) {
    return { error: 'Pilar inválido.' }
  }

  let sourceCategory: { id: string; fixed_amount: number | null } | null = null
  if (input.categoryId) {
    const { data: category } = await supabase
      .from('categories')
      .select('id, fixed_amount')
      .eq('id', input.categoryId)
      .eq('user_id', user.id)
      .eq('pillar_id', input.pillarId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!category) {
      return { error: 'Categoría inválida.' }
    }
    sourceCategory = category
  }

  const signedAmount = input.type === 'expense' ? -input.amount : input.amount

  const { data: inserted, error } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      pillar_id: input.pillarId,
      category_id: input.categoryId,
      amount: signedAmount,
      type: input.type,
      description: input.description?.trim() || null,
      // Fecha en huso horario de Bolivia, no el del servidor (ver lib/dashboard.ts).
      date: todayInBolivia().iso,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[registerTransaction] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos guardar el movimiento. Probá de nuevo.' }
  }

  revalidatePath('/')

  // Efecto dominó (manual §4): solo lo dispara un GASTO variable (no fijo —
  // ese ya está comprometido por configuración, ver lib/dashboard.ts) contra
  // el pozo discrecional del pilar Gasto. Un ingreso extra nunca lo dispara.
  const isFixed = sourceCategory?.fixed_amount != null
  if (input.type !== 'expense' || isFixed) {
    return {}
  }

  const domino = await checkDominoAfterTransaction(supabase, {
    userId: user.id,
    transactionId: inserted.id,
    sourceCategoryId: input.categoryId,
  })

  return { domino }
}

async function checkDominoAfterTransaction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: { userId: string; transactionId: string; sourceCategoryId: string | null }
): Promise<DominoOutcome | undefined> {
  const { start, end } = monthRangeInBolivia()
  const { startUtc, endUtc } = monthRangeUtcInstant()
  const today = todayInBolivia()
  const todayIso = today.iso

  const [{ data: profile }, { data: pillars }, { data: categories }, { data: transactions }, { data: dominoEvents }, carriedOverByPillarId] =
    await Promise.all([
      supabase.from('profiles').select('base_income').eq('id', ctx.userId).single(),
      supabase.from('pillars').select('id, name, percentage').eq('user_id', ctx.userId),
      // Sin filtro de deleted_at: una categoría que fue afectada por un
      // dominó anterior este mes y se borró después igual tiene que poder
      // mapearse a su pilar más abajo (mismo motivo que en page.tsx).
      supabase.from('categories').select('id, pillar_id, fixed_amount, deleted_at').eq('user_id', ctx.userId),
      supabase
        .from('transactions')
        .select('pillar_id, category_id, amount, date')
        .eq('user_id', ctx.userId)
        .gte('date', start)
        .lte('date', end),
      supabase
        .from('domino_events')
        .select('source_category_id, affected_category_id, debt_id, amount')
        .eq('user_id', ctx.userId)
        .gte('created_at', startUtc)
        .lt('created_at', endUtc),
      getCarriedOverByPillarId(supabase, ctx.userId, today.year, today.month),
    ])

  const gastoPillar = pillars?.find((p) => p.name === 'gasto')
  const ahorroPillar = pillars?.find((p) => p.name === 'ahorro')
  if (!profile || !pillars || !gastoPillar || !ahorroPillar) return undefined // no debería pasar

  const fixedCategories: CategoryFixedRow[] = (categories ?? [])
    .filter((c) => !c.deleted_at && c.fixed_amount !== null)
    .map((c) => ({ id: c.id, pillar_id: c.pillar_id, fixed_amount: c.fixed_amount as number }))
  const categoryPillarById = Object.fromEntries((categories ?? []).map((c) => [c.id, c.pillar_id]))
  const dominoPillarAdjustments = computeDominoPillarAdjustments(
    dominoEvents ?? [],
    categoryPillarById,
    ahorroPillar.id,
    gastoPillar.id
  )

  const allTx = transactions ?? []
  const beforeTodayTx = allTx.filter((t) => t.date < todayIso)

  const base = {
    baseIncome: profile.base_income,
    pillars,
    fixedCategories,
    dominoPillarAdjustments,
    carriedOverByPillarId,
  }
  const dashboardAfter = computeDashboard({ ...base, transactionsThisMonth: allTx })
  const dashboardBefore = computeDashboard({ ...base, transactionsThisMonth: beforeTodayTx })

  const saldoGastoAfter = dashboardAfter.pillars.find((p) => p.pillar === 'gasto')?.saldo ?? 0

  // Caso 2: el discrecional del MES quedó en negativo — hace falta que el
  // usuario declare de dónde salió esa plata.
  if (saldoGastoAfter < -EPSILON) {
    return {
      case: 2,
      deficitAmount: -saldoGastoAfter,
      transactionId: ctx.transactionId,
      sourceCategoryId: ctx.sourceCategoryId,
    }
  }

  // Caso 1: todavía hay margen en el mes, pero puede que hoy se haya
  // gastado más que el ritmo diario de hoy. Nada bloquea, es solo informativo.
  const fixedCategoryIds = new Set(fixedCategories.map((c) => c.id))
  const todaySpent = allTx
    .filter(
      (t) => t.pillar_id === gastoPillar.id && t.date === todayIso && t.amount < 0 && !fixedCategoryIds.has(t.category_id ?? '')
    )
    .reduce((sum, t) => sum + -t.amount, 0)

  const dailyBefore = dashboardBefore.dailyBudget
  const dailyAfter = dashboardAfter.dailyBudget
  const overspendToday = Math.max(0, todaySpent - dailyBefore)

  if (overspendToday <= EPSILON) return undefined

  return {
    case: 1,
    message: buildCaso1Message(overspendToday, dailyBefore, dailyAfter),
    transactionId: ctx.transactionId,
    sourceCategoryId: ctx.sourceCategoryId,
    amount: overspendToday,
  }
}

// Botón opcional de Caso 1: "Cubrir con Ahorro" el exceso de HOY. No exige
// elegir subcategoría (a diferencia de resolveDeficit) — manual §4.3 solo
// describe un botón simple acá.
export async function coverWithAhorro(input: {
  transactionId: string
  sourceCategoryId: string | null
  amount: number
}): Promise<{ error?: string }> {
  if (!(input.amount > 0)) {
    return { error: 'Monto inválido.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }
  }

  const { data: tx } = await supabase
    .from('transactions')
    .select('id')
    .eq('id', input.transactionId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!tx) {
    return { error: 'Movimiento inválido.' }
  }

  const { error } = await supabase.from('domino_events').insert({
    user_id: user.id,
    transaction_id: input.transactionId,
    source_category_id: input.sourceCategoryId,
    affected_category_id: null,
    debt_id: null,
    amount: input.amount,
  })
  if (error) {
    console.error('[coverWithAhorro] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
    return { error: 'No pudimos registrar la cobertura. Probá de nuevo.' }
  }

  revalidatePath('/')
  return {}
}

// Diálogo obligatorio de Caso 2 (manual §4.3): el usuario declara de dónde
// salió la plata que no existía. "future_days" no escribe nada (es la
// consecuencia puramente matemática); "extra_income" tampoco pasa por acá —
// se resuelve abriendo el flujo normal de registerTransaction con
// type: 'extra_income'.
export type ResolveDeficitInput = {
  choice: 'future_days' | 'ahorro' | 'inversion' | 'debt'
  transactionId: string
  sourceCategoryId: string | null
  amount: number
  categoryId?: string // requerido para 'ahorro' | 'inversion'
  debtName?: string // requerido para 'debt'
}

export async function resolveDeficit(input: ResolveDeficitInput): Promise<{ error?: string }> {
  if (!(input.amount > 0)) {
    return { error: 'Monto inválido.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }
  }

  const { data: tx } = await supabase
    .from('transactions')
    .select('id')
    .eq('id', input.transactionId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!tx) {
    return { error: 'Movimiento inválido.' }
  }

  if (input.choice === 'future_days') {
    return {}
  }

  if (input.choice === 'ahorro' || input.choice === 'inversion') {
    if (!input.categoryId) {
      return { error: 'Elegí una subcategoría.' }
    }

    const { data: category } = await supabase
      .from('categories')
      .select('id, pillar_id')
      .eq('id', input.categoryId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!category) {
      return { error: 'Categoría inválida.' }
    }

    const { data: pillar } = await supabase
      .from('pillars')
      .select('id, name')
      .eq('id', category.pillar_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!pillar || pillar.name !== input.choice) {
      return { error: 'Esa categoría no pertenece al pilar elegido.' }
    }

    const { error } = await supabase.from('domino_events').insert({
      user_id: user.id,
      transaction_id: input.transactionId,
      source_category_id: input.sourceCategoryId,
      affected_category_id: category.id,
      debt_id: null,
      amount: input.amount,
    })
    if (error) {
      console.error('[resolveDeficit] domino_events insert error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      })
      return { error: 'No pudimos guardar la resolución. Probá de nuevo.' }
    }

    revalidatePath('/')
    return {}
  }

  // choice === 'debt'
  const name = input.debtName?.trim()
  if (!name) {
    return { error: 'Ingresá quién te prestó la plata.' }
  }

  // Deudas v2 (manual §6): crear la deuda no configura ningún plan de pago
  // automático — el usuario la paga después, a mano, cuando quiera.
  const { data: debt, error: debtError } = await supabase
    .from('debts')
    .insert({
      user_id: user.id,
      name,
      total_amount: input.amount,
      remaining_amount: input.amount,
      monthly_payment: null,
      status: 'active',
    })
    .select('id')
    .single()

  if (debtError || !debt) {
    console.error('[resolveDeficit] debts insert error:', {
      message: debtError?.message,
      details: debtError?.details,
      hint: debtError?.hint,
      code: debtError?.code,
    })
    return { error: 'No pudimos registrar el préstamo. Probá de nuevo.' }
  }

  const { error } = await supabase.from('domino_events').insert({
    user_id: user.id,
    transaction_id: input.transactionId,
    source_category_id: input.sourceCategoryId,
    affected_category_id: null,
    debt_id: debt.id,
    amount: input.amount,
  })
  if (error) {
    console.error('[resolveDeficit] domino_events insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
    return { error: 'No pudimos guardar la resolución. Probá de nuevo.' }
  }

  revalidatePath('/')
  return {}
}
