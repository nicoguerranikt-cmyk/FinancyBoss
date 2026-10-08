// Gastos del día a día de Gasto — pantalla propia (ver fijos/page.tsx, el
// hermano; la ruta quedó "cotidianos" pero el nombre que ve el usuario es
// "Gastos del día a día"). Son solo categorías para REGISTRAR en qué se gasta:
// no tienen monto ni presupuesto, y lo que se gasta sale de Dinero libre o de
// Ahorro (migración 0041), no del pilar Gasto. Acá vive "Agregar categoría":
// toda categoría creada acá nace sin monto — para crear un gasto fijo, con
// monto y fecha de cobro, se hace desde /fijos.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatBs } from '@/lib/format'
import Link from '../../../AppLink'
import CategoryCard from '../CategoryCard'
import { loadGastoPillarData } from '../gastoData'
import AddCategoryForm from '../AddCategoryForm'
import PageReadySignal from '../../../PageReadySignal'

export default async function GastosCotidianosPage({
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

  // Lo gastado en el día a día se guarda en negativo; se muestra como un monto
  // positivo de "gastado".
  const spent = -data.everydayAccumulated

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
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Gastos del día a día</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Comida, transporte, ocio… Solo categorías para registrar en qué gastas: no llevan monto ni
          presupuesto. Cada gasto sale de tu Dinero libre o de tus ahorros, según elijas al
          registrarlo.
        </p>
      </div>

      <div className="text-center">
        <p className="text-sm text-zinc-500">Gastado en el día a día</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{formatBs(spent)} Bs</p>
      </div>

      <div className="flex flex-col gap-2">
        {data.everydayCategories.length === 0 && data.everydaySinCategoria === 0 && data.everydayEliminadas === 0 && (
          <p className="text-sm text-zinc-500">Todavía no tienes categorías del día a día. Crea la primera abajo.</p>
        )}
        {data.everydayCategories.map((category) => (
          <CategoryCard
            key={category.id}
            pillarId={pillarId}
            pillarName="gasto"
            category={category}
            accumulated={data.accumulatedByCategoryId[category.id] ?? 0}
          />
        ))}
        {data.everydaySinCategoria !== 0 && (
          <div className="flex items-center justify-between rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
            <div>
              <p className="font-medium text-zinc-500">Sin categoría</p>
              <p className="text-sm text-zinc-500">gastos registrados sin categoría</p>
            </div>
            <p className="font-semibold text-zinc-500">{formatBs(-data.everydaySinCategoria)} Bs</p>
          </div>
        )}
        {data.everydayEliminadas !== 0 && (
          <div className="flex items-center justify-between rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
            <div>
              <p className="font-medium text-zinc-500">Categorías eliminadas</p>
              <p className="text-sm text-zinc-500">lo que se gastó en ellas</p>
            </div>
            <p className="font-semibold text-zinc-500">{formatBs(-data.everydayEliminadas)} Bs</p>
          </div>
        )}
      </div>

      <AddCategoryForm pillarId={pillarId} />
    </div>
  )
}
