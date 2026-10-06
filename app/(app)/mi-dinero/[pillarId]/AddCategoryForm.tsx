'use client'

import { useState } from 'react'
import { createCategory } from '../actions'

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-brand dark:border-zinc-700 dark:focus:border-brand'
const secondaryButtonClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800'

// withFixedAmount: usado desde la pantalla "Gastos fijos" — la categoría
// nace ya con su monto (no como gasto variable para "promoverla" después
// desde Configuración). Sin esto, se comporta como antes (solo nombre).
export default function AddCategoryForm({
  pillarId,
  withFixedAmount = false,
}: {
  pillarId: string
  withFixedAmount?: boolean
}) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    let fixedAmount: number | undefined
    if (withFixedAmount) {
      const n = Number(amount)
      if (!(n > 0)) {
        setError('Ingresa un monto mayor a 0.')
        return
      }
      fixedAmount = n
    }
    setCreating(true)
    setError(null)
    const res = await createCategory({ pillarId, name: trimmed, fixedAmount })
    setCreating(false)
    if (res.error) {
      setError(res.error)
    } else {
      setName('')
      setAmount('')
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleCreate()
            }
          }}
          placeholder={withFixedAmount ? 'Nombre de la categoría' : 'Agregar categoría'}
          className={`${inputClass} flex-1`}
        />
        {withFixedAmount && (
          <input
            type="number"
            step="any"
            onWheel={(e) => e.currentTarget.blur()}
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleCreate()
              }
            }}
            placeholder="Monto (Bs)"
            className={`${inputClass} w-28 text-right`}
          />
        )}
        <button type="button" onClick={handleCreate} disabled={creating} className={secondaryButtonClass}>
          Agregar
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
