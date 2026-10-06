'use client'

// Mi Dinero (migración 0020): edición del monto fijo (Bs) de los 3 pilares
// — ya no es un %. Es un ajuste conjunto (no pueden sumar más que el
// ingreso, "no se puede fabricar plata de la nada"), por eso vive acá en la
// pantalla general y no dentro de cada pilar por separado. Las categorías
// de cada pilar viven un nivel más adentro (/mi-dinero/[pillarId]).

import { useState } from 'react'
import type { PillarName } from '@/lib/dashboard'
import { formatBs } from '@/lib/format'
import { PILLAR_COLOR, PILLAR_TINT, PILLAR_BORDER } from '@/lib/pillarColors'
import { updatePillarAmounts } from './actions'

const PILLAR_LABEL: Record<PillarName, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

type PillarRow = { id: string; name: PillarName; monthly_amount: number }

const primaryButtonClass =
  'rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-40 dark:text-zinc-950'

function sumBarClass(valid: boolean) {
  return `rounded-lg px-3 py-2 text-sm ${
    valid
      ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
  }`
}

export default function MiDineroClient({ pillars, baseIncome }: { pillars: PillarRow[]; baseIncome: number }) {
  const [amounts, setAmounts] = useState<Record<PillarName, string>>(() => {
    const init: Record<PillarName, string> = { ahorro: '0', gasto: '0', inversion: '0' }
    for (const p of pillars) init[p.name] = String(p.monthly_amount)
    return init
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const total = (Number(amounts.ahorro) || 0) + (Number(amounts.gasto) || 0) + (Number(amounts.inversion) || 0)
  const freeMoney = Math.max(0, baseIncome - total)
  const totalValid = total <= baseIncome

  function setPillarAmount(key: PillarName, value: string) {
    const n = Math.max(0, Number(value) || 0)
    setAmounts((prev) => ({ ...prev, [key]: String(n) }))
    setSaved(false)
  }

  async function handleSave() {
    setError(null)
    setSaving(true)
    const res = await updatePillarAmounts({
      ahorro: Number(amounts.ahorro) || 0,
      gasto: Number(amounts.gasto) || 0,
      inversion: Number(amounts.inversion) || 0,
    })
    setSaving(false)
    if (res.error) {
      setError(res.error)
    } else {
      setSaved(true)
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">Distribución de pilares</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Elige cuánto destinas a cada uno (en Bs). Lo que sobre queda como dinero libre.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {pillars.map((pillar) => (
          <div
            key={pillar.id}
            className={`rounded-xl border-t-4 p-3 ${PILLAR_BORDER[pillar.name]} ${PILLAR_TINT[pillar.name]}`}
          >
            <label
              htmlFor={`amount-${pillar.name}`}
              className="flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300"
            >
              <span className={`h-2 w-2 rounded-full ${PILLAR_COLOR[pillar.name]}`} />
              {PILLAR_LABEL[pillar.name]}
            </label>
            <div className="mt-2 flex items-center justify-center gap-1">
              <input
                id={`amount-${pillar.name}`}
                type="number"
                step="any"
                onWheel={(e) => e.currentTarget.blur()}
                min={0}
                value={amounts[pillar.name]}
                onChange={(e) => setPillarAmount(pillar.name, e.target.value)}
                className="w-16 min-w-0 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm outline-none focus:border-brand dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-brand"
              />
              <span className="text-xs text-zinc-500">Bs</span>
            </div>
          </div>
        ))}
      </div>

      <div className={`mt-4 ${sumBarClass(totalValid)}`}>
        {totalValid
          ? `Te quedan ${formatBs(freeMoney)} Bs libres de tu ingreso (${formatBs(baseIncome)} Bs).`
          : `Estos montos suman ${formatBs(total)} Bs, más que tu ingreso (${formatBs(baseIncome)} Bs).`}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="mt-3 text-sm text-green-700 dark:text-green-400">Cambios guardados.</p>
      )}

      <button onClick={handleSave} disabled={!totalValid || saving} className={`mt-4 ${primaryButtonClass}`}>
        {saving ? 'Guardando…' : 'Guardar montos'}
      </button>
    </section>
  )
}
