'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { PillarName } from '@/lib/dashboard'
import { formatBs } from '@/lib/format'
import { deleteCategory, updateCategory, type UpdateCategoryInput } from '../../actions'

type CategoryRow = {
  id: string
  pillar_id: string
  name: string
  percentage: number | null
  fixed_amount: number | null
  auto_repeat: boolean
}
type HistoryRow = {
  id: string
  amount: number
  type: 'expense' | 'extra_income'
  description: string | null
  date: string
}
type Draft = { name: string; percentage: string; fixedAmount: string; autoRepeat: boolean }

function draftFromCategory(c: CategoryRow): Draft {
  return {
    name: c.name,
    percentage: c.percentage === null ? '' : String(c.percentage),
    fixedAmount: c.fixed_amount === null ? '' : String(c.fixed_amount),
    autoRepeat: c.auto_repeat,
  }
}

// Compara el draft contra los valores guardados y arma el patch con solo lo
// que cambió. Devuelve null si no hay nada que guardar. (Mismo criterio que
// tenía MiDineroClient.tsx antes de mudar esto acá.)
function computeCategoryPatch(
  category: CategoryRow,
  draft: Draft
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
          : 'border border-zinc-300 dark:border-zinc-700'
      }`}
    >
      {children}
    </button>
  )
}

export default function CategoryDetailClient({
  pillarId,
  pillarName,
  category,
  accumulated,
  history,
}: {
  pillarId: string
  pillarName: PillarName
  category: CategoryRow
  accumulated: number
  history: HistoryRow[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'consulta' | 'configuracion'>('consulta')

  const [draft, setDraft] = useState<Draft>(() => draftFromCategory(category))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const dirty = computeCategoryPatch(category, draft) !== null

  function updateDraft(patch: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  async function handleSave() {
    const result = computeCategoryPatch(category, draft)
    if (!result) return
    if (result.error) {
      setError(result.error)
      return
    }
    setError(null)
    setSaving(true)
    const res = await updateCategory(result.patch)
    setSaving(false)
    if (res.error) setError(res.error)
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await deleteCategory({ categoryId: category.id })
    setDeleting(false)
    if (res.error) {
      setError(res.error)
      setConfirmingDelete(false)
      return
    }
    router.push(`/mi-dinero/${pillarId}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        <TabButton active={tab === 'consulta'} onClick={() => setTab('consulta')}>
          Consulta
        </TabButton>
        <TabButton active={tab === 'configuracion'} onClick={() => setTab('configuracion')}>
          Configuración
        </TabButton>
      </div>

      {tab === 'consulta' ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-sm text-zinc-500">Acumulado</p>
            <p className="text-2xl font-semibold tracking-tight">{formatBs(accumulated)} Bs</p>
          </div>

          <div>
            <h2 className="text-sm font-medium text-zinc-500">Historial</h2>
            {history.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">Todavía no hay movimientos registrados acá.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {history.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                  >
                    <div>
                      <p className="text-sm">{t.description || 'Sin descripción'}</p>
                      <p className="text-xs text-zinc-500">{t.date}</p>
                    </div>
                    <p
                      className={`text-sm font-medium ${
                        t.amount >= 0
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {t.amount >= 0 ? '+' : ''}
                      {formatBs(t.amount)} Bs
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => updateDraft({ name: e.target.value })}
              className={`${inputClass} min-w-0 flex-1`}
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                onWheel={(e) => e.currentTarget.blur()}
                min={0}
                max={100}
                placeholder="libre"
                value={draft.percentage}
                onChange={(e) => updateDraft({ percentage: e.target.value })}
                className={`${inputClass} w-20 text-right`}
              />
              <span className="text-sm text-zinc-500">%</span>
            </div>
          </div>

          {pillarName === 'gasto' && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <label className="text-sm text-zinc-500">Monto fijo (Bs)</label>
                <input
                  type="number"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  placeholder="—"
                  value={draft.fixedAmount}
                  onChange={(e) => updateDraft({ fixedAmount: e.target.value })}
                  className={`${inputClass} w-24 text-right`}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.autoRepeat}
                  disabled={draft.fixedAmount.trim() === ''}
                  onChange={(e) => updateDraft({ autoRepeat: e.target.checked })}
                  className="h-4 w-4"
                />
                Repetir automáticamente cada mes
              </label>
            </div>
          )}

          {error && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          {confirmingDelete ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-sm text-zinc-500">
                ¿Eliminar &quot;{category.name}&quot;? Las transacciones ya registradas se conservan.
              </p>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-40"
              >
                Sí, eliminar
              </button>
              <button onClick={() => setConfirmingDelete(false)} className={secondaryButtonClass}>
                Cancelar
              </button>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <button onClick={handleSave} disabled={!dirty || saving} className={secondaryButtonClass}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                className="text-sm font-medium text-red-600 hover:text-red-700"
              >
                Eliminar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
