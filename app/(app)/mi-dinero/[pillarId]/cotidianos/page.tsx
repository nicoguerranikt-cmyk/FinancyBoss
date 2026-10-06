// Gastos variables de Gasto — pantalla propia (ver fijos/page.tsx, el
// hermano; la ruta quedó "cotidianos" pero el nombre que ve el usuario es
// "Gastos variables"). Acá vive "Agregar categoría": toda categoría creada
// acá nace variable (sin monto fijo) — se puede asignarle un monto después
// desde su Configuración, o crearla directo como fija desde /fijos.

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
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Gastos variables</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Comida, transporte, ocio — el día a día, sin monto ni % fijo.
        </p>
      </div>

      <div className="text-center">
        <p className="text-sm text-zinc-500">Acumulado en gastos variables</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
          {formatBs(data.everydayAccumulated)} Bs
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {data.everydayCategories.length === 0 && data.sinCategoria === 0 && data.categoriasEliminadas === 0 && (
          <p className="text-sm text-zinc-500">Todavía no tienes categorías variables.</p>
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
      </div>

      <AddCategoryForm pillarId={pillarId} />
    </div>
  )
}
