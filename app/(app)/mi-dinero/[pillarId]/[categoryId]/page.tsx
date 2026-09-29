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
import { todayInBolivia, type PillarName } from '@/lib/dashboard'
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

  // Retorno de inversión: el destino "a una categoría de Ahorro" necesita la
  // lista de categorías de Ahorro del usuario — solo se pide cuando hace
  // falta (pillar Inversión).
  let ahorroCategories: { id: string; name: string }[] = []
  if (pillar.name === 'inversion') {
    const { data: ahorroPillar } = await supabase
      .from('pillars')
      .select('id')
      .eq('user_id', userId)
      .eq('name', 'ahorro')
      .maybeSingle()
    if (ahorroPillar) {
      const { data: ahorroCats } = await supabase
        .from('categories')
        .select('id, name')
        .eq('pillar_id', ahorroPillar.id)
        .eq('user_id', userId)
        .is('deleted_at', null)
      ahorroCategories = ahorroCats ?? []
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
        todayIso={todayInBolivia().iso}
        backHref={backHref}
        ahorroCategories={ahorroCategories}
      />
    </div>
  )
}
