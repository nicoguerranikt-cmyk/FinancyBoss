'use client'

// Aviso del Dashboard cuando el ingreso confirmado del mes no alcanza para los
// montos que ya suman los 3 pilares (manual §2.1). No mueve plata solo: el
// reparto a categorías queda en pausa hasta que el usuario elige —
// reajustar automáticamente (solo este mes, con los montos reducidos
// proporcionalmente) o ajustar él mismo sus montos en Mi Dinero.

import { useState } from 'react'
import Link from './AppLink'
import { formatBs } from '@/lib/format'
import { reduceAllocationToIncome } from './actions'

export default function IncomeShortfallBanner({
  income,
  committed,
  shortfall,
}: {
  income: number
  committed: number
  shortfall: number
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAutoAdjust() {
    setSaving(true)
    setError(null)
    try {
      const res = await reduceAllocationToIncome()
      if (res.error) setError(res.error)
    } catch {
      setError('No pudimos reajustar. Prueba de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
      <p>
        Tu ingreso de este mes ({formatBs(income)} Bs) no cubre los montos de tus pilares ({formatBs(committed)} Bs).{' '}
        <strong>Te faltan {formatBs(shortfall)} Bs.</strong> Mientras decides, no se reparte nada a tus categorías.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleAutoAdjust}
          disabled={saving}
          className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-800 disabled:opacity-40"
        >
          {saving ? 'Reajustando…' : 'Reajustar automáticamente'}
        </button>
        <Link
          href="/mi-dinero"
          className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-950/60"
        >
          Ajustar yo en Mi Dinero
        </Link>
      </div>
      {error && (
        <p className="text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
