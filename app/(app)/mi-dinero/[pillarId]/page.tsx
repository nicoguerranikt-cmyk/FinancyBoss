// Categorías de un pilar (manual.md v2.0, sección 9). Ahorro/Inversión
// muestran una sola lista (no tienen el concepto de "gasto fijo"). Gasto es
// distinto: acá esta pantalla es solo un selector entre "Gastos fijos" y
// "Gastos variables" — cada uno tiene su propia pantalla completa
// (fijos/page.tsx, cotidianos/page.tsx — la ruta quedó igual, solo cambió el
// nombre que ve el usuario), pedido del usuario para no mezclarlos todos en
// una lista larga.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatBs } from '@/lib/format'
import type { PillarName } from '@/lib/dashboard'
import { PILLAR_COLOR } from '@/lib/pillarColors'
import Link from '../../AppLink'
import CategoryCard from './CategoryCard'
import { loadGastoPillarData } from './gastoData'
import AddCategoryForm from './AddCategoryForm'
import PageReadySignal from '../../PageReadySignal'

const PILLAR_LABEL: Record<PillarName, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

function GroupCard({ href, title, count, accumulated }: { href: string; title: string; count: number; accumulated: number }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
    >
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-zinc-500">{count === 0 ? 'sin categorías todavía' : `${count} categoría${count > 1 ? 's' : ''}`}</p>
      </div>
      <div className="text-right">
        <p className="font-semibold">{formatBs(accumulated)} Bs</p>
        <p className="text-sm text-zinc-500">acumulado</p>
      </div>
    </Link>
  )
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

  const data = await loadGastoPillarData(supabase, userId, pillarId)
  if (!data.pillar) notFound()
  const { pillar } = data
  const isGasto = pillar.name === 'gasto'

  // Ahorro en USD (migración 0027): un pozo aparte, no forma parte del
  // acumulado en Bs de arriba — solo se pide cuando hace falta.
  let usdBalance = 0
  if (pillar.name === 'ahorro') {
    const { data: usdRows } = await supabase.from('usd_savings_transactions').select('amount_usd').eq('user_id', userId)
    usdBalance = (usdRows ?? []).reduce((sum, r) => sum + r.amount_usd, 0)
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <PageReadySignal />
      <div>
        <Link href="/mi-dinero" className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          ← Mi Dinero
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <span className={`h-2.5 w-2.5 rounded-full ${PILLAR_COLOR[pillar.name]}`} />
          {PILLAR_LABEL[pillar.name]}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{formatBs(pillar.monthly_amount)} Bs de tu ingreso.</p>
      </div>

      <div className="text-center">
        <p className="text-sm text-zinc-500">Acumulado en {PILLAR_LABEL[pillar.name]}</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{formatBs(data.totalAcumulado)} Bs</p>
      </div>

      {isGasto ? (
        <div className="flex flex-col gap-2">
          <GroupCard
            href={`/mi-dinero/${pillarId}/fijos`}
            title="Gastos fijos"
            count={data.fixedCategories.length}
            accumulated={data.fixedAccumulated}
          />
          <GroupCard
            href={`/mi-dinero/${pillarId}/cotidianos`}
            title="Gastos variables"
            count={data.everydayCategories.length}
            accumulated={data.everydayAccumulated}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {pillar.name === 'ahorro' && (
            <Link
              href={`/mi-dinero/${pillarId}/usd`}
              className="flex items-center justify-between rounded-xl border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <p className="font-medium">Ahorro en USD</p>
              <p className="font-semibold">{usdBalance.toFixed(2)} USD</p>
            </Link>
          )}
          {data.allCategories.length === 0 && (
            <p className="text-sm text-zinc-500">
              Todavía no tienes categorías acá. El saldo queda como &quot;libre&quot; dentro de este pilar.
            </p>
          )}
          {data.allCategories.map((category) => (
            <CategoryCard
              key={category.id}
              pillarId={pillarId}
              pillarName={pillar.name}
              category={category}
              accumulated={data.accumulatedByCategoryId[category.id] ?? 0}
            />
          ))}
          {data.sinCategoria !== 0 && (
            <div className="flex items-center justify-between rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
              <div>
                <p className="font-medium text-zinc-500">Sin categoría</p>
                <p className="text-sm text-zinc-500">movimientos directos al pilar</p>
              </div>
              <p className="font-semibold text-zinc-500">{formatBs(data.sinCategoria)} Bs</p>
            </div>
          )}
          {data.categoriasEliminadas !== 0 && (
            <div className="flex items-center justify-between rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
              <div>
                <p className="font-medium text-zinc-500">Categorías eliminadas</p>
                <p className="text-sm text-zinc-500">su plata sigue en este pilar</p>
              </div>
              <p className="font-semibold text-zinc-500">{formatBs(data.categoriasEliminadas)} Bs</p>
            </div>
          )}
          <AddCategoryForm pillarId={pillarId} withFixedAmount />
        </div>
      )}
    </div>
  )
}
