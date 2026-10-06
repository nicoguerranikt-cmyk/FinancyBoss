'use client'

import { useMemo, useState } from 'react'
import { formatBs } from '@/lib/format'
import { allocateFreeMoneyToCategory, registerFreeMoneyMovement } from './actions'

type Movement = {
  id: string
  amount: number
  description: string | null
  date: string
  credit_month: number | null
}

type CategoryOption = { id: string; name: string; pillarLabel: string }

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brand dark:border-zinc-700 dark:focus:border-brand'

function groupByDate(movements: Movement[]): { date: string; items: Movement[] }[] {
  const groups: { date: string; items: Movement[] }[] = []
  for (const m of movements) {
    const last = groups[groups.length - 1]
    if (last && last.date === m.date) last.items.push(m)
    else groups.push({ date: m.date, items: [m] })
  }
  return groups
}

export default function LibreClient({
  movements,
  todayIso,
  availableAmount,
  categoryOptions,
}: {
  movements: Movement[]
  todayIso: string
  // Total disponible hoy (acreditado + lo que sobra del mes en curso) —
  // solo para mostrar de referencia en "Asignar a categoría", la
  // validación real de que no te pasás la hace el server (ver migración
  // 0028).
  availableAmount: number
  categoryOptions: CategoryOption[]
}) {
  const [mode, setMode] = useState<'gasto' | 'ingreso' | 'asignar'>('gasto')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayIso)
  const [categoryId, setCategoryId] = useState(categoryOptions[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const groups = useMemo(() => groupByDate(movements), [movements])

  function handleModeChange(next: 'gasto' | 'ingreso' | 'asignar') {
    setMode(next)
    setError(null)
    setSuccess(false)
  }

  async function handleSubmit() {
    setError(null)
    setSuccess(false)
    const amountNumber = Number(amount)
    if (!(amountNumber > 0)) {
      setError('Ingresa un monto mayor a 0.')
      return
    }

    setSubmitting(true)
    const res =
      mode === 'asignar'
        ? await (async () => {
            if (!categoryId) {
              return { error: 'Elige a qué categoría va.' }
            }
            return allocateFreeMoneyToCategory({
              amount: amountNumber,
              categoryId,
              description: description.trim() || undefined,
              date,
            })
          })()
        : await registerFreeMoneyMovement({
            type: mode,
            amount: amountNumber,
            description: description.trim() || undefined,
            date,
          })
    setSubmitting(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setAmount('')
    setDescription('')
    setDate(todayIso)
    setSuccess(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm font-medium">Registrar movimiento</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => handleModeChange('gasto')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === 'gasto' ? 'bg-brand text-white dark:text-zinc-950' : 'border border-zinc-300 dark:border-zinc-700'
            }`}
          >
            Gasto
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('ingreso')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === 'ingreso' ? 'bg-brand text-white dark:text-zinc-950' : 'border border-zinc-300 dark:border-zinc-700'
            }`}
          >
            Ingreso
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('asignar')}
            disabled={categoryOptions.length === 0}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
              mode === 'asignar' ? 'bg-brand text-white dark:text-zinc-950' : 'border border-zinc-300 dark:border-zinc-700'
            }`}
          >
            Asignar
          </button>
        </div>

        {mode === 'asignar' && (
          <p className="mt-3 text-xs text-zinc-500">
            Manda parte de tus {formatBs(availableAmount)} Bs disponibles a una categoría puntual —
            por ejemplo, un gasto fijo nuevo o una meta de ahorro. Queda como un ingreso normal ahí.
          </p>
        )}

        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="libre-amount" className="text-sm font-medium">
              Monto (Bs)
            </label>
            <input
              id="libre-amount"
              type="number"
              step="any"
              onWheel={(e) => e.currentTarget.blur()}
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ej. 50"
              className={inputClass}
            />
          </div>

          {mode === 'asignar' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="libre-category" className="text-sm font-medium">
                Categoría destino
              </label>
              <select
                id="libre-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none [color-scheme:light] focus:border-brand dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark] dark:focus:border-brand"
              >
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id} className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                    {c.pillarLabel} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="libre-date" className="text-sm font-medium">
              Fecha
            </label>
            <input
              id="libre-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="libre-description" className="text-sm font-medium">
              Descripción (opcional)
            </label>
            <input
              id="libre-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Salida con amigos"
              className={inputClass}
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {success && !error && (
          <p className="mt-3 text-sm text-green-700 dark:text-green-400">
            {mode === 'asignar' ? 'Asignado.' : 'Movimiento registrado.'}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 w-full rounded-lg bg-brand py-2.5 font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50 dark:text-zinc-950"
        >
          {submitting ? 'Guardando…' : mode === 'asignar' ? 'Asignar' : 'Registrar'}
        </button>
      </div>

      <div>
        <h2 className="text-sm font-medium text-zinc-500">Historial</h2>
        {groups.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Todavía no hay movimientos registrados acá.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-4">
            {groups.map((group) => (
              <div key={group.date}>
                <p className="text-xs font-medium text-zinc-500">{group.date}</p>
                <div className="mt-1 flex flex-col gap-2">
                  {group.items.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                    >
                      <p className="text-sm">
                        {m.description || (m.credit_month ? 'Sobrante del mes' : 'Sin descripción')}
                      </p>
                      <p
                        className={`text-sm font-medium ${
                          m.amount >= 0
                            ? 'text-green-700 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {m.amount >= 0 ? '+' : ''}
                        {formatBs(m.amount)} Bs
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
