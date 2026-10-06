// Genera los depósitos reales del reparto mensual por categoría (ver
// migración 0015 y lib/monthlyAllocation.ts para el cálculo puro). Perezoso
// e idempotente, mismo criterio que lib/monthClose.ts y los gastos fijos con
// auto-repeat de app/(app)/page.tsx: se llama en cada carga, no hace nada si
// ya se generó este mes.
//
// Se llama desde el Dashboard (silencioso, para usuarios con
// auto_repeat_income) y desde updateProfile (mas/actions.ts) al confirmar el
// ingreso del mes — misma llamada en los dos casos: desde la migración 0020
// los pilares tienen un monto fijo (no un % del ingreso confirmado), así
// que no hay overrides que ajustar por mes, el reparto siempre da el mismo
// resultado mientras no cambien los montos en Mi Dinero.
//
// La condición "¿ya está confirmado este mes?" (auto_repeat_income, o
// income_confirmed_year/month coincide con hoy) vive acá adentro en vez de
// que cada llamador la repita.

import type { createClient } from '@/lib/supabase/server'
import { incomeCoverage, monthRangeFor, resolveTimeZone, todayIn } from '@/lib/dashboard'
import { distributeCents } from '@/lib/money'
import { computeMonthlyAllocation, type AllocationCategory } from '@/lib/monthlyAllocation'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// Si el ingreso confirmado no alcanza para los montos de los pilares (ver
// incomeCoverage en lib/dashboard.ts), el reparto NO se genera solo: la app
// le avisa al usuario cuánto falta y él decide (manual §2.1). Con
// `reduceToIncome: true` — lo pide el usuario con el botón "Reajustar
// automáticamente" — se reparte con los pilares reducidos proporcionalmente,
// igual que el Dashboard, solo para este mes (la configuración no se toca).
export async function ensureMonthlyAllocation(
  supabase: SupabaseClient,
  userId: string,
  options: { reduceToIncome?: boolean } = {}
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('base_income, auto_repeat_income, income_confirmed_year, income_confirmed_month, timezone')
    .eq('id', userId)
    .single()
  if (!profile) return

  const today = todayIn(resolveTimeZone(profile.timezone))
  const confirmedThisMonth =
    profile.auto_repeat_income ||
    (profile.income_confirmed_year === today.year && profile.income_confirmed_month === today.month)
  if (!confirmedThisMonth) return

  const { start, end } = monthRangeFor(today.year, today.month)

  // Ya se generó el reparto de este mes: no duplicar.
  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('is_allocation', true)
    .gte('date', start)
    .lte('date', end)
    .limit(1)
  if (existing && existing.length > 0) return

  const [{ data: pillars }, { data: categories }] = await Promise.all([
    supabase.from('pillars').select('id, monthly_amount').eq('user_id', userId),
    supabase
      .from('categories')
      .select('id, pillar_id, fixed_amount, is_general')
      .eq('user_id', userId)
      .is('deleted_at', null),
  ])

  const coverage = incomeCoverage(profile.base_income, pillars ?? [])
  if (coverage.isShort && !options.reduceToIncome) return
  const pillarScale = coverage.isShort ? coverage.scaleFactor : 1

  const categoriesByPillarId: Record<string, AllocationCategory[]> = {}
  for (const c of categories ?? []) {
    ;(categoriesByPillarId[c.pillar_id] ??= []).push({
      id: c.id,
      fixedAmount: c.fixed_amount,
      isGeneral: c.is_general,
    })
  }

  type Row = {
    user_id: string
    pillar_id: string
    category_id: string
    amount: number
    type: 'extra_income'
    is_allocation: true
    date: string
    description: null
  }
  const rowsToInsert: Row[] = []

  // Montos del mes por pilar. Si se redujeron al ingreso, se pasan a centavos
  // conservando el total exacto (la suma da el ingreso, sin perder centavos).
  const pillarList = pillars ?? []
  const pillarAmounts = coverage.isShort
    ? distributeCents(pillarList.map((p) => p.monthly_amount * pillarScale))
    : pillarList.map((p) => p.monthly_amount)

  for (const [index, pillar] of pillarList.entries()) {
    const cats = categoriesByPillarId[pillar.id] ?? []
    const allocation = computeMonthlyAllocation(pillarAmounts[index], cats)

    for (const row of allocation) {
      if (row.amount <= 0) continue
      rowsToInsert.push({
        user_id: userId,
        pillar_id: pillar.id,
        category_id: row.categoryId,
        amount: row.amount,
        type: 'extra_income',
        is_allocation: true,
        date: today.iso,
        description: null,
      })
    }
  }

  if (rowsToInsert.length === 0) return
  await supabase.from('transactions').insert(rowsToInsert)
}
