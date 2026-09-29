'use client'

// Deudas (manual.md v2.0, sección 6): crear una deuda no resta nada. Un
// pago (a mano o de un plan automático) sí resta, en el momento en que se
// registra — siempre contra un pilar específico (+ categoría opcional,
// nunca de gasto fijo). Por defecto Gasto, sin categoría.
//
// Solo la lista — "Nueva deuda" vive en NewDebtForm.tsx, arriba de todo en
// la página (pedido del usuario: crear arriba, ver acumulado abajo).

import { useState } from 'react'
import { formatBs } from '@/lib/format'
import type { AutoPayInterval } from '@/lib/debts'
import PillarCategoryFields, { type CategoryRow, type PillarRow } from '../PillarCategoryFields'
import { archiveDebt, confirmAutoPayment, markDebtPaid, registerPayment, updateAutoPay } from './actions'

type DebtRow = {
  id: string
  name: string
  total_amount: number
  remaining_amount: number
  status: 'active' | 'paid'
  auto_pay_amount: number | null
  auto_pay_start_date: string | null
  auto_pay_interval_unit: AutoPayInterval | null
  auto_pay_interval_count: number | null
  auto_pay_pillar_id: string | null
  auto_pay_category_id: string | null
}

// '2026-09-17' -> '17/09/2026', para mostrar la fecha en el resumen de la
// deuda (los inputs de fecha siguen guardando/mandando el formato ISO).
function formatDateBs(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

function frequencyLabel(unit: AutoPayInterval, count: number): string {
  if (unit === 'day') return count === 1 ? 'cada día' : `cada ${count} días`
  return count === 1 ? 'cada mes' : `cada ${count} meses`
}

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-brand dark:border-zinc-700 dark:focus:border-brand'
const secondaryButtonClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800'
const primaryButtonClass =
  'rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-40 dark:text-zinc-950'

export default function DeudasClient({
  debts,
  pillars,
  categories,
  pendingAutoPayIds,
  todayIso,
}: {
  debts: DebtRow[]
  pillars: PillarRow[]
  categories: CategoryRow[]
  pendingAutoPayIds: string[]
  todayIso: string
}) {
  const gastoPillarId = pillars.find((p) => p.name === 'gasto')?.id ?? ''
  const pendingSet = new Set(pendingAutoPayIds)

  // ---------- Confirmar cuota del plan automático ----------
  const [confirmAutoSaving, setConfirmAutoSaving] = useState<Record<string, boolean>>({})
  const [confirmAutoError, setConfirmAutoError] = useState<Record<string, string | null>>({})

  async function handleConfirmAutoPayment(debtId: string) {
    setConfirmAutoSaving((prev) => ({ ...prev, [debtId]: true }))
    setConfirmAutoError((prev) => ({ ...prev, [debtId]: null }))
    const res = await confirmAutoPayment({ debtId })
    setConfirmAutoSaving((prev) => ({ ...prev, [debtId]: false }))
    if (res.error) {
      setConfirmAutoError((prev) => ({ ...prev, [debtId]: res.error! }))
    }
  }

  // ---------- Registrar pago (por deuda) ----------
  const [paymentOpenId, setPaymentOpenId] = useState<string | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentPillarId, setPaymentPillarId] = useState('')
  const [paymentCategoryId, setPaymentCategoryId] = useState('')
  const [paymentSaving, setPaymentSaving] = useState<Record<string, boolean>>({})
  const [paymentError, setPaymentError] = useState<Record<string, string | null>>({})

  function openPayment(debtId: string) {
    setPaymentOpenId(debtId)
    setPaymentAmount('')
    setPaymentPillarId(gastoPillarId)
    setPaymentCategoryId('')
    setPaymentError((prev) => ({ ...prev, [debtId]: null }))
  }

  async function handleRegisterPayment(debtId: string) {
    const amount = Number(paymentAmount)
    if (!(amount > 0)) {
      setPaymentError((prev) => ({ ...prev, [debtId]: 'Ingresá un monto mayor a 0.' }))
      return
    }
    if (!paymentPillarId) {
      setPaymentError((prev) => ({ ...prev, [debtId]: 'Elegí un pilar.' }))
      return
    }

    setPaymentSaving((prev) => ({ ...prev, [debtId]: true }))
    setPaymentError((prev) => ({ ...prev, [debtId]: null }))
    const res = await registerPayment({
      debtId,
      amount,
      pillarId: paymentPillarId,
      categoryId: paymentCategoryId || null,
    })
    setPaymentSaving((prev) => ({ ...prev, [debtId]: false }))
    if (res.error) {
      setPaymentError((prev) => ({ ...prev, [debtId]: res.error! }))
    } else {
      setPaymentOpenId(null)
    }
  }

  // ---------- Editar/quitar pago automático de una deuda ya creada ----------
  const [autoPayEditingId, setAutoPayEditingId] = useState<string | null>(null)
  const [editAutoPayAmount, setEditAutoPayAmount] = useState('')
  const [editAutoPayStartDate, setEditAutoPayStartDate] = useState(todayIso)
  const [editAutoPayIntervalUnit, setEditAutoPayIntervalUnit] = useState<AutoPayInterval>('month')
  const [editAutoPayIntervalCount, setEditAutoPayIntervalCount] = useState('1')
  const [editAutoPayPillarId, setEditAutoPayPillarId] = useState('')
  const [editAutoPayCategoryId, setEditAutoPayCategoryId] = useState('')
  const [autoPaySaving, setAutoPaySaving] = useState<Record<string, boolean>>({})
  const [autoPayError, setAutoPayError] = useState<Record<string, string | null>>({})

  function openAutoPayEdit(debt: DebtRow) {
    setAutoPayEditingId(debt.id)
    setEditAutoPayAmount(debt.auto_pay_amount !== null ? String(debt.auto_pay_amount) : '')
    setEditAutoPayStartDate(debt.auto_pay_start_date ?? todayIso)
    setEditAutoPayIntervalUnit(debt.auto_pay_interval_unit ?? 'month')
    setEditAutoPayIntervalCount(debt.auto_pay_interval_count !== null ? String(debt.auto_pay_interval_count) : '1')
    setEditAutoPayPillarId(debt.auto_pay_pillar_id ?? gastoPillarId)
    setEditAutoPayCategoryId(debt.auto_pay_category_id ?? '')
    setAutoPayError((prev) => ({ ...prev, [debt.id]: null }))
  }

  async function handleSaveAutoPay(debtId: string) {
    if (!editAutoPayPillarId) {
      setAutoPayError((prev) => ({ ...prev, [debtId]: 'Elegí de qué pilar sale el pago automático.' }))
      return
    }
    if (!editAutoPayStartDate) {
      setAutoPayError((prev) => ({ ...prev, [debtId]: 'Elegí la fecha del primer pago.' }))
      return
    }
    if (!(Number(editAutoPayIntervalCount) > 0)) {
      setAutoPayError((prev) => ({ ...prev, [debtId]: 'La frecuencia debe ser mayor a 0.' }))
      return
    }

    setAutoPaySaving((prev) => ({ ...prev, [debtId]: true }))
    setAutoPayError((prev) => ({ ...prev, [debtId]: null }))
    const res = await updateAutoPay({
      debtId,
      autoPay: {
        amount: Number(editAutoPayAmount),
        startDate: editAutoPayStartDate,
        intervalUnit: editAutoPayIntervalUnit,
        intervalCount: Number(editAutoPayIntervalCount),
        pillarId: editAutoPayPillarId,
        categoryId: editAutoPayCategoryId || null,
      },
    })
    setAutoPaySaving((prev) => ({ ...prev, [debtId]: false }))
    if (res.error) {
      setAutoPayError((prev) => ({ ...prev, [debtId]: res.error! }))
    } else {
      setAutoPayEditingId(null)
    }
  }

  async function handleRemoveAutoPay(debtId: string) {
    setAutoPaySaving((prev) => ({ ...prev, [debtId]: true }))
    await updateAutoPay({ debtId, autoPay: null })
    setAutoPaySaving((prev) => ({ ...prev, [debtId]: false }))
    setAutoPayEditingId(null)
  }

  // ---------- Marcar como pagada ----------
  const [confirmingPaidId, setConfirmingPaidId] = useState<string | null>(null)
  const [markSaving, setMarkSaving] = useState<Record<string, boolean>>({})

  async function handleMarkPaid(debtId: string) {
    setMarkSaving((prev) => ({ ...prev, [debtId]: true }))
    await markDebtPaid({ debtId })
    setMarkSaving((prev) => ({ ...prev, [debtId]: false }))
    setConfirmingPaidId(null)
  }

  // ---------- Archivar (deuda ya pagada) ----------
  const [confirmingArchiveId, setConfirmingArchiveId] = useState<string | null>(null)
  const [archiveSaving, setArchiveSaving] = useState<Record<string, boolean>>({})

  async function handleArchive(debtId: string) {
    setArchiveSaving((prev) => ({ ...prev, [debtId]: true }))
    await archiveDebt({ debtId })
    setArchiveSaving((prev) => ({ ...prev, [debtId]: false }))
    setConfirmingArchiveId(null)
  }

  const activeDebts = debts.filter((d) => d.status === 'active')
  const paidDebts = debts.filter((d) => d.status === 'paid')

  return (
    <section className="flex flex-col gap-3">
      {debts.length === 0 && <p className="text-sm text-zinc-500">Todavía no tenés deudas cargadas.</p>}

      {[...activeDebts, ...paidDebts].map((debt) => {
        const progress = debt.total_amount > 0 ? (1 - debt.remaining_amount / debt.total_amount) * 100 : 100
        const isPaid = debt.status === 'paid'

        return (
          <div key={debt.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{debt.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  isPaid
                    ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                {isPaid ? 'Pagada' : 'Activa'}
              </span>
            </div>

            <p className="mt-1 text-sm text-zinc-500">
              {formatBs(debt.remaining_amount)} Bs pendientes de {formatBs(debt.total_amount)} Bs
            </p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-1.5 rounded-full bg-brand"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            {!isPaid && autoPayEditingId !== debt.id && (
              <p className="mt-2 text-xs text-zinc-500">
                {debt.auto_pay_amount !== null && debt.auto_pay_interval_unit ? (
                  <>
                    Pago automático: {formatBs(debt.auto_pay_amount)} Bs{' '}
                    {frequencyLabel(debt.auto_pay_interval_unit, debt.auto_pay_interval_count ?? 1)}, desde el{' '}
                    {formatDateBs(debt.auto_pay_start_date as string)}
                    {' — '}
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => openAutoPayEdit(debt)}
                  className="font-medium text-brand hover:underline"
                >
                  {debt.auto_pay_amount !== null ? 'Editar' : 'Programar pago automático'}
                </button>
              </p>
            )}

            {!isPaid && autoPayEditingId === debt.id && (
              <div className="mt-2 flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <input
                  type="number"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  placeholder="Cuota (Bs)"
                  value={editAutoPayAmount}
                  onChange={(e) => setEditAutoPayAmount(e.target.value)}
                  className={inputClass}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-500">Fecha del primer pago</label>
                  <input
                    type="date"
                    value={editAutoPayStartDate}
                    onChange={(e) => setEditAutoPayStartDate(e.target.value)}
                    className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-500">Repetir cada</span>
                  <input
                    type="number"
                    onWheel={(e) => e.currentTarget.blur()}
                    min={1}
                    value={editAutoPayIntervalCount}
                    onChange={(e) => setEditAutoPayIntervalCount(e.target.value)}
                    className={`${inputClass} w-16 text-right`}
                  />
                  <select
                    value={editAutoPayIntervalUnit}
                    onChange={(e) => setEditAutoPayIntervalUnit(e.target.value as AutoPayInterval)}
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
                <PillarCategoryFields
                  pillars={pillars}
                  categories={categories}
                  pillarId={editAutoPayPillarId}
                  setPillarId={setEditAutoPayPillarId}
                  categoryId={editAutoPayCategoryId}
                  setCategoryId={setEditAutoPayCategoryId}
                />
                {autoPayError[debt.id] && (
                  <p className="text-sm text-red-600" role="alert">
                    {autoPayError[debt.id]}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleSaveAutoPay(debt.id)}
                    disabled={autoPaySaving[debt.id]}
                    className={primaryButtonClass}
                  >
                    {autoPaySaving[debt.id] ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button onClick={() => setAutoPayEditingId(null)} className={secondaryButtonClass}>
                    Cancelar
                  </button>
                  {debt.auto_pay_amount !== null && (
                    <button
                      onClick={() => handleRemoveAutoPay(debt.id)}
                      disabled={autoPaySaving[debt.id]}
                      className="text-sm font-medium text-red-600 hover:text-red-700"
                    >
                      Quitar plan automático
                    </button>
                  )}
                </div>
              </div>
            )}

            {!isPaid && pendingSet.has(debt.id) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                <span>
                  Te toca pagar {formatBs(debt.auto_pay_amount ?? 0)} Bs de &quot;{debt.name}&quot;.
                </span>
                <button
                  onClick={() => handleConfirmAutoPayment(debt.id)}
                  disabled={confirmAutoSaving[debt.id]}
                  className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-800 disabled:opacity-40"
                >
                  {confirmAutoSaving[debt.id] ? 'Guardando…' : 'Ya la pagué'}
                </button>
                {confirmAutoError[debt.id] && (
                  <p className="w-full text-red-600" role="alert">
                    {confirmAutoError[debt.id]}
                  </p>
                )}
              </div>
            )}

            {!isPaid && (
              <>
                {paymentOpenId === debt.id ? (
                  <div className="mt-3 flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                    <input
                      type="number"
                      onWheel={(e) => e.currentTarget.blur()}
                      min={0}
                      placeholder="Monto (Bs)"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className={inputClass}
                    />
                    <PillarCategoryFields
                      pillars={pillars}
                      categories={categories}
                      pillarId={paymentPillarId}
                      setPillarId={setPaymentPillarId}
                      categoryId={paymentCategoryId}
                      setCategoryId={setPaymentCategoryId}
                    />
                    {paymentError[debt.id] && (
                      <p className="text-sm text-red-600" role="alert">
                        {paymentError[debt.id]}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRegisterPayment(debt.id)}
                        disabled={paymentSaving[debt.id]}
                        className={primaryButtonClass}
                      >
                        {paymentSaving[debt.id] ? 'Guardando…' : 'Confirmar pago'}
                      </button>
                      <button onClick={() => setPaymentOpenId(null)} className={secondaryButtonClass}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : confirmingPaidId === debt.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                    <p className="text-sm text-zinc-500">¿Marcar &quot;{debt.name}&quot; como pagada?</p>
                    <button
                      onClick={() => handleMarkPaid(debt.id)}
                      disabled={markSaving[debt.id]}
                      className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-40"
                    >
                      Sí, marcar pagada
                    </button>
                    <button onClick={() => setConfirmingPaidId(null)} className={secondaryButtonClass}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-3">
                    <button onClick={() => openPayment(debt.id)} className={secondaryButtonClass}>
                      Registrar pago
                    </button>
                    <button
                      onClick={() => setConfirmingPaidId(debt.id)}
                      className="text-sm font-medium text-red-600 hover:text-red-700"
                    >
                      Marcar como pagada
                    </button>
                  </div>
                )}
              </>
            )}

            {isPaid &&
              (confirmingArchiveId === debt.id ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <p className="text-sm text-zinc-500">¿Archivar &quot;{debt.name}&quot;?</p>
                  <button
                    onClick={() => handleArchive(debt.id)}
                    disabled={archiveSaving[debt.id]}
                    className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-40"
                  >
                    Sí, archivar
                  </button>
                  <button onClick={() => setConfirmingArchiveId(null)} className={secondaryButtonClass}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="mt-3">
                  <button
                    onClick={() => setConfirmingArchiveId(debt.id)}
                    className="text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    Archivar
                  </button>
                </div>
              ))}
          </div>
        )
      })}
    </section>
  )
}
