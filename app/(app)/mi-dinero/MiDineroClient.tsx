'use client'

// Mi Dinero (manual.md v2.0, sección 2): edición de % de pilares y de las
// categorías dentro de cada uno. Los % de categorías se avisan si no suman
// 100 pero NUNCA bloquean el guardado (§2.2) — a diferencia de los % de
// pilares, que sí deben sumar exactamente 100 (§2.1).

import { useMemo, useState } from 'react'
import type { PillarName } from '@/lib/dashboard'
import {
  createCategory,
  deleteCategory,
  updateCategory,
  updatePillarPercentages,
  type UpdateCategoryInput,
} from './actions'

const PILLAR_LABEL: Record<PillarName, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

type PillarRow = { id: string; name: PillarName; percentage: number }
type CategoryRow = {
  id: string
  pillar_id: string
  name: string
  percentage: number | null
  fixed_amount: number | null
  auto_repeat: boolean
}
type CategoryDraft = { name: string; percentage: string; fixedAmount: string; autoRepeat: boolean }

function draftFromCategory(c: CategoryRow): CategoryDraft {
  return {
    name: c.name,
    percentage: c.percentage === null ? '' : String(c.percentage),
    fixedAmount: c.fixed_amount === null ? '' : String(c.fixed_amount),
    autoRepeat: c.auto_repeat,
  }
}

function buildDrafts(
  categories: CategoryRow[],
  prev: Record<string, CategoryDraft> = {}
): Record<string, CategoryDraft> {
  const next: Record<string, CategoryDraft> = {}
  for (const c of categories) {
    next[c.id] = prev[c.id] ?? draftFromCategory(c)
  }
  return next
}

// Compara el draft de una fila contra los valores guardados y arma el patch
// con solo lo que cambió. Devuelve null si no hay nada que guardar.
function computeCategoryPatch(
  category: CategoryRow,
  draft: CategoryDraft
): { patch: UpdateCategoryInput; error?: string } | null {
  const patch: UpdateCategoryInput = { categoryId: category.id }
  let error: string | undefined

  const name = draft.name.trim()
  if (name !== category.name) patch.name = name

  const originalPct = category.percentage === null ? '' : String(category.percentage)
  if (draft.percentage.trim() !== originalPct) {
    const n = draft.percentage.trim() === '' ? null : Number(draft.percentage)
    if (n !== null && (Number.isNaN(n) || !(n >= 0 && n <= 100))) {
      error = 'El porcentaje debe estar entre 0 y 100.'
    } else {
      patch.percentage = n
    }
  }

  const originalFixed = category.fixed_amount === null ? '' : String(category.fixed_amount)
  if (draft.fixedAmount.trim() !== originalFixed) {
    const n = draft.fixedAmount.trim() === '' ? null : Number(draft.fixedAmount)
    if (n !== null && (Number.isNaN(n) || !(n >= 0))) {
      error = error ?? 'El monto fijo debe ser mayor o igual a 0.'
    } else {
      patch.fixedAmount = n
    }
  }

  if (draft.autoRepeat !== category.auto_repeat) {
    patch.autoRepeat = draft.autoRepeat
  }

  if (!error && Object.keys(patch).length === 1) return null
  return { patch, error }
}

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100'
const secondaryButtonClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800'
const primaryButtonClass =
  'rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300'

function sumBarClass(valid: boolean) {
  return `rounded-lg px-3 py-2 text-sm ${
    valid
      ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
  }`
}

