// Detalle de una categoría (manual.md v2.0, sección 9): acá viven las 2
// pestañas que pidió el usuario — "Consulta" (saldo acumulado real +
// historial de transacciones, ver CategoryDetailClient) y "Configuración"
// (lo que antes era la edición inline en Mi Dinero: nombre, %, gasto fijo,
// borrar).
//
// Ver plan: el acumulado es la suma histórica de transactions.amount para
// esta categoría (sin filtro de mes) — no incluye ajustes del efecto dominó
// (domino_events no escribe en transactions, y hoy ese efecto se aplica a
// nivel de pilar completo, no de categoría — límite conocido, no un bug).

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from '../../../AppLink'
import { monthRangeIn, todayIn, type PillarName } from '@/lib/dashboard'
import { getUserTimeZone } from '@/lib/userTimezone.server'
import {
  fixedExpenseExtraThisMonth,
  isFixedExpensePending,
  isFixedExpenseScheduled,
  lastFixedExpenseOccurrence,
  lastFixedExpensePaymentDate,
} from '@/lib/fixedExpense'
import CategoryDetailClient from './CategoryDetailClient'
import PageReadySignal from '../../../PageReadySignal'

const PILLAR_LABEL: Record<PillarName, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ pillarId: string; categoryId: string }>
}) {
  const { pillarId, categoryId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user!.id

  const { data: pillarRow } = await supabase
    .from('pillars')
    .select('id, name')
    .eq('id', pillarId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!pillarRow) notFound()
  const pillar = pillarRow as { id: string; name: PillarName }

  const { data: category } = await supabase
    .from('categories')
    .select(
      'id, pillar_id, name, fixed_amount, auto_repeat, fixed_start_date, fixed_interval_unit, fixed_interval_count, fixed_reserve_ahead, is_general, goal_amount, goal_target_date'
    )
    .eq('id', categoryId)
    .eq('pillar_id', pillarId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!category) notFound()

  // Lista de categorías de Ahorro del usuario, con su saldo acumulado: la
  // necesitan 2 casos (ver CategoryDetailClient) — retorno de inversión,
  // destino "a una categoría de Ahorro" (pillar Inversión), y "Aumentar
  // presupuesto este mes" con fuente "Ahorro" (gastos fijos de Gasto,
  // migración 0031). Vacía en cualquier otro caso.
  let ahorroCategories: { id: string; name: string; balance: number }[] = []
  const needsAhorroCategories =
    pillar.name === 'inversion' || (pillar.name === 'gasto' && category.fixed_amount !== null)
  if (needsAhorroCategories) {
    const { data: ahorroPillar } = await supabase
      .from('pillars')
      .select('id')
      .eq('user_id', userId)
      .eq('name', 'ahorro')
      .maybeSingle()
    if (ahorroPillar) {
      const [{ data: ahorroCats }, { data: ahorroTx }] = await Promise.all([
        supabase
          .from('categories')
          .select('id, name')
          .eq('pillar_id', ahorroPillar.id)
          .eq('user_id', userId)
          .is('deleted_at', null),
        supabase.from('transactions').select('category_id, amount').eq('user_id', userId).eq('pillar_id', ahorroPillar.id),
      ])
      const balanceByCategoryId: Record<string, number> = {}
      for (const t of ahorroTx ?? []) {
        if (t.category_id) balanceByCategoryId[t.category_id] = (balanceByCategoryId[t.category_id] ?? 0) + t.amount
      }
      ahorroCategories = (ahorroCats ?? []).map((c) => ({ ...c, balance: balanceByCategoryId[c.id] ?? 0 }))
    }
  }

  const { data: history } = await supabase
    .from('transactions')
    .select('id, amount, type, description, date, is_allocation')
    .eq('category_id', categoryId)
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  const accumulated = (history ?? []).reduce((sum, t) => sum + t.amount, 0)

  // ¿Este gasto fijo tiene una cuota vencida sin confirmar? (migración del
  // auto-insert silencioso al recordatorio+confirmar, ver confirmFixedExpense
  // en mi-dinero/actions.ts y el aviso del Dashboard). Mismo chequeo que hace
  // esa action (última transacción vs. la fecha que ya corresponde).
  const timeZone = await getUserTimeZone(supabase, userId)
  const today = todayIn(timeZone)
  let pendingFixedConfirmation = false
  if (pillar.name === 'gasto' && category.auto_repeat && isFixedExpenseScheduled(category)) {
    const dueDate = lastFixedExpenseOccurrence(category, today)
    if (dueDate) {
      pendingFixedConfirmation = isFixedExpensePending(dueDate, lastFixedExpensePaymentDate(history ?? []))
    }
  }

  // Asignado/usado/restante de ESTE MES para gastos fijos de Gasto — a
  // diferencia de "acumulado" (histórico, arriba), esto resetea cada mes
  // porque fixed_amount es un presupuesto mensual. "Asignado" incluye los
  // aumentos puntuales del mes (bumpFixedExpenseThisMonth, type
  // 'extra_income' contra esta misma categoría — migración 0031).
  let fixedBudget: {
    assigned: number
    used: number
    remaining: number
    modality: 'pago_unico' | 'consumo_gradual'
    status: 'pendiente' | 'pagado' | 'programado' | 'agotado' | 'disponible'
  } | null = null
  if (pillar.name === 'gasto' && category.fixed_amount !== null) {
    const { start, end } = monthRangeIn(timeZone)
    const thisMonthTx = (history ?? []).filter((t) => t.date >= start && t.date <= end)
    const extraThisMonth = fixedExpenseExtraThisMonth(thisMonthTx)
    const used = thisMonthTx.filter((t) => t.amount < 0).reduce((s, t) => s + -t.amount, 0)
    const assigned = category.fixed_amount + extraThisMonth
    const remaining = assigned - used

    if (category.auto_repeat && isFixedExpenseScheduled(category)) {
      const dueDate = lastFixedExpenseOccurrence(category, today)
      fixedBudget = {
        assigned,
        used,
        remaining,
        modality: 'pago_unico',
        status: !dueDate ? 'programado' : pendingFixedConfirmation ? 'pendiente' : 'pagado',
      }
    } else {
      fixedBudget = {
        assigned,
        used,
        remaining,
        modality: 'consumo_gradual',
        status: remaining <= 0 ? 'agotado' : 'disponible',
      }
    }
  }

  // Gasto ya no tiene una lista única (ver [pillarId]/page.tsx: ahí es un
  // selector) — "volver" tiene que llevar a la pantalla de la que
  // probablemente vino, según si esta categoría es fija o cotidiana.
  const backHref =
    pillar.name === 'gasto'
      ? `/mi-dinero/${pillarId}/${category.fixed_amount !== null ? 'fijos' : 'cotidianos'}`
      : `/mi-dinero/${pillarId}`

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <PageReadySignal />
      <div>
        <Link href={backHref} className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          ← {PILLAR_LABEL[pillar.name]}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{category.name}</h1>
      </div>

      <CategoryDetailClient
        pillarName={pillar.name}
        category={category}
        accumulated={accumulated}
        history={history ?? []}
        todayIso={today.iso}
        backHref={backHref}
        ahorroCategories={ahorroCategories}
        pendingFixedConfirmation={pendingFixedConfirmation}
        fixedBudget={fixedBudget}
      />
    </div>
  )
}
