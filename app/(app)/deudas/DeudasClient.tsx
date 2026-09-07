'use client'

// Deudas (manual.md v2.0, sección 6): crear una deuda no resta nada. Un
// pago (a mano o de un plan automático) sí resta, en el momento en que se
// registra — siempre contra un pilar específico (+ categoría opcional,
// nunca de gasto fijo). Por defecto Gasto, sin categoría.

import { useState } from 'react'
import { formatBs } from '@/lib/format'
import PillarCategoryFields, { type CategoryRow, type PillarRow } from '../PillarCategoryFields'
import {
  archiveDebt,
  confirmAutoPayment,
  createDebt,
  markDebtPaid,
  registerPayment,
  type CreateDebtInput,
} from './actions'

const MONTH_LABEL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

type DebtRow = {
  id: string
  name: string
  total_amount: number
  remaining_amount: number
  status: 'active' | 'paid'
  monthly_payment: number | null
  auto_pay_start_year: number | null
  auto_pay_start_month: number | null
  auto_pay_start_day: number | null
  auto_pay_pillar_id: string | null
  auto_pay_category_id: string | null
}

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100'
const secondaryButtonClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800'
const primaryButtonClass =
  'rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300'

export default function DeudasClient({
  debts,
  pillars,
  categories,
  pendingAutoPayIds,
}: {
  debts: DebtRow[]
  pillars: PillarRow[]
  categories: CategoryRow[]
  pendingAutoPayIds: string[]
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

  // ---------- Nueva deuda ----------
  const now = new Date()
  const [newName, setNewName] = useState('')
  const [newTotal, setNewTotal] = useState('')
  const [autoPayEnabled, setAutoPayEnabled] = useState(false)
  const [autoPayAmount, setAutoPayAmount] = useState('')
  const [autoPayMonth, setAutoPayMonth] = useState(now.getMonth() + 1)
  const [autoPayYear, setAutoPayYear] = useState(now.getFullYear())
  const [autoPayDay, setAutoPayDay] = useState('')
  const [autoPayPillarId, setAutoPayPillarId] = useState(gastoPillarId)
  const [autoPayCategoryId, setAutoPayCategoryId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function handleCreateDebt() {
    const name = newName.trim()
    const totalAmount = Number(newTotal)
    if (!name) return setCreateError('Ingresá un nombre para la deuda.')
    if (!(totalAmount > 0)) return setCreateError('El monto debe ser mayor a 0.')
    if (autoPayEnabled && !autoPayPillarId) return setCreateError('Elegí de qué pilar sale el pago automático.')

    const autoPay: CreateDebtInput['autoPay'] = autoPayEnabled
      ? {
          monthlyAmount: Number(autoPayAmount),
          startYear: autoPayYear,
          startMonth: autoPayMonth,
          startDay: autoPayDay ? Number(autoPayDay) : null,
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
      setAutoPayDay('')
      setAutoPayPillarId(gastoPillarId)
      setAutoPayCategoryId('')
    }
  }

  const activeDebts = debts.filter((d) => d.status === 'active')
  const paidDebts = debts.filter((d) => d.status === 'paid')

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Deudas</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Crear una deuda no resta nada. Solo un pago registrado resta, en el momento en que lo
          registrás.
        </p>
      </section>

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
                  className="h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>
              {debt.monthly_payment !== null && !isPaid && (
                <p className="mt-2 text-xs text-zinc-500">
                  Plan automático: {formatBs(debt.monthly_payment)} Bs/mes
                  {debt.auto_pay_start_day ? ` el día ${debt.auto_pay_start_day}` : ''} desde{' '}
                  {MONTH_LABEL[(debt.auto_pay_start_month ?? 1) - 1]} {debt.auto_pay_start_year}
                </p>
              )}

              {!isPaid && pendingSet.has(debt.id) && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                  <span>
                    Te toca pagar {formatBs(debt.monthly_payment ?? 0)} Bs de &quot;{debt.name}&quot; este mes.
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

      <section>
        <h2 className="text-lg font-semibold tracking-tight">+ Nueva deuda</h2>
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
            Configurar plan de pago automático
          </label>

          {autoPayEnabled && (
            <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <input
                type="number"
            onWheel={(e) => e.currentTarget.blur()}
                min={0}
                placeholder="Cuota fija (Bs)"
                value={autoPayAmount}
                onChange={(e) => setAutoPayAmount(e.target.value)}
                className={inputClass}
              />
              <div className="flex gap-2">
                <select
                  value={autoPayMonth}
                  onChange={(e) => setAutoPayMonth(Number(e.target.value))}
                  className={`${inputClass} flex-1 [color-scheme:light] dark:[color-scheme:dark]`}
                >
                  {MONTH_LABEL.map((label, i) => (
                    <option key={label} value={i + 1}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
            onWheel={(e) => e.currentTarget.blur()}
                  value={autoPayYear}
                  onChange={(e) => setAutoPayYear(Number(e.target.value))}
                  className={`${inputClass} w-24`}
                />
              </div>
              <input
                type="number"
                onWheel={(e) => e.currentTarget.blur()}
                min={1}
                max={31}
                placeholder="Día del mes (opcional, ej. 20)"
                value={autoPayDay}
                onChange={(e) => setAutoPayDay(e.target.value)}
                className={inputClass}
              />
              <p className="text-xs text-zinc-500">
                Si dejás el día vacío, el recordatorio aparece desde el 1° del mes de inicio.
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
            {creating ? 'Guardando…' : '+ Agregar deuda'}
          </button>
        </div>
      </section>
    </div>
  )
}
