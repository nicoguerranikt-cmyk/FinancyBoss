'use client'

// Deudores (manual.md v2.0, sección 7): lo inverso de Deudas. Un registro
// no es más que "esto me deben" — un cobro (parcial o total) se convierte
// en un ingreso extra contra el pilar/categoría que el usuario elige.

import { useState } from 'react'
import { formatBs } from '@/lib/format'
import PillarCategoryFields, { type CategoryRow, type PillarRow } from '../PillarCategoryFields'
import { archiveDebtor, createDebtor, registerCollection } from './actions'

type DebtorRow = {
  id: string
  name: string
  total_amount: number
  remaining_amount: number
  lent_date: string
  expected_date: string | null
  description: string | null
  status: 'pending' | 'paid'
}

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100'
const secondaryButtonClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800'
const primaryButtonClass =
  'rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300'

export default function DeudoresClient({
  debtors,
  pillars,
  categories,
  todayIso,
}: {
  debtors: DebtorRow[]
  pillars: PillarRow[]
  categories: CategoryRow[]
  todayIso: string
}) {
  // ---------- Registrar cobro (por deudor) ----------
  const [collectionOpenId, setCollectionOpenId] = useState<string | null>(null)
  const [collectionAmount, setCollectionAmount] = useState('')
  const [collectionPillarId, setCollectionPillarId] = useState('')
  const [collectionCategoryId, setCollectionCategoryId] = useState('')
  const [collectionSaving, setCollectionSaving] = useState<Record<string, boolean>>({})
  const [collectionError, setCollectionError] = useState<Record<string, string | null>>({})

  function openCollection(debtorId: string) {
    setCollectionOpenId(debtorId)
    setCollectionAmount('')
    setCollectionPillarId('')
    setCollectionCategoryId('')
    setCollectionError((prev) => ({ ...prev, [debtorId]: null }))
  }

  async function handleRegisterCollection(debtorId: string) {
    const amount = Number(collectionAmount)
    if (!(amount > 0)) {
      setCollectionError((prev) => ({ ...prev, [debtorId]: 'Ingresá un monto mayor a 0.' }))
      return
    }
    if (!collectionPillarId) {
      setCollectionError((prev) => ({ ...prev, [debtorId]: 'Elegí a dónde va ese dinero.' }))
      return
    }

    setCollectionSaving((prev) => ({ ...prev, [debtorId]: true }))
    setCollectionError((prev) => ({ ...prev, [debtorId]: null }))
    const res = await registerCollection({
      debtorId,
      amount,
      pillarId: collectionPillarId,
      categoryId: collectionCategoryId || null,
    })
    setCollectionSaving((prev) => ({ ...prev, [debtorId]: false }))
    if (res.error) {
      setCollectionError((prev) => ({ ...prev, [debtorId]: res.error! }))
    } else {
      setCollectionOpenId(null)
    }
  }

  // ---------- Archivar ----------
  const [confirmingArchiveId, setConfirmingArchiveId] = useState<string | null>(null)
  const [archiveSaving, setArchiveSaving] = useState<Record<string, boolean>>({})

  async function handleArchive(debtorId: string) {
    setArchiveSaving((prev) => ({ ...prev, [debtorId]: true }))
    await archiveDebtor({ debtorId })
    setArchiveSaving((prev) => ({ ...prev, [debtorId]: false }))
    setConfirmingArchiveId(null)
  }

  // ---------- Nuevo deudor ----------
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
    if (!name) return setCreateError('Ingresá el nombre de quién te debe.')
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

  const pendingDebtors = debtors.filter((d) => d.status === 'pending')
  const paidDebtors = debtors.filter((d) => d.status === 'paid')

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Deudores</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Acá registrás a quién le prestaste plata. Un cobro se convierte en un ingreso extra, a
          donde vos elijas.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        {debtors.length === 0 && <p className="text-sm text-zinc-500">Todavía no tenés deudores cargados.</p>}

        {[...pendingDebtors, ...paidDebtors].map((debtor) => {
          const progress =
            debtor.total_amount > 0 ? (1 - debtor.remaining_amount / debtor.total_amount) * 100 : 100
          const isPaid = debtor.status === 'paid'
          const isOverdue = !isPaid && debtor.expected_date !== null && debtor.expected_date < todayIso
          const isConfirmingArchive = confirmingArchiveId === debtor.id

          return (
            <div key={debtor.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{debtor.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    isPaid
                      ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {isPaid ? 'Pagado' : 'Pendiente'}
                </span>
              </div>

              <p className="mt-1 text-sm text-zinc-500">
                {formatBs(debtor.remaining_amount)} Bs pendientes de {formatBs(debtor.total_amount)} Bs
              </p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>

              <p className="mt-2 text-xs text-zinc-500">
                Prestado el {debtor.lent_date}
                {debtor.expected_date ? ` — esperabas cobrar el ${debtor.expected_date}` : ''}
              </p>
              {debtor.description && <p className="mt-1 text-xs text-zinc-500">{debtor.description}</p>}

              {isOverdue && (
                <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                  {debtor.name} te debe {formatBs(debtor.remaining_amount)} Bs desde hace rato — ya
                  pasó la fecha que esperabas cobrar.
                </p>
              )}

              <>
                {collectionOpenId === debtor.id ? (
                    <div className="mt-3 flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                      <input
                        type="number"
                        onWheel={(e) => e.currentTarget.blur()}
                        min={0}
                        placeholder="Monto cobrado (Bs)"
                        value={collectionAmount}
                        onChange={(e) => setCollectionAmount(e.target.value)}
                        className={inputClass}
                      />
                      <PillarCategoryFields
                        pillars={pillars}
                        categories={categories}
                        pillarId={collectionPillarId}
                        setPillarId={setCollectionPillarId}
                        categoryId={collectionCategoryId}
                        setCategoryId={setCollectionCategoryId}
                      />
                      {collectionError[debtor.id] && (
                        <p className="text-sm text-red-600" role="alert">
                          {collectionError[debtor.id]}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRegisterCollection(debtor.id)}
                          disabled={collectionSaving[debtor.id]}
                          className={primaryButtonClass}
                        >
                          {collectionSaving[debtor.id] ? 'Guardando…' : 'Confirmar cobro'}
                        </button>
                        <button onClick={() => setCollectionOpenId(null)} className={secondaryButtonClass}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : isConfirmingArchive ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                      <p className="text-sm text-zinc-500">
                        ¿Archivar &quot;{debtor.name}&quot;? Se conserva el historial de cobros.
                      </p>
                      <button
                        onClick={() => handleArchive(debtor.id)}
                        disabled={archiveSaving[debtor.id]}
                        className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-40"
                      >
                        Sí, archivar
                      </button>
                      <button onClick={() => setConfirmingArchiveId(null)} className={secondaryButtonClass}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-3">
                      {!isPaid && (
                        <button onClick={() => openCollection(debtor.id)} className={secondaryButtonClass}>
                          Registrar cobro
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmingArchiveId(debtor.id)}
                        className="text-sm font-medium text-red-600 hover:text-red-700"
                      >
                        Archivar
                      </button>
                    </div>
                  )}
                </>
            </div>
          )
        })}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">+ Nuevo deudor</h2>
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
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">Fecha esperada de cobro (opcional)</label>
            <input
              type="date"
              value={newExpectedDate}
              onChange={(e) => setNewExpectedDate(e.target.value)}
              className={inputClass}
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
            {creating ? 'Guardando…' : '+ Agregar deudor'}
          </button>
        </div>
      </section>
    </div>
  )
}
