// Dashboard (manual.md v2.0, secciones 4-5 y 9): el presupuesto diario
// disponible es el número más prominente de la pantalla, junto con los
// saldos en tiempo real de cada pilar y el acceso rápido para registrar un
// movimiento.

import { createClient } from '@/lib/supabase/server'
import {
  computeDashboard,
  monthRangeInBolivia,
  monthRangeUtcInstant,
  type CategoryFixedRow,
  type PillarName,
} from '@/lib/dashboard'
import { computeDominoPillarAdjustments } from '@/lib/domino'
import { formatBs } from '@/lib/format'
import QuickAddForm from './QuickAddForm'

const PILLAR_LABEL: Record<PillarName, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // El layout ya garantiza que hay sesión y perfil; user siempre existe acá.
  const userId = user!.id

  const { start, end } = monthRangeInBolivia()
  const { startUtc, endUtc } = monthRangeUtcInstant()

  // Todas las categorías del usuario (sin filtrar deleted_at: una categoría
  // borrada que fue afectada por un dominó igual tiene que poder mapearse a
  // su pilar más abajo). Se usa tanto para generar los gastos fijos
  // pendientes del mes como para las consultas que siguen.
  const { data: categories } = await supabase
    .from('categories')
    .select('id, pillar_id, name, fixed_amount, auto_repeat, deleted_at')
    .eq('user_id', userId)

  // Gastos fijos con auto_repeat: si todavía no tienen una transacción este
  // mes, se generan acá mismo (no hay infraestructura de cron en el
  // proyecto). Perezoso e idempotente: se revisa en cada carga del Dashboard.
  const autoFixed = (categories ?? []).filter(
    (c) => !c.deleted_at && c.auto_repeat && c.fixed_amount !== null
  )
  if (autoFixed.length > 0) {
    const categoryIds = autoFixed.map((c) => c.id)
    const { data: existing } = await supabase
      .from('transactions')
      .select('category_id')
      .eq('user_id', userId)
      .in('category_id', categoryIds)
      .gte('date', start)
      .lte('date', end)
    const yaGenerados = new Set((existing ?? []).map((e) => e.category_id))
    const faltantes = autoFixed.filter((c) => !yaGenerados.has(c.id))
    if (faltantes.length > 0) {
      await supabase.from('transactions').insert(
        faltantes.map((c) => ({
          user_id: userId,
          pillar_id: c.pillar_id,
          category_id: c.id,
          amount: -(c.fixed_amount as number),
          type: 'expense' as const,
          description: null,
          date: start, // 1° del mes
        }))
      )
    }
  }

  const [{ data: profile }, { data: pillars }, { data: transactions }, { data: debts }, { data: dominoEvents }] =
    await Promise.all([
      supabase.from('profiles').select('base_income').eq('id', userId).single(),
      supabase.from('pillars').select('id, name, percentage').eq('user_id', userId),
      supabase
        .from('transactions')
        .select('pillar_id, category_id, amount')
        .eq('user_id', userId)
        .gte('date', start)
        .lte('date', end),
      supabase.from('debts').select('monthly_payment').eq('user_id', userId).eq('status', 'active'),
      supabase
        .from('domino_events')
        .select('source_category_id, affected_category_id, debt_id, amount')
        .eq('user_id', userId)
        .gte('created_at', startUtc)
        .lt('created_at', endUtc),
    ])

  const ahorroPillarId = pillars?.find((p) => p.name === 'ahorro')?.id ?? ''
  const gastoPillarId = pillars?.find((p) => p.name === 'gasto')?.id ?? ''
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
    baseIncome: profile?.base_income ?? 0,
    pillars: pillars ?? [],
    transactionsThisMonth: transactions ?? [],
    fixedCategories,
    activeDebts: debts ?? [],
    dominoPillarAdjustments,
  })

  const activeCategories = (categories ?? []).filter((c) => !c.deleted_at)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      {/* Presupuesto diario disponible: el número más importante de la app. */}
      <section className="text-center">
        <p className="text-sm text-zinc-500">Podés gastar hoy</p>
        <p
          className={`mt-1 text-5xl font-semibold tracking-tight tabular-nums ${
            dashboard.isDeficit ? 'text-red-600' : ''
          }`}
        >
          {formatBs(dashboard.dailyBudget)} Bs
        </p>
        {dashboard.isDeficit && (
          <p className="mt-2 text-sm text-red-600">
            Te excediste del presupuesto de Gasto este mes.
          </p>
        )}
      </section>

      {/* Saldos por pilar en tiempo real. */}
      <section className="grid grid-cols-3 gap-3">
        {dashboard.pillars.map((p) => (
          <div
            key={p.pillar}
            className="rounded-xl border border-zinc-200 p-3 text-center dark:border-zinc-800"
          >
            <p className="text-xs text-zinc-500">{PILLAR_LABEL[p.pillar]}</p>
            <p
              className={`mt-1 text-lg font-semibold tabular-nums ${
                p.saldo < 0 ? 'text-red-600' : ''
              }`}
            >
              {formatBs(p.saldo)} Bs
            </p>
          </div>
        ))}
      </section>

      {/* Acceso rápido a registrar gasto/ingreso extra. */}
      <QuickAddForm pillars={pillars ?? []} categories={activeCategories} />
    </div>
  )
}
