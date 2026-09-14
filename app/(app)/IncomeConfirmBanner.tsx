'use client'

// Aviso del Dashboard cuando el ingreso NO se repite automáticamente
// (manual §3.1): "el sistema solicita ingresarlo manualmente al inicio de
// cada mes". No bloquea nada — el usuario puede seguir usando la app con
// el último ingreso guardado mientras no confirma.

import { useState } from 'react'
import { updateProfile } from './mas/actions'

export default function IncomeConfirmBanner({ name, baseIncome }: { name: string; baseIncome: number }) {
  const [amount, setAmount] = useState(String(baseIncome))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    setError(null)
    const res = await updateProfile({ name, baseIncome: Number(amount), autoRepeatIncome: false })
    setSaving(false)
    if (res.error) {
      setError(res.error)
    } else {
      setConfirmed(true)
    }
  }

  if (confirmed) return null

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
      <span>Confirmá tu ingreso de este mes (no se repite solo).</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          onWheel={(e) => e.currentTarget.blur()}
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-28 rounded-lg border border-amber-300 bg-transparent px-2 py-1 text-sm outline-none focus:border-amber-600 dark:border-amber-800"
        />
        <span>Bs</span>
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="ml-auto rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-800 disabled:opacity-40"
        >
          {saving ? 'Guardando…' : 'Confirmar'}
        </button>
      </div>
      {error && (
        <p className="text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
