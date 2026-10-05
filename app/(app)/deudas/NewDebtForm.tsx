'use client'

// Formulario de "Nueva deuda", separado de DeudasClient (que ahora solo
// tiene la lista) para poder mostrarlo arriba de TODA la acumulación —
// tanto la lista de deudas propias como "Deudas vinculadas" (pedido del
// usuario: crear arriba, ver acumulado abajo).

import { useState } from 'react'
import type { AutoPayInterval } from '@/lib/debts'
import LinkedDebtInviteForm from '../shared-debts/LinkedDebtInviteForm'
import PillarCategoryFields, { type CategoryRow, type PillarRow } from '../PillarCategoryFields'
import { createDebt, type CreateDebtInput } from './actions'

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-brand dark:border-zinc-700 dark:focus:border-brand'
const primaryButtonClass =
  'rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-40 dark:text-zinc-950'

export default function NewDebtForm({
  pillars,
  categories,
  todayIso,
}: {
  pillars: PillarRow[]
  categories: CategoryRow[]
  todayIso: string
}) {
  const gastoPillarId = pillars.find((p) => p.name === 'gasto')?.id ?? ''

  const [debtKind, setDebtKind] = useState<'propia' | 'compartida'>('propia')
  const [newName, setNewName] = useState('')
  const [newTotal, setNewTotal] = useState('')
  const [autoPayEnabled, setAutoPayEnabled] = useState(false)
  const [autoPayAmount, setAutoPayAmount] = useState('')
  const [autoPayStartDate, setAutoPayStartDate] = useState(todayIso)
  const [autoPayIntervalUnit, setAutoPayIntervalUnit] = useState<AutoPayInterval>('month')
  const [autoPayIntervalCount, setAutoPayIntervalCount] = useState('1')
  const [autoPayPillarId, setAutoPayPillarId] = useState(gastoPillarId)
  const [autoPayCategoryId, setAutoPayCategoryId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function handleCreateDebt() {
    const name = newName.trim()
    const totalAmount = Number(newTotal)
    if (!name) return setCreateError('Ingresa un nombre para la deuda.')
    if (!(totalAmount > 0)) return setCreateError('El monto debe ser mayor a 0.')
    if (autoPayEnabled) {
      if (!autoPayPillarId) return setCreateError('Elige de qué pilar sale el pago automático.')
      if (!autoPayStartDate) return setCreateError('Elige la fecha del primer pago.')
      if (!(Number(autoPayIntervalCount) > 0)) return setCreateError('La frecuencia debe ser mayor a 0.')
    }

    const autoPay: CreateDebtInput['autoPay'] = autoPayEnabled
      ? {
          amount: Number(autoPayAmount),
          startDate: autoPayStartDate,
          intervalUnit: autoPayIntervalUnit,
          intervalCount: Number(autoPayIntervalCount),
          pillarId: autoPayPillarId,
          categoryId: autoPayCategoryId || null,
        }
      : undefined

    setCreating(true)
    setCreateError(null)
    const res = await createDebt({ name, totalAmount, autoPay })
    setCreating(false)
    if (res.error) {
      setCreateError(res.error)
    } else {
      setNewName('')
      setNewTotal('')
      setAutoPayEnabled(false)
      setAutoPayAmount('')
      setAutoPayStartDate(todayIso)
      setAutoPayIntervalUnit('month')
      setAutoPayIntervalCount('1')
      setAutoPayPillarId(gastoPillarId)
      setAutoPayCategoryId('')
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">Nueva deuda</h2>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setDebtKind('propia')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            debtKind === 'propia'
              ? 'bg-brand text-white dark:text-zinc-950'
              : 'border border-zinc-300 dark:border-zinc-700'
          }`}
        >
          Propia
        </button>
        <button
          type="button"
          onClick={() => setDebtKind('compartida')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            debtKind === 'compartida'
              ? 'bg-brand text-white dark:text-zinc-950'
              : 'border border-zinc-300 dark:border-zinc-700'
          }`}
        >
          Compartida con otra persona
        </button>
      </div>

      {debtKind === 'compartida' ? (
        <div className="mt-3">
          <LinkedDebtInviteForm role="debtor" todayIso={todayIso} />
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <input
            type="text"
            placeholder="Nombre (ej. Tarjeta Banco X)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className={inputClass}
          />
          <input
            type="number"
            onWheel={(e) => e.currentTarget.blur()}
            min={0}
            placeholder="Monto total (Bs)"
            value={newTotal}
            onChange={(e) => setNewTotal(e.target.value)}
            className={inputClass}
          />

          <label className="mt-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoPayEnabled}
              onChange={(e) => setAutoPayEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            Programar pagos automáticos
          </label>

          {autoPayEnabled && (
            <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <input
                type="number"
                onWheel={(e) => e.currentTarget.blur()}
                min={0}
                placeholder="Cuota (Bs)"
                value={autoPayAmount}
                onChange={(e) => setAutoPayAmount(e.target.value)}
                className={inputClass}
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Fecha del primer pago</label>
                <input
                  type="date"
                  value={autoPayStartDate}
                  onChange={(e) => setAutoPayStartDate(e.target.value)}
                  className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-500">Repetir cada</span>
                <input
                  type="number"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={1}
                  value={autoPayIntervalCount}
                  onChange={(e) => setAutoPayIntervalCount(e.target.value)}
                  className={`${inputClass} w-16 text-right`}
                />
                <select
                  value={autoPayIntervalUnit}
                  onChange={(e) => setAutoPayIntervalUnit(e.target.value as AutoPayInterval)}
                  className={`${inputClass} flex-1 [color-scheme:light] dark:[color-scheme:dark]`}
                >
                  <option value="day" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                    días
                  </option>
                  <option value="month" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                    meses
                  </option>
                </select>
              </div>
              <p className="text-xs text-zinc-500">
                Ej. cada 1 mes desde el 20 = el 20 de cada mes. Cada 15 días desde hoy = cada 15
                días exactos, sin importar el mes.
              </p>
              <PillarCategoryFields
                pillars={pillars}
                categories={categories}
                pillarId={autoPayPillarId}
                setPillarId={setAutoPayPillarId}
                categoryId={autoPayCategoryId}
                setCategoryId={setAutoPayCategoryId}
              />
            </div>
          )}

          {createError && (
            <p className="text-sm text-red-600" role="alert">
              {createError}
            </p>
          )}

          <button onClick={handleCreateDebt} disabled={creating} className={`mt-1 ${primaryButtonClass}`}>
            {creating ? 'Guardando…' : 'Agregar deuda'}
          </button>
        </div>
      )}
    </section>
  )
}
