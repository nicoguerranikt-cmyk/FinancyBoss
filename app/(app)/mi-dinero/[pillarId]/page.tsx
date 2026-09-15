// Categorías de un pilar (manual.md v2.0, sección 9): lista de categorías con
// su acumulado histórico real (suma de todas sus transacciones de siempre,
// sin filtro de mes). Click en una categoría entra a su detalle
// (/mi-dinero/[pillarId]/[categoryId]), donde vive Consulta/Configuración.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatBs } from '@/lib/format'
import type { PillarName } from '@/lib/dashboard'
import AddCategoryForm from './AddCategoryForm'

const PILLAR_LABEL: Record<PillarName, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

function sumBarClass(valid: boolean) {
  return `rounded-lg px-3 py-2 text-sm ${
    valid
      ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
  }`
}

export default async function PillarCategoriesPage({
  params,
}: {
  params: Promise<{ pillarId: string }>
}) {
  const { pillarId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user!.id

  const { data: pillarRow } = await supabase
    .from('pillars')
    .select('id, name, percentage')
    .eq('id', pillarId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!pillarRow) notFound()
  const pillar = pillarRow as { id: string; name: PillarName; percentage: number }

  const [{ data: categories }, { data: transactions }] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, percentage, fixed_amount')
      .eq('pillar_id', pillarId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase.from('transactions').select('category_id, amount').eq('user_id', userId).eq('pillar_id', pillarId),
  ])

  // Acumulado histórico por categoría (y el resto, sin categoría asignada).
  const accumulatedByCategoryId: Record<string, number> = {}
  let sinCategoria = 0
  for (const t of transactions ?? []) {
    if (t.category_id) {
      accumulatedByCategoryId[t.category_id] = (accumulatedByCategoryId[t.category_id] ?? 0) + t.amount
    } else {
      sinCategoria += t.amount
    }
  }

  const categoryPercentSum = (categories ?? []).reduce((sum, c) => sum + (c.percentage ?? 0), 0)
  const categorySumValid = Math.round(categoryPercentSum) === 100

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/mi-dinero" className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          ← Mi Dinero
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{PILLAR_LABEL[pillar.name]}</h1>
        <p className="mt-1 text-sm text-zinc-500">{pillar.percentage}% de tu ingreso.</p>
      </div>

      {(categories ?? []).length === 0 ? (
        <p className="text-sm text-zinc-500">
          Todavía no tenés categorías acá. El saldo queda como &quot;libre&quot; dentro de este pilar.
        </p>
      ) : (
        <div className={sumBarClass(categorySumValid)}>
          {categorySumValid
            ? `Perfecto, suman 100% de ${PILLAR_LABEL[pillar.name]}.`
            : `Suman ${categoryPercentSum}% de ${PILLAR_LABEL[pillar.name]}. No bloquea, pero revisalo.`}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {(categories ?? []).map((category) => (
          <Link
            key={category.id}
            href={`/mi-dinero/${pillarId}/${category.id}`}
            className="flex items-center justify-between rounded-xl border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <div>
              <p className="font-medium">{category.name}</p>
              <p className="text-sm text-zinc-500">
                {category.percentage === null ? 'sin %' : `${category.percentage}%`}
                {category.fixed_amount !== null && ` · gasto fijo ${formatBs(category.fixed_amount)} Bs`}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatBs(accumulatedByCategoryId[category.id] ?? 0)} Bs</p>
              <p className="text-sm text-zinc-500">acumulado</p>
            </div>
          </Link>
        ))}

        {sinCategoria !== 0 && (
          <div className="flex items-center justify-between rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
            <div>
              <p className="font-medium text-zinc-500">Sin categoría</p>
              <p className="text-sm text-zinc-500">movimientos directos al pilar</p>
            </div>
            <p className="font-semibold text-zinc-500">{formatBs(sinCategoria)} Bs</p>
          </div>
        )}
      </div>

      <AddCategoryForm pillarId={pillarId} />
    </div>
  )
}
