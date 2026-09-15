'use client'

// Sección "Deudas vinculadas", compartida entre Deudas (role="debtor") y
// Deudores (role="creditor") — una fila de shared_debts es la misma cosa
// vista desde los dos ángulos. Antes de aceptar un pedido, o antes de
// confirmar un pago propuesto, no afecta el presupuesto de nadie (manual
// interno del proyecto — ver memoria financyboss-deudas-vinculadas-entre-usuarios).

import { useState } from 'react'
import { formatBs } from '@/lib/format'
import PillarCategoryFields, { type CategoryRow, type PillarRow } from '../PillarCategoryFields'
import {
  acceptSharedDebtInvite,
  archiveSharedDebt,
  confirmSharedPayment,
  createSharedDebtInvite,
  findUserByEmail,
  proposeSharedPayment,
  rejectSharedDebtInvite,
  rejectSharedPayment,
} from './actions'

export type SharedDebtRow = {
  id: string
  name: string
  description: string | null
  total_amount: number
  remaining_amount: number
  status: 'pending' | 'active' | 'rejected' | 'paid' | 'archived'
  created_by: string
  counterpartName: string
}
export type PendingSharedPayment = { id: string; sharedDebtId: string; amount: number }
export type RejectedSharedPayment = { id: string; sharedDebtId: string; amount: number; note: string | null }

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100'
const secondaryButtonClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800'
const primaryButtonClass =
  'rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300'