export default function MiDineroClient({
  pillars,
  categories,
}: {
  pillars: PillarRow[]
  categories: CategoryRow[]
}) {
  const [pct, setPct] = useState<Record<PillarName, number>>(() => {
    const init: Record<PillarName, number> = { ahorro: 0, gasto: 0, inversion: 0 }
    for (const p of pillars) init[p.name] = p.percentage
    return init
  })
  const [pillarSaving, setPillarSaving] = useState(false)
  const [pillarError, setPillarError] = useState<string | null>(null)
  const [pillarSaved, setPillarSaved] = useState(false)

  // Los drafts se re-derivan de `categories` cuando la prop cambia (después
  // de crear/borrar una categoría, que dispara un revalidatePath). Se ajusta
  // durante el render en vez de en un efecto para evitar un re-render extra
  // (patrón "Adjusting state when a prop changes" de React), preservando el
  // draft en curso de las filas que no cambiaron.
  const [prevCategories, setPrevCategories] = useState(categories)
  const [drafts, setDrafts] = useState<Record<string, CategoryDraft>>(() => buildDrafts(categories))
  if (categories !== prevCategories) {
    setPrevCategories(categories)
    setDrafts((prev) => buildDrafts(categories, prev))
  }

  const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({})
  const [rowError, setRowError] = useState<Record<string, string | null>>({})
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  const [newCatName, setNewCatName] = useState<Record<PillarName, string>>({
    ahorro: '',
    gasto: '',
    inversion: '',
  })
  const [creatingPillar, setCreatingPillar] = useState<PillarName | null>(null)
  const [createError, setCreateError] = useState<Record<PillarName, string | null>>({
    ahorro: null,
    gasto: null,
    inversion: null,
  })

  const pctSum = pct.ahorro + pct.gasto + pct.inversion
  const pctSumValid = Math.round(pctSum) === 100

  const categoriesByPillar = useMemo(() => {
    const map: Record<string, CategoryRow[]> = {}
    for (const c of categories) {
      ;(map[c.pillar_id] ??= []).push(c)
    }
    return map
  }, [categories])

  function categoryPercentSum(pillarId: string) {
    return (categoriesByPillar[pillarId] ?? []).reduce((sum, c) => {
      const raw = drafts[c.id]?.percentage ?? ''
      if (raw.trim() === '') return sum
      const n = Number(raw)
      return Number.isNaN(n) ? sum : sum + n
    }, 0)
  }

  function setPillarPct(key: PillarName, value: string) {
    const n = Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
    setPct((prev) => ({ ...prev, [key]: n }))
    setPillarSaved(false)
  }

  async function handleSavePillars() {
    setPillarError(null)
    setPillarSaving(true)
    const res = await updatePillarPercentages(pct)
    setPillarSaving(false)
    if (res.error) {
      setPillarError(res.error)
    } else {
      setPillarSaved(true)
    }
  }

  function updateDraft(categoryId: string, patch: Partial<CategoryDraft>) {
    setDrafts((prev) => ({ ...prev, [categoryId]: { ...prev[categoryId], ...patch } }))
    setPillarSaved(false)
  }

  async function handleSaveRow(category: CategoryRow) {
    const draft = drafts[category.id]
    if (!draft) return
    const result = computeCategoryPatch(category, draft)
    if (!result) return
    if (result.error) {
      setRowError((prev) => ({ ...prev, [category.id]: result.error! }))
      return
    }
    setRowError((prev) => ({ ...prev, [category.id]: null }))
    setRowSaving((prev) => ({ ...prev, [category.id]: true }))
    const res = await updateCategory(result.patch)
    setRowSaving((prev) => ({ ...prev, [category.id]: false }))
    if (res.error) {
      setRowError((prev) => ({ ...prev, [category.id]: res.error! }))
    }
  }

  async function handleDelete(categoryId: string) {
    setRowSaving((prev) => ({ ...prev, [categoryId]: true }))
    const res = await deleteCategory({ categoryId })
    setRowSaving((prev) => ({ ...prev, [categoryId]: false }))
    setConfirmingDeleteId(null)
    if (res.error) {
      setRowError((prev) => ({ ...prev, [categoryId]: res.error! }))
    }
  }

  async function handleCreate(pillar: PillarRow) {
    const name = newCatName[pillar.name].trim()
    if (!name) return
    setCreatingPillar(pillar.name)
    setCreateError((prev) => ({ ...prev, [pillar.name]: null }))
    const res = await createCategory({ pillarId: pillar.id, name })
    setCreatingPillar(null)
    if (res.error) {
      setCreateError((prev) => ({ ...prev, [pillar.name]: res.error! }))
    } else {
      setNewCatName((prev) => ({ ...prev, [pillar.name]: '' }))
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Mi Dinero</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Organizá cómo se distribuye tu ingreso entre los 3 pilares y sus categorías.
        </p>
      </section>

      {/* ---------- Distribución de pilares ---------- */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight">Distribución de pilares</h2>
        <p className="mt-1 text-sm text-zinc-500">Tienen que sumar 100%.</p>

        <div className="mt-4 flex flex-col gap-4">
          {pillars.map((pillar) => (
            <div key={pillar.id} className="flex items-center gap-3">
              <label htmlFor={`pct-${pillar.name}`} className="w-24 text-sm font-medium">
                {PILLAR_LABEL[pillar.name]}
              </label>
              <input
                id={`pct-${pillar.name}`}
                type="number"
                min={0}
                max={100}
                value={pct[pillar.name]}
                onChange={(e) => setPillarPct(pillar.name, e.target.value)}
                className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-right outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
              />
              <span className="text-sm text-zinc-500">%</span>
            </div>
          ))}
        </div>

        <div className={`mt-4 ${sumBarClass(pctSumValid)}`}>
          {pctSumValid ? 'Perfecto, suman 100%.' : `Suman ${pctSum}%. Ajustá para llegar a 100%.`}
        </div>

        {pillarError && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {pillarError}
          </p>
        )}
        {pillarSaved && !pillarError && (
          <p className="mt-3 text-sm text-green-700 dark:text-green-400">Cambios guardados.</p>
        )}

        <button
          onClick={handleSavePillars}
          disabled={!pctSumValid || pillarSaving}
          className={`mt-4 ${primaryButtonClass}`}
        >
          {pillarSaving ? 'Guardando…' : 'Guardar porcentajes'}
        </button>
      </section>

      {/* ---------- Categorías por pilar ---------- */}
      {pillars.map((pillar) => {
        const pillarCategories = categoriesByPillar[pillar.id] ?? []
        const categorySum = categoryPercentSum(pillar.id)
        const categorySumValid = Math.round(categorySum) === 100

        return (
          <section key={pillar.id}>
            <h2 className="text-lg font-semibold tracking-tight">{PILLAR_LABEL[pillar.name]}</h2>

            {pillarCategories.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">
                Todavía no tenés categorías acá. El saldo queda como &quot;libre&quot; dentro de
                este pilar.
              </p>
            ) : (
              <div className={`mt-2 ${sumBarClass(categorySumValid)}`}>
                {categorySumValid
                  ? `Perfecto, suman 100% de ${PILLAR_LABEL[pillar.name]}.`
                  : `Suman ${categorySum}% de ${PILLAR_LABEL[pillar.name]}. No bloquea, pero revisalo.`}
              </div>
            )}

            <div className="mt-3 flex flex-col gap-2">
              {pillarCategories.map((category) => {
                const draft = drafts[category.id]
                if (!draft) return null
                const dirty = computeCategoryPatch(category, draft) !== null
                const saving = rowSaving[category.id] ?? false
                const isConfirmingDelete = confirmingDeleteId === category.id

                return (
                  <div
                    key={category.id}
                    className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={draft.name}
                        onChange={(e) => updateDraft(category.id, { name: e.target.value })}
                        className={`${inputClass} min-w-0 flex-1`}
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          placeholder="libre"
                          value={draft.percentage}
                          onChange={(e) => updateDraft(category.id, { percentage: e.target.value })}
                          className={`${inputClass} w-20 text-right`}
                        />
                        <span className="text-sm text-zinc-500">%</span>
                      </div>
                    </div>

                    {pillar.name === 'gasto' && (
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1">
                          <label className="text-sm text-zinc-500">Monto fijo (Bs)</label>
                          <input
                            type="number"
                            min={0}
                            placeholder="—"
                            value={draft.fixedAmount}
                            onChange={(e) => updateDraft(category.id, { fixedAmount: e.target.value })}
                            className={`${inputClass} w-24 text-right`}
                          />
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={draft.autoRepeat}
                            disabled={draft.fixedAmount.trim() === ''}
                            onChange={(e) => updateDraft(category.id, { autoRepeat: e.target.checked })}
                            className="h-4 w-4"
                          />
                          Repetir automáticamente cada mes
                        </label>
                      </div>
                    )}

                    {rowError[category.id] && (
                      <p className="mt-2 text-sm text-red-600" role="alert">
                        {rowError[category.id]}
                      </p>
                    )}

                    {isConfirmingDelete ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <p className="text-sm text-zinc-500">
                          ¿Eliminar &quot;{category.name}&quot;? Las transacciones ya registradas se
                          conservan.
                        </p>
                        <button
                          onClick={() => handleDelete(category.id)}
                          disabled={saving}
                          className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-40"
                        >
                          Sí, eliminar
                        </button>
                        <button
                          onClick={() => setConfirmingDeleteId(null)}
                          className={secondaryButtonClass}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-3">
                        <button
                          onClick={() => handleSaveRow(category)}
                          disabled={!dirty || saving}
                          className={secondaryButtonClass}
                        >
                          {saving ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button
                          onClick={() => setConfirmingDeleteId(category.id)}
                          className="text-sm font-medium text-red-600 hover:text-red-700"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newCatName[pillar.name]}
                onChange={(e) =>
                  setNewCatName((prev) => ({ ...prev, [pillar.name]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleCreate(pillar)
                  }
                }}
                placeholder="Agregar categoría"
                className={`${inputClass} flex-1`}
              />
              <button
                type="button"
                onClick={() => handleCreate(pillar)}
                disabled={creatingPillar === pillar.name}
                className={secondaryButtonClass}
              >
                + Agregar
              </button>
            </div>
            {createError[pillar.name] && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {createError[pillar.name]}
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}
