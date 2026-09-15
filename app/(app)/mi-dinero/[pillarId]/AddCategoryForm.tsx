'use client'

import { useState } from 'react'
import { createCategory } from '../actions'

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100'
const secondaryButtonClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800'

export default function AddCategoryForm({ pillarId }: { pillarId: string }) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    setCreating(true)
    setError(null)
    const res = await createCategory({ pillarId, name: trimmed })
    setCreating(false)
    if (res.error) {
      setError(res.error)
    } else {
      setName('')
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
          placeholder="Agregar categoría"
          className={`${inputClass} flex-1`}
        />
        <button type="button" onClick={handleCreate} disabled={creating} className={secondaryButtonClass}>
          + Agregar
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
