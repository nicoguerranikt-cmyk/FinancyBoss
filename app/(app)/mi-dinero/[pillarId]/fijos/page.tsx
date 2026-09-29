// Gastos fijos de Gasto — pantalla propia (antes vivía junto a los
// variables en una sola lista larga, ver page.tsx del pilar). Solo tiene
// sentido para el pilar Gasto; si el pillarId no es Gasto, 404 (Ahorro e
// Inversión usan la lista única de [pillarId]/page.tsx).

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatBs } from '@/lib/format'
import Link from '../../../AppLink'
import CategoryCard from '../CategoryCard'
import { loadGastoPillarData } from '../gastoData'
import AddCategoryForm from '../AddCategoryForm'
import PageReadySignal from '../../../PageReadySignal'

function sumBarClass(valid: boolean) {
  return `rounded-lg px-3 py-2 text-sm ${
    valid
      ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
  }`
}

export default async function GastosFijosPage({
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
  if (!data.pillar || data.pillar.name !== 'gasto') notFound()

  // Migración 0020: Gasto ya es un monto fijo (data.pillar.monthly_amount),
  // así que la comparación es directa en Bs — no hace falta pasar por %
  // para saber si los gastos fijos ya usan todo el presupuesto de Gasto.
  const fixedTotal = data.fixedCategories.reduce((sum, c) => sum + (c.fixed_amount as number), 0)
  const gastoAmount = data.pillar?.monthly_amount ?? 0
  const remaining = Math.max(0, gastoAmount - fixedTotal)
  const percentValid = fixedTotal <= gastoAmount

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <PageReadySignal />
      <div>
        <Link
          href={`/mi-dinero/${pillarId}`}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← Gasto
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Gastos fijos</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Alquiler, servicios, suscripciones — con monto y frecuencia propios.
        </p>
      </div>

      <div className="text-center">
        <p className="text-sm text-zinc-500">Acumulado en gastos fijos</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
          {formatBs(data.fixedAccumulated)} Bs
        </p>
      </div>

      {data.fixedCategories.length > 0 && (
        <div className={sumBarClass(percentValid)}>
          {percentValid
            ? `Tus gastos fijos usan ${formatBs(fixedTotal)} Bs de los ${formatBs(gastoAmount)} Bs que destinás a Gasto — te quedan ${formatBs(remaining)} Bs para tus gastos variables.`
            : `Ojo: tus gastos fijos (${formatBs(fixedTotal)} Bs) ya superan los ${formatBs(gastoAmount)} Bs que destinás a Gasto — no te queda margen para gastos variables.`}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {data.fixedCategories.length === 0 ? (
          <p className="text-sm text-zinc-500">Todavía no tenés gastos fijos. Creá el primero abajo.</p>
        ) : (
          data.fixedCategories.map((category) => (
            <CategoryCard
              key={category.id}
              pillarId={pillarId}
              pillarName="gasto"
              category={category}
              accumulated={data.accumulatedByCategoryId[category.id] ?? 0}
            />
          ))
        )}
      </div>

      <AddCategoryForm pillarId={pillarId} withFixedAmount />
    </div>
  )
}