export default function SharedDebtsSection({
  role,
  currentUserId,
  debts,
  pendingPaymentsByDebtId,
  rejectedPaymentsByDebtId = {},
  pillars,
  categories,
}: {
  role: 'debtor' | 'creditor'
  currentUserId: string
  debts: SharedDebtRow[]
  pendingPaymentsByDebtId: Record<string, PendingSharedPayment[]>
  rejectedPaymentsByDebtId?: Record<string, RejectedSharedPayment[]>
  pillars: PillarRow[]
  categories: CategoryRow[]
}) {
  const gastoPillarId = pillars.find((p) => p.name === 'gasto')?.id ?? ''

  // ---------- Aceptar / rechazar invitación ----------
  const [respondSaving, setRespondSaving] = useState<Record<string, boolean>>({})

  async function handleAccept(id: string) {
    setRespondSaving((prev) => ({ ...prev, [id]: true }))
    await acceptSharedDebtInvite({ sharedDebtId: id })
    setRespondSaving((prev) => ({ ...prev, [id]: false }))
  }
  async function handleReject(id: string) {
    setRespondSaving((prev) => ({ ...prev, [id]: true }))
    await rejectSharedDebtInvite({ sharedDebtId: id })
    setRespondSaving((prev) => ({ ...prev, [id]: false }))
  }

  // ---------- Proponer pago (rol deudor) ----------
  const [proposeOpenId, setProposeOpenId] = useState<string | null>(null)
  const [proposeAmount, setProposeAmount] = useState('')
  const [proposePillarId, setProposePillarId] = useState('')
  const [proposeCategoryId, setProposeCategoryId] = useState('')
  const [proposeSaving, setProposeSaving] = useState(false)
  const [proposeError, setProposeError] = useState<string | null>(null)

  function openPropose(id: string) {
    setProposeOpenId(id)
    setProposeAmount('')
    setProposePillarId(gastoPillarId)
    setProposeCategoryId('')
    setProposeError(null)
  }

  async function handlePropose(sharedDebtId: string) {
    const amount = Number(proposeAmount)
    if (!(amount > 0)) return setProposeError('Ingresá un monto mayor a 0.')
    if (!proposePillarId) return setProposeError('Elegí un pilar.')

    setProposeSaving(true)
    setProposeError(null)
    const res = await proposeSharedPayment({
      sharedDebtId,
      amount,
      pillarId: proposePillarId,
      categoryId: proposeCategoryId || null,
    })
    setProposeSaving(false)
    if (res.error) setProposeError(res.error)
    else setProposeOpenId(null)
  }

  // ---------- Confirmar / rechazar pago (rol acreedor) ----------
  const [confirmOpenId, setConfirmOpenId] = useState<string | null>(null)
  const [confirmPillarId, setConfirmPillarId] = useState('')
  const [confirmCategoryId, setConfirmCategoryId] = useState('')
  const [confirmSaving, setConfirmSaving] = useState<Record<string, boolean>>({})
  const [confirmError, setConfirmError] = useState<string | null>(null)

  function openConfirm(paymentId: string) {
    setConfirmOpenId(paymentId)
    setConfirmPillarId(gastoPillarId)
    setConfirmCategoryId('')
    setConfirmError(null)
  }

  async function handleConfirmPayment(paymentId: string) {
    if (!confirmPillarId) return setConfirmError('Elegí a qué pilar entra esa plata.')
    setConfirmSaving((prev) => ({ ...prev, [paymentId]: true }))
    setConfirmError(null)
    const res = await confirmSharedPayment({
      paymentId,
      pillarId: confirmPillarId,
      categoryId: confirmCategoryId || null,
    })
    setConfirmSaving((prev) => ({ ...prev, [paymentId]: false }))
    if (res.error) setConfirmError(res.error)
    else setConfirmOpenId(null)
  }

  // ---------- Rechazar pago, con nota opcional ----------
  const [rejectOpenId, setRejectOpenId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  function openReject(paymentId: string) {
    setRejectOpenId(paymentId)
    setRejectNote('')
  }

  async function handleRejectPayment(paymentId: string) {
    setConfirmSaving((prev) => ({ ...prev, [paymentId]: true }))
    await rejectSharedPayment({ paymentId, note: rejectNote })
    setConfirmSaving((prev) => ({ ...prev, [paymentId]: false }))
    setRejectOpenId(null)
  }

  // ---------- Archivar ----------
  const [archiveSaving, setArchiveSaving] = useState<Record<string, boolean>>({})
  async function handleArchive(id: string) {
    setArchiveSaving((prev) => ({ ...prev, [id]: true }))
    await archiveSharedDebt({ sharedDebtId: id })
    setArchiveSaving((prev) => ({ ...prev, [id]: false }))
  }

  // ---------- Nueva invitación ----------
  const [email, setEmail] = useState('')
  const [lookupResult, setLookupResult] = useState<{ userId: string; name: string } | null>(null)
  const [lookupSaving, setLookupSaving] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newTotal, setNewTotal] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function handleLookup() {
    setLookupSaving(true)
    setLookupError(null)
    setLookupResult(null)
    const res = await findUserByEmail(email)
    setLookupSaving(false)
    if ('error' in res) setLookupError(res.error)
    else setLookupResult(res)
  }

  async function handleCreateInvite() {
    if (!lookupResult) return
    const name = newName.trim()
    const totalAmount = Number(newTotal)
    if (!name) return setCreateError('Ingresá un nombre para esta deuda.')
    if (!(totalAmount > 0)) return setCreateError('El monto debe ser mayor a 0.')

    setCreating(true)
    setCreateError(null)
    const res = await createSharedDebtInvite({
      direction: role === 'debtor' ? 'yo_debo' : 'me_deben',
      counterpartUserId: lookupResult.userId,
      counterpartName: lookupResult.name,
      name,
      description: newDescription || null,
      totalAmount,
    })
    setCreating(false)
    if (res.error) {
      setCreateError(res.error)
    } else {
      setEmail('')
      setLookupResult(null)
      setNewName('')
      setNewDescription('')
      setNewTotal('')
    }
  }

  const visible = debts.filter((d) => d.status !== 'rejected' && d.status !== 'archived')

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">Deudas vinculadas</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Una deuda vinculada a otro usuario de FinancyBoss: un solo saldo, para los dos.
      </p>

      <div className="mt-3 flex flex-col gap-3">
        {visible.length === 0 && (
          <p className="text-sm text-zinc-500">Todavía no tenés deudas vinculadas.</p>
        )}

        {visible.map((debt) => {
          const isInvitee = debt.created_by !== currentUserId
          const isPaid = debt.status === 'paid'
          const progress =
            debt.total_amount > 0 ? (1 - debt.remaining_amount / debt.total_amount) * 100 : 100
          const payments = pendingPaymentsByDebtId[debt.id] ?? []
          const rejectedPayments = rejectedPaymentsByDebtId[debt.id] ?? []

          return (
            <div key={debt.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{debt.name}</span>
                <span className="text-xs text-zinc-500">con {debt.counterpartName}</span>
              </div>
              {debt.description && <p className="mt-1 text-xs text-zinc-500">{debt.description}</p>}

              {debt.status === 'pending' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {isInvitee ? (
                    <>
                      <span className="text-sm text-zinc-500">
                        Te invitó a una deuda de {formatBs(debt.total_amount)} Bs. ¿Aceptás?
                      </span>
                      <button
                        onClick={() => handleAccept(debt.id)}
                        disabled={respondSaving[debt.id]}
                        className={primaryButtonClass}
                      >
                        Aceptar
                      </button>
                      <button
                        onClick={() => handleReject(debt.id)}
                        disabled={respondSaving[debt.id]}
                        className="text-sm font-medium text-red-600 hover:text-red-700"
                      >
                        Rechazar
                      </button>
                    </>
                  ) : (
                    <span className="text-sm text-zinc-500">
                      Esperando que {debt.counterpartName} acepte tu pedido.
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <p className="mt-1 text-sm text-zinc-500">
                    {formatBs(debt.remaining_amount)} Bs pendientes de {formatBs(debt.total_amount)} Bs
                  </p>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100"
                      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                  </div>

                  {role === 'creditor' &&
                    payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="mt-3 flex flex-col gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                      >
                        <span>{debt.counterpartName} dice que te pagó {formatBs(payment.amount)} Bs.</span>
                        {confirmOpenId === payment.id ? (
                          <div className="flex flex-col gap-2">
                            <span>¿A qué pilar/categoría entra esa plata?</span>
                            <PillarCategoryFields
                              pillars={pillars}
                              categories={categories}
                              pillarId={confirmPillarId}
                              setPillarId={setConfirmPillarId}
                              categoryId={confirmCategoryId}
                              setCategoryId={setConfirmCategoryId}
                            />
                            {confirmError && (
                              <p className="text-red-600" role="alert">
                                {confirmError}
                              </p>
                            )}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleConfirmPayment(payment.id)}
                                disabled={confirmSaving[payment.id]}
                                className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-800 disabled:opacity-40"
                              >
                                {confirmSaving[payment.id] ? 'Guardando…' : 'Confirmar'}
                              </button>
                              <button onClick={() => setConfirmOpenId(null)} className={secondaryButtonClass}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : rejectOpenId === payment.id ? (
                          <div className="flex flex-col gap-2">
                            <input
                              type="text"
                              placeholder="Nota para explicar por qué (opcional)"
                              value={rejectNote}
                              onChange={(e) => setRejectNote(e.target.value)}
                              className={inputClass}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleRejectPayment(payment.id)}
                                disabled={confirmSaving[payment.id]}
                                className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-40"
                              >
                                {confirmSaving[payment.id] ? 'Guardando…' : 'Rechazar'}
                              </button>
                              <button onClick={() => setRejectOpenId(null)} className={secondaryButtonClass}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => openConfirm(payment.id)} className={secondaryButtonClass}>
                              Confirmar
                            </button>
                            <button
                              onClick={() => openReject(payment.id)}
                              className="text-sm font-medium text-red-600 hover:text-red-700"
                            >
                              Rechazar
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                  {role === 'debtor' &&
                    rejectedPayments.map((payment) => (
                      <div
                        key={payment.id}
                        className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400"
                      >
                        <p>
                          {debt.counterpartName} rechazó tu pago propuesto de {formatBs(payment.amount)} Bs.
                        </p>
                        {payment.note && <p className="mt-1 italic">&quot;{payment.note}&quot;</p>}
                      </div>
                    ))}

                  {role === 'debtor' && !isPaid && (
                    <>
                      {proposeOpenId === debt.id ? (
                        <div className="mt-3 flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                          <input
                            type="number"
                            onWheel={(e) => e.currentTarget.blur()}
                            min={0}
                            placeholder="Monto (Bs)"
                            value={proposeAmount}
                            onChange={(e) => setProposeAmount(e.target.value)}
                            className={inputClass}
                          />
                          <PillarCategoryFields
                            pillars={pillars}
                            categories={categories}
                            pillarId={proposePillarId}
                            setPillarId={setProposePillarId}
                            categoryId={proposeCategoryId}
                            setCategoryId={setProposeCategoryId}
                          />
                          {proposeError && (
                            <p className="text-sm text-red-600" role="alert">
                              {proposeError}
                            </p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handlePropose(debt.id)}
                              disabled={proposeSaving}
                              className={primaryButtonClass}
                            >
                              {proposeSaving ? 'Guardando…' : 'Proponer pago'}
                            </button>
                            <button onClick={() => setProposeOpenId(null)} className={secondaryButtonClass}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3">
                          <button onClick={() => openPropose(debt.id)} className={secondaryButtonClass}>
                            Proponer pago
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {isPaid && (
                    <div className="mt-3">
                      <button
                        onClick={() => handleArchive(debt.id)}
                        disabled={archiveSaving[debt.id]}
                        className="text-sm font-medium text-red-600 hover:text-red-700"
                      >
                        Archivar
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <h3 className="text-sm font-medium">
          + Vincular {role === 'debtor' ? 'una deuda' : 'un deudor'} a otro usuario
        </h3>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="Email de la otra persona"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setLookupResult(null)
            }}
            className={`${inputClass} flex-1`}
          />
          <button onClick={handleLookup} disabled={lookupSaving} className={secondaryButtonClass}>
            {lookupSaving ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        {lookupError && (
          <p className="text-sm text-red-600" role="alert">
            {lookupError}
          </p>
        )}
        {lookupResult && (
          <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
            <p className="text-sm">
              Encontramos a <span className="font-medium">{lookupResult.name}</span>. Completá los datos:
            </p>
            <input
              type="text"
              placeholder="Nombre de la deuda (ej. Préstamo para el viaje)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="Descripción (opcional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
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
            {createError && (
              <p className="text-sm text-red-600" role="alert">
                {createError}
              </p>
            )}
            <button onClick={handleCreateInvite} disabled={creating} className={primaryButtonClass}>
              {creating ? 'Enviando…' : 'Enviar invitación'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
