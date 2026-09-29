'use client'

import { useMemo, useState } from 'react'
import { formatBs } from '@/lib/format'
import { registerFreeMoneyMovement } from './actions'

type Movement = {
  id: string
  amount: number
  description: string | null
  date: string
  credit_month: number | null
}

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
}: {
  movements: Movement[]
  todayIso: string
}) {
  const [type, setType] = useState<'gasto' | 'ingreso'>('gasto')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayIso)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const groups = useMemo(() => groupByDate(movements), [movements])

  async function handleSubmit() {
    setError(null)
    setSuccess(false)
    const amountNumber = Number(amount)
    if (!(amountNumber > 0)) {
      setError('Ingresá un monto mayor a 0.')
      return
    }
    setSubmitting(true)
    const res = await registerFreeMoneyMovement({
      type,
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
            onClick={() => setType('gasto')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              type === 'gasto'
                ? 'bg-brand text-white dark:text-zinc-950'
                : 'border border-zinc-300 dark:border-zinc-700'
            }`}
          >
            Gasto
          </button>
          <button
            type="button"
            onClick={() => setType('ingreso')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              type === 'ingreso'
                ? 'bg-brand text-white dark:text-zinc-950'
                : 'border border-zinc-300 dark:border-zinc-700'
            }`}
          >
            Ingreso
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="libre-amount" className="text-sm font-medium">
              Monto (Bs)
            </label>
            <input
              id="libre-amount"
              type="number"
              onWheel={(e) => e.currentTarget.blur()}
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ej. 50"
              className={inputClass}
            />
          </div>
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
          <p className="mt-3 text-sm text-green-700 dark:text-green-400">Movimiento registrado.</p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 w-full rounded-lg bg-brand py-2.5 font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50 dark:text-zinc-950"
        >
          {submitting ? 'Guardando…' : 'Registrar'}
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
