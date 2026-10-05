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
  getCreditorPaymentQrUrl,
  getPaymentReceiptUrl,
  proposeSharedPayment,
  rejectSharedDebtInvite,
  rejectSharedPayment,
  uploadPaymentReceipt,
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
export type PendingSharedPayment = { id: string; sharedDebtId: string; amount: number; hasReceipt: boolean }
export type RejectedSharedPayment = { id: string; sharedDebtId: string; amount: number; note: string | null }

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-brand dark:border-zinc-700 dark:focus:border-brand'
const secondaryButtonClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800'
const primaryButtonClass =
  'rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-40 dark:text-zinc-950'

export default function SharedDebtsSection({
  role,
  currentUserId,
  debts,
  pendingPaymentsByDebtId,
  rejectedPaymentsByDebtId = {},
  pendingAutoPayIds = [],
  pillars,
  categories,
}: {
  role: 'debtor' | 'creditor'
  currentUserId: string
  debts: SharedDebtRow[]
  pendingPaymentsByDebtId: Record<string, PendingSharedPayment[]>
  rejectedPaymentsByDebtId?: Record<string, RejectedSharedPayment[]>
  // Recordatorio de pago programado (rol deudor únicamente, ver
  // LinkedDebtInviteForm) — solo avisa, nunca propone nada solo.
  pendingAutoPayIds?: string[]
  pillars: PillarRow[]
  categories: CategoryRow[]
}) {
  const pendingAutoPaySet = new Set(pendingAutoPayIds)
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
  const [proposeReceiptFile, setProposeReceiptFile] = useState<File | null>(null)
  const [proposeSaving, setProposeSaving] = useState(false)
  const [proposeError, setProposeError] = useState<string | null>(null)

  // QR del acreedor: se pide bajo demanda (no en cada carga de la lista) —
  // solo cuando el deudor abre "Proponer pago" para esa deuda puntual.
  const [qrByDebtId, setQrByDebtId] = useState<Record<string, string | null>>({})
  const [qrLoadingId, setQrLoadingId] = useState<string | null>(null)

  function openPropose(id: string) {
    setProposeOpenId(id)
    setProposeAmount('')
    setProposePillarId(gastoPillarId)
    setProposeCategoryId('')
    setProposeReceiptFile(null)
    setProposeError(null)
    if (qrByDebtId[id] === undefined) {
      setQrLoadingId(id)
      getCreditorPaymentQrUrl({ sharedDebtId: id }).then((res) => {
        setQrLoadingId(null)
        setQrByDebtId((prev) => ({ ...prev, [id]: 'error' in res ? null : res.qrUrl }))
      })
    }
  }

  async function handlePropose(sharedDebtId: string) {
    const amount = Number(proposeAmount)
    if (!(amount > 0)) return setProposeError('Ingresa un monto mayor a 0.')
    if (!proposePillarId) return setProposeError('Elige un pilar.')

    setProposeSaving(true)
    setProposeError(null)
    const res = await proposeSharedPayment({
      sharedDebtId,
      amount,
      pillarId: proposePillarId,
      categoryId: proposeCategoryId || null,
    })
    if (res.error) {
      setProposeSaving(false)
      setProposeError(res.error)
      return
    }
    // El comprobante es opcional: si el pago se propuso bien pero subir la
    // imagen falla, no queremos que parezca que todo falló — el pago ya
    // está propuesto, solo avisamos que la imagen no se pudo adjuntar.
    if (proposeReceiptFile && res.paymentId) {
      const formData = new FormData()
      formData.append('paymentId', res.paymentId)
      formData.append('file', proposeReceiptFile)
      const receiptRes = await uploadPaymentReceipt(formData)
      if (receiptRes.error) {
        setProposeSaving(false)
        setProposeError(`Pago propuesto, pero no pudimos subir el comprobante: ${receiptRes.error}`)
        return
      }
    }
    setProposeSaving(false)
    setProposeOpenId(null)
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
    if (!confirmPillarId) return setConfirmError('Elige a qué pilar entra esa plata.')
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

  // ---------- Ver comprobante (rol acreedor) — bajo demanda ----------
  const [receiptByPaymentId, setReceiptByPaymentId] = useState<Record<string, string | null>>({})
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null)

  async function handleViewReceipt(paymentId: string) {
    setReceiptLoadingId(paymentId)
    const res = await getPaymentReceiptUrl({ paymentId })
    setReceiptLoadingId(null)
    setReceiptByPaymentId((prev) => ({ ...prev, [paymentId]: 'error' in res ? null : res.receiptUrl }))
  }

  // ---------- Archivar ----------
  const [archiveSaving, setArchiveSaving] = useState<Record<string, boolean>>({})
  async function handleArchive(id: string) {
    setArchiveSaving((prev) => ({ ...prev, [id]: true }))
    await archiveSharedDebt({ sharedDebtId: id })
    setArchiveSaving((prev) => ({ ...prev, [id]: false }))
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
          <p className="text-sm text-zinc-500">Todavía no tienes deudas vinculadas.</p>
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
                        Te invitó a una deuda de {formatBs(debt.total_amount)} Bs. ¿Aceptas?
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
                      className="h-1.5 rounded-full bg-brand"
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
                        {payment.hasReceipt && (
                          <div>
                            {receiptByPaymentId[payment.id] === undefined ? (
                              <button
                                onClick={() => handleViewReceipt(payment.id)}
                                disabled={receiptLoadingId === payment.id}
                                className="text-xs font-medium underline"
                              >
                                {receiptLoadingId === payment.id ? 'Cargando…' : 'Ver comprobante'}
                              </button>
                            ) : receiptByPaymentId[payment.id] ? (
                              // eslint-disable-next-line @next/next/no-img-element -- signed URL temporal, no un asset local
                              <img
                                src={receiptByPaymentId[payment.id] as string}
                                alt="Comprobante de pago"
                                className="max-h-48 rounded-lg border border-amber-200 dark:border-amber-900"
                              />
                            ) : (
                              <span className="text-xs">No pudimos cargar el comprobante.</span>
                            )}
                          </div>
                        )}
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

                  {role === 'debtor' && !isPaid && pendingAutoPaySet.has(debt.id) && proposeOpenId !== debt.id && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                      <span>Te toca proponer un pago de &quot;{debt.name}&quot;.</span>
                      <button
                        onClick={() => openPropose(debt.id)}
                        className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-800"
                      >
                        Proponer pago
                      </button>
                    </div>
                  )}

                  {role === 'debtor' && !isPaid && (
                    <>
                      {proposeOpenId === debt.id ? (
                        <div className="mt-3 flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                          {qrLoadingId === debt.id ? (
                            <p className="text-xs text-zinc-500">Buscando el QR de {debt.counterpartName}…</p>
                          ) : qrByDebtId[debt.id] ? (
                            <div className="flex flex-col items-start gap-1">
                              <p className="text-xs text-zinc-500">QR para pagarle a {debt.counterpartName}:</p>
                              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL temporal, no un asset local */}
                              <img
                                src={qrByDebtId[debt.id] as string}
                                alt={`QR de cobro de ${debt.counterpartName}`}
                                className="h-40 w-40 rounded-lg border border-zinc-200 object-contain dark:border-zinc-800"
                              />
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-500">
                              {debt.counterpartName} todavía no subió un QR de cobro.
                            </p>
                          )}
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
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-500">Comprobante (opcional)</label>
                            <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 px-3 py-2 text-sm transition-colors hover:border-brand hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">
                              <svg
                                className="h-4 w-4 shrink-0 text-zinc-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={1.5}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0-12 4 4m-4-4-4 4M4 18h16" />
                              </svg>
                              <span className="truncate text-zinc-500">
                                {proposeReceiptFile ? proposeReceiptFile.name : 'Sube una foto del comprobante'}
                              </span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(e) => setProposeReceiptFile(e.target.files?.[0] ?? null)}
                                className="hidden"
                              />
                            </label>
                          </div>
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
    </section>
  )
}
