'use client'

// Formulario de "Nuevo deudor", separado de DeudoresClient (que ahora solo
// tiene la lista) para poder mostrarlo arriba de TODA la acumulación —
// tanto la lista de deudores propios como "Deudas vinculadas" (pedido del
// usuario: crear arriba, ver acumulado abajo).

import { useState } from 'react'
import LinkedDebtInviteForm from '../shared-debts/LinkedDebtInviteForm'
import { createDebtor } from './actions'

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-brand dark:border-zinc-700 dark:focus:border-brand'
const primaryButtonClass =
  'rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-40 dark:text-zinc-950'

export default function NewDebtorForm({ todayIso }: { todayIso: string }) {
  const [debtorKind, setDebtorKind] = useState<'propio' | 'compartido'>('propio')
  const [newName, setNewName] = useState('')
  const [newTotal, setNewTotal] = useState('')
  const [newLentDate, setNewLentDate] = useState(todayIso)
  const [newExpectedDate, setNewExpectedDate] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function handleCreateDebtor() {
    const name = newName.trim()
    const totalAmount = Number(newTotal)
    if (!name) return setCreateError('Ingresa el nombre de quién te debe.')
    if (!(totalAmount > 0)) return setCreateError('El monto debe ser mayor a 0.')

    setCreating(true)
    setCreateError(null)
    const res = await createDebtor({
      name,
      totalAmount,
      lentDate: newLentDate,
      expectedDate: newExpectedDate || null,
      description: newDescription || null,
    })
    setCreating(false)
    if (res.error) {
      setCreateError(res.error)
    } else {
      setNewName('')
      setNewTotal('')
      setNewLentDate(todayIso)
      setNewExpectedDate('')
      setNewDescription('')
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">Nuevo deudor</h2>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setDebtorKind('propio')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            debtorKind === 'propio'
              ? 'bg-brand text-white dark:text-zinc-950'
              : 'border border-zinc-300 dark:border-zinc-700'
          }`}
        >
          Propio
        </button>
        <button
          type="button"
          onClick={() => setDebtorKind('compartido')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            debtorKind === 'compartido'
              ? 'bg-brand text-white dark:text-zinc-950'
              : 'border border-zinc-300 dark:border-zinc-700'
          }`}
        >
          Compartido con otra persona
        </button>
      </div>

      {debtorKind === 'compartido' ? (
        <div className="mt-3">
          <LinkedDebtInviteForm role="creditor" todayIso={todayIso} />
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <input
            type="text"
            placeholder="Nombre de quién te debe"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className={inputClass}
          />
          <input
            type="number"
            onWheel={(e) => e.currentTarget.blur()}
            min={0}
            placeholder="Monto prestado (Bs)"
            value={newTotal}
            onChange={(e) => setNewTotal(e.target.value)}
            className={inputClass}
          />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">Fecha del préstamo</label>
            <input
              type="date"
              value={newLentDate}
              onChange={(e) => setNewLentDate(e.target.value)}
              className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">Fecha esperada de cobro (opcional)</label>
            <input
              type="date"
              value={newExpectedDate}
              onChange={(e) => setNewExpectedDate(e.target.value)}
              className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`}
            />
          </div>
          <input
            type="text"
            placeholder="Descripción (opcional, ej. Para el almuerzo del viernes)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className={inputClass}
          />

          {createError && (
            <p className="text-sm text-red-600" role="alert">
              {createError}
            </p>
          )}

          <button onClick={handleCreateDebtor} disabled={creating} className={`mt-1 ${primaryButtonClass}`}>
            {creating ? 'Guardando…' : 'Agregar deudor'}
          </button>
        </div>
      )}
    </section>
  )
}
