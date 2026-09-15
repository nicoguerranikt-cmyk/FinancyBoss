'use client'

// Mi Dinero (manual.md v2.0, sección 2): edición de % de los 3 pilares. Es un
// ajuste conjunto (tienen que sumar exactamente 100, §2.1), por eso vive acá
// en la pantalla general y no dentro de cada pilar por separado. Las
// categorías de cada pilar viven un nivel más adentro (/mi-dinero/[pillarId]).

import { useState } from 'react'
import type { PillarName } from '@/lib/dashboard'
import { updatePillarPercentages } from './actions'

const PILLAR_LABEL: Record<PillarName, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

type PillarRow = { id: string; name: PillarName; percentage: number }

const primaryButtonClass =
  'rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300'

function sumBarClass(valid: boolean) {
  return `rounded-lg px-3 py-2 text-sm ${
    valid
      ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
  }`
}

export default function MiDineroClient({ pillars }: { pillars: PillarRow[] }) {
  const [pct, setPct] = useState<Record<PillarName, number>>(() => {
    const init: Record<PillarName, number> = { ahorro: 0, gasto: 0, inversion: 0 }
    for (const p of pillars) init[p.name] = p.percentage
    return init
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const pctSum = pct.ahorro + pct.gasto + pct.inversion
  const pctSumValid = Math.round(pctSum) === 100

  function setPillarPct(key: PillarName, value: string) {
    const n = Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
    setPct((prev) => ({ ...prev, [key]: n }))
    setSaved(false)
  }

  async function handleSave() {
    setError(null)
    setSaving(true)
    const res = await updatePillarPercentages(pct)
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
              onWheel={(e) => e.currentTarget.blur()}
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

      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="mt-3 text-sm text-green-700 dark:text-green-400">Cambios guardados.</p>
      )}

      <button onClick={handleSave} disabled={!pctSumValid || saving} className={`mt-4 ${primaryButtonClass}`}>
        {saving ? 'Guardando…' : 'Guardar porcentajes'}
      </button>
    </section>
  )
}
