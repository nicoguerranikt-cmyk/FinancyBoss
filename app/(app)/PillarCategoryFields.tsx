'use client'

// Selector de pilar + categoría opcional, compartido entre Deudas
// (app/(app)/deudas/DeudasClient.tsx) y Deudores (app/(app)/deudores/DeudoresClient.tsx):
// nunca se puede elegir una categoría de gasto fijo (el servidor la rechaza,
// ver lib/pillarSource.ts).

import type { PillarName } from '@/lib/dashboard'

const PILLAR_LABEL: Record<PillarName, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

export type PillarRow = { id: string; name: PillarName }
export type CategoryRow = { id: string; pillar_id: string; name: string; fixed_amount: number | null }

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-brand dark:border-zinc-700 dark:focus:border-brand'

export default function PillarCategoryFields({
  pillars,
  categories,
  pillarId,
  setPillarId,
  categoryId,
  setCategoryId,
}: {
  pillars: PillarRow[]
  categories: CategoryRow[]
  pillarId: string
  setPillarId: (v: string) => void
  categoryId: string
  setCategoryId: (v: string) => void
}) {
  const categoryOptions = categories.filter((c) => c.pillar_id === pillarId && c.fixed_amount === null)

  return (
    <div className="flex flex-wrap gap-2">
      <select
        value={pillarId}
        onChange={(e) => {
          setPillarId(e.target.value)
          setCategoryId('')
        }}
        className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`}
      >
        <option value="" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
          Elegí un pilar
        </option>
        {pillars.map((p) => (
          <option key={p.id} value={p.id} className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
            {PILLAR_LABEL[p.name]}
          </option>
        ))}
      </select>
      {pillarId && (
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`}
        >
          <option value="" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
            Sin categoría (va directo al pilar)
          </option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id} className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
              {c.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
