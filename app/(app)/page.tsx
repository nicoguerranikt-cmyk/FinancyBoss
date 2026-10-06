// Dashboard (manual.md v2.0, secciones 4-5 y 9): el presupuesto diario
// disponible es el número más prominente de la pantalla, junto con los
// saldos en tiempo real de cada pilar y el acceso rápido para registrar un
// movimiento.

import Link from './AppLink'
import PageReadySignal from './PageReadySignal'
import { createClient } from '@/lib/supabase/server'
import {
  computeDashboard,
  daysInMonth,
  incomeCoverage,
  monthRangeInBolivia,
  monthRangeUtcInstant,
  todayInBolivia,
  type PillarName,
} from '@/lib/dashboard'
import { lastDueOccurrence } from '@/lib/debts'
import { computeDominoPillarAdjustments } from '@/lib/domino'
import {
  isFixedExpensePending,
  isFixedExpenseScheduled,
  lastFixedExpenseOccurrence,
  lastFixedExpensePaymentDate,
  monthlyReserveAmount,
} from '@/lib/fixedExpense'
import { formatBs } from '@/lib/format'
import { closeElapsedMonths, getCarriedOverByPillarId } from '@/lib/monthClose'
import { ensureMonthlyAllocation } from '@/lib/monthlyAllocation.server'
import { PILLAR_COLOR } from '@/lib/pillarColors'
import IncomeConfirmBanner from './IncomeConfirmBanner'
import IncomeShortfallBanner from './IncomeShortfallBanner'
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

  // Cierre de meses ya terminados (manual §3.3/§8): aritmética sobre algo
  // que no puede cambiar más, no crea ninguna transacción — se hace antes
  // de calcular nada del mes en curso para que el arrastre esté listo.
  await closeElapsedMonths(supabase, userId)

  const { start, end } = monthRangeInBolivia()
  const { startUtc, endUtc } = monthRangeUtcInstant()
  const today = todayInBolivia()

  // Todas las categorías del usuario (sin filtrar deleted_at: una categoría
  // borrada que fue afectada por un dominó igual tiene que poder mapearse a
  // su pilar más abajo). Se usa tanto para generar los gastos fijos
  // pendientes como para las consultas que siguen.
  const { data: categories } = await supabase
    .from('categories')
    .select(
      'id, pillar_id, name, fixed_amount, auto_repeat, fixed_start_date, fixed_interval_unit, fixed_interval_count, fixed_reserve_ahead, is_general, deleted_at'
    )
    .eq('user_id', userId)

  // Gastos fijos con auto_repeat: si la fecha configurada ya llegó, es un
  // RECORDATORIO — mismo criterio que el plan de pago automático de Deudas
  // (ver pendingAutoPayCount más abajo): nunca se descuenta solo por haber
  // llegado la fecha ("no asumir movimientos de plata"). El usuario confirma
  // desde Mi Dinero → esa categoría, con el botón "Ya lo pagué"
  // (confirmFixedExpense, mi-dinero/actions.ts). Acá solo contamos cuántos
  // están pendientes de confirmar, para el aviso de abajo.
  const autoFixed = (categories ?? []).filter(
    (c) => !c.deleted_at && c.auto_repeat && isFixedExpenseScheduled(c)
  )
  const dueOccurrenceByCategoryId: Record<string, string> = {}
  for (const c of autoFixed) {
    const due = lastFixedExpenseOccurrence(c, today)
    if (due) dueOccurrenceByCategoryId[c.id] = due
  }
  const dueCategoryIds = Object.keys(dueOccurrenceByCategoryId)

  let pendingFixedExpenseCount = 0
  if (dueCategoryIds.length > 0) {
    const { data: existing } = await supabase
      .from('transactions')
      .select('category_id, amount, date')
      .eq('user_id', userId)
      .in('category_id', dueCategoryIds)
    pendingFixedExpenseCount = dueCategoryIds.filter((id) => {
      const categoryTx = (existing ?? []).filter((tx) => tx.category_id === id)
      return isFixedExpensePending(dueOccurrenceByCategoryId[id], lastFixedExpensePaymentDate(categoryTx))
    }).length
  }

  // Reparto mensual real por categoría (manual.md — ver migración 0015):
  // perezoso e idempotente, mismo criterio que los gastos fijos de arriba.
  // Solo genera algo si el ingreso de este mes ya está confirmado
  // (auto_repeat_income, o el usuario ya lo confirmó manualmente) y todavía
  // no se generó — ver lib/monthlyAllocation.server.ts.
  await ensureMonthlyAllocation(supabase, userId)

  // Deudas con plan de pago automático (manual §6.2): es un recordatorio,
  // NUNCA se descuenta solo por haber llegado la fecha — el usuario confirma
  // desde /deudas con el botón "Ya la pagué". Acá solo contamos cuántas
  // están pendientes de confirmar, para el aviso de abajo.
  const { data: autoPayDebts } = await supabase
    .from('debts')
    .select(
      'id, auto_pay_amount, auto_pay_start_date, auto_pay_interval_unit, auto_pay_interval_count, auto_pay_pillar_id'
    )
    .eq('user_id', userId)
    .eq('status', 'active')
    .not('auto_pay_amount', 'is', null)

  const dueOccurrenceByDebtId: Record<string, string> = {}
  for (const d of autoPayDebts ?? []) {
    if (!d.auto_pay_pillar_id) continue
    const due = lastDueOccurrence(d, today)
    if (due) dueOccurrenceByDebtId[d.id] = due
  }
  const dueDebtIds = Object.keys(dueOccurrenceByDebtId)

  let pendingAutoPayCount = 0
  if (dueDebtIds.length > 0) {
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('debt_id, date')
      .in('debt_id', dueDebtIds)
    const lastConfirmedByDebtId: Record<string, string> = {}
    for (const tx of existingTx ?? []) {
      if (!tx.debt_id) continue
      if (!lastConfirmedByDebtId[tx.debt_id] || tx.date > lastConfirmedByDebtId[tx.debt_id]) {
        lastConfirmedByDebtId[tx.debt_id] = tx.date
      }
    }
    pendingAutoPayCount = dueDebtIds.filter(
      (id) => !lastConfirmedByDebtId[id] || lastConfirmedByDebtId[id] < dueOccurrenceByDebtId[id]
    ).length
  }

  const [
    { data: profile },
    { data: pillars },
    { data: transactions },
    { data: dominoEvents },
    carriedOverByPillarId,
    { data: freeMoneyRows },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('name, base_income, auto_repeat_income, income_confirmed_year, income_confirmed_month')
      .eq('id', userId)
      .single(),
    supabase.from('pillars').select('id, name, monthly_amount').eq('user_id', userId),
    supabase
      .from('transactions')
      .select('pillar_id, category_id, amount, is_allocation')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end),
    supabase
      .from('domino_events')
      .select('source_category_id, affected_category_id, debt_id, amount')
      .eq('user_id', userId)
      .gte('created_at', startUtc)
      .lt('created_at', endUtc),
    getCarriedOverByPillarId(supabase, userId, today.year, today.month),
    supabase.from('free_money_transactions').select('amount').eq('user_id', userId),
  ])
  // Dinero libre que se ve en el Dashboard: lo ya acreditado de meses
  // cerrados/movimientos a mano (free_money_transactions) MÁS lo que sobra
  // del mes en curso todavía sin cerrar (dashboard.freeMoney, calculado más
  // abajo) — es líquido real disponible AHORA, no algo que recién aparece
  // cuando termina el mes.
  const freeMoneyAccumulated = (freeMoneyRows ?? []).reduce((sum, r) => sum + r.amount, 0)

  const ahorroPillarId = pillars?.find((p) => p.name === 'ahorro')?.id ?? ''
  const gastoPillarId = pillars?.find((p) => p.name === 'gasto')?.id ?? ''
  const categoryPillarById = Object.fromEntries((categories ?? []).map((c) => [c.id, c.pillar_id]))
  const dominoPillarAdjustments = computeDominoPillarAdjustments(
    dominoEvents ?? [],
    categoryPillarById,
    ahorroPillarId,
    gastoPillarId
  )

  // Gastos fijos con "reservar desde ya" (fixed_reserve_ahead, migración
  // 0018): se restan del presupuesto diario aunque su transacción todavía
  // no exista, prorrateados según su frecuencia — mismo criterio "Crítico"
  // del manual.md §5.2, ahora opcional por categoría. Los que no la
  // activaron no pasan por acá: su transacción, ya generada arriba, es un
  // movimiento normal más.
  const daysThisMonth = daysInMonth(today.year, today.month)
  const fixedReserveByPillarId: Record<string, number> = {}
  const reservedCategoryIds: string[] = []
  for (const c of autoFixed) {
    if (!c.fixed_reserve_ahead) continue
    reservedCategoryIds.push(c.id)
    const reserve = monthlyReserveAmount(c, today, daysThisMonth)
    fixedReserveByPillarId[c.pillar_id] = (fixedReserveByPillarId[c.pillar_id] ?? 0) + reserve
  }

  const dashboard = computeDashboard({
    baseIncome: profile?.base_income ?? 0,
    pillars: pillars ?? [],
    transactionsThisMonth: transactions ?? [],
    fixedReserveByPillarId,
    reservedCategoryIds,
    dominoPillarAdjustments,
    carriedOverByPillarId,
  })

  const activeCategories = (categories ?? []).filter((c) => !c.deleted_at)

  // manual §3.1: si el ingreso no se repite solo, hay que confirmarlo a
  // mano al empezar cada mes. No bloquea nada mientras tanto — el cálculo
  // ya de arriba usa el último base_income guardado como estimación.
  const needsIncomeConfirmation =
    !profile?.auto_repeat_income &&
    (profile?.income_confirmed_year !== today.year || profile?.income_confirmed_month !== today.month)

  // Ingreso confirmado que no alcanza para los montos de los pilares: se
  // avisa y el usuario decide (reajustar solo o ajustar él). Mientras no
  // exista el reparto de este mes, la decisión sigue pendiente — por eso se
  // chequea también que no haya ninguna fila is_allocation todavía.
  const coverage = incomeCoverage(profile?.base_income ?? 0, pillars ?? [])
  const hasAllocationThisMonth = (transactions ?? []).some((t) => t.is_allocation)
  const showIncomeShortfall = coverage.isShort && !needsIncomeConfirmation && !hasAllocationThisMonth

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <PageReadySignal />
      {/* Presupuesto diario disponible: el número más importante de la app. */}
      <section className="text-center">
        <p className="text-sm text-zinc-500">Puedes gastar hoy</p>
        <p
          className={`mt-1 text-5xl font-semibold tracking-tight tabular-nums ${
            dashboard.isDeficit ? 'text-red-600' : ''
          }`}
        >
          {formatBs(dashboard.dailyBudget)} Bs
        </p>
        {dashboard.isDeficit ? (
          <p className="mt-2 text-sm text-red-600">
            Te excediste del presupuesto de Gasto este mes.
          </p>
        ) : (
          <div className="mx-auto mt-3 h-1 w-14 rounded-full bg-gradient-to-r from-brand to-brand-violet" />
        )}
      </section>

      {/* Saldos por pilar en tiempo real. */}
      <section className="grid grid-cols-3 gap-3">
        {dashboard.pillars.map((p) => (
          <div
            key={p.pillar}
            className="rounded-xl border border-zinc-200 p-3 text-center dark:border-zinc-800"
          >
            <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
              <span className={`h-2 w-2 rounded-full ${PILLAR_COLOR[p.pillar]}`} />
              {PILLAR_LABEL[p.pillar]}
            </p>
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

      {/* Dinero libre (migración 0021): plata sin destino fijo, ver detalle
          e historial en /mi-dinero/libre. Acumulado de meses cerrados +
          movimientos a mano, MÁS lo que sobra del mes en curso (ver arriba)
          — disponible ahora, no recién al cerrar el mes. */}
      <Link
        href="/mi-dinero/libre"
        className="flex items-center justify-between rounded-xl border-l-4 border-brand-violet bg-brand-violet/10 p-3 transition-colors hover:brightness-95 dark:hover:brightness-110"
      >
        <p className="text-sm font-medium">Dinero libre</p>
        <p className="text-sm font-semibold text-brand-violet">{formatBs(freeMoneyAccumulated + dashboard.freeMoney)} Bs →</p>
      </Link>

      {needsIncomeConfirmation && (
        <IncomeConfirmBanner name={profile?.name ?? ''} baseIncome={profile?.base_income ?? 0} />
      )}

      {showIncomeShortfall && (
        <IncomeShortfallBanner
          income={profile?.base_income ?? 0}
          committed={coverage.committed}
          shortfall={coverage.shortfall}
        />
      )}

      {pendingAutoPayCount > 0 && (
        <Link
          href="/deudas"
          className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-700 transition-colors hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950/60"
        >
          Tienes {pendingAutoPayCount} pago{pendingAutoPayCount > 1 ? 's' : ''} de deuda pendiente
          {pendingAutoPayCount > 1 ? 's' : ''} de confirmar. Ver Deudas →
        </Link>
      )}

      {pendingFixedExpenseCount > 0 && (
        <Link
          href={`/mi-dinero/${gastoPillarId}/fijos`}
          className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-700 transition-colors hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950/60"
        >
          Tienes {pendingFixedExpenseCount} gasto{pendingFixedExpenseCount > 1 ? 's' : ''} fijo
          {pendingFixedExpenseCount > 1 ? 's' : ''} pendiente{pendingFixedExpenseCount > 1 ? 's' : ''} de confirmar.
          Ver Gastos fijos →
        </Link>
      )}

      {/* Acceso rápido a registrar gasto/ingreso extra. */}
      <QuickAddForm pillars={pillars ?? []} categories={activeCategories} />
    </div>
  )
}
