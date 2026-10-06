'use client'

// Formulario para vincular una deuda a otro usuario de FinancyBoss (ver
// memoria financyboss-deudas-vinculadas-entre-usuarios). Extraído de
// SharedDebtsSection.tsx para poder vivir donde tenga sentido en cada
// pantalla — dentro de "Nueva deuda" en Deudas, o como sección propia en
// Deudores — en vez de estar siempre pegado a la lista de deudas vinculadas.
//
// Dos formas de vincular (migración 0024/0025):
//   - 'account': buscás a la otra persona por email o username ANTES de
//     crear la deuda — ya sabés con quién es.
//   - 'link': armás los datos sin elegir contraparte, generás un link, y
//     quien lo abre ve una pantalla de confirmación con un botón Aceptar —
//     recién ahí se sabe quién es y se crea el vínculo.

import { useState } from 'react'
import type { AutoPayInterval } from '@/lib/debts'
import {
  createSharedDebtInvite,
  createSharedDebtLinkInvite,
  findUserByEmail,
  findUserByUsername,
  revokeSharedDebtLinkInvite,
} from './actions'

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-brand dark:border-zinc-700 dark:focus:border-brand'
const secondaryButtonClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800'
const primaryButtonClass =
  'rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-40 dark:text-zinc-950'

export default function LinkedDebtInviteForm({ role, todayIso }: { role: 'debtor' | 'creditor'; todayIso: string }) {
  const [shareMethod, setShareMethod] = useState<'account' | 'link'>('account')

  const [lookupMethod, setLookupMethod] = useState<'email' | 'username'>('email')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [lookupResult, setLookupResult] = useState<{ userId: string; name: string } | null>(null)
  const [lookupSaving, setLookupSaving] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newTotal, setNewTotal] = useState('')
  const [autoPayEnabled, setAutoPayEnabled] = useState(false)
  const [autoPayAmount, setAutoPayAmount] = useState('')
  const [autoPayStartDate, setAutoPayStartDate] = useState(todayIso)
  const [autoPayIntervalUnit, setAutoPayIntervalUnit] = useState<AutoPayInterval>('month')
  const [autoPayIntervalCount, setAutoPayIntervalCount] = useState('1')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [revoked, setRevoked] = useState(false)

  function resetDetailFields() {
    setNewName('')
    setNewDescription('')
    setNewTotal('')
    setAutoPayEnabled(false)
    setAutoPayAmount('')
    setAutoPayStartDate(todayIso)
    setAutoPayIntervalUnit('month')
    setAutoPayIntervalCount('1')
  }

  function handleShareMethodChange(next: 'account' | 'link') {
    setShareMethod(next)
    setCreateError(null)
    setGeneratedLink(null)
    setGeneratedToken(null)
    setRevoked(false)
  }

  async function handleLookup() {
    setLookupSaving(true)
    setLookupError(null)
    setLookupResult(null)
    const res = lookupMethod === 'email' ? await findUserByEmail(email) : await findUserByUsername(username)
    setLookupSaving(false)
    if ('error' in res) setLookupError(res.error)
    else setLookupResult(res)
  }

  function validateDetailFields(): string | null {
    if (!newName.trim()) return 'Ingresa un nombre para esta deuda.'
    if (!(Number(newTotal) > 0)) return 'El monto debe ser mayor a 0.'
    if (autoPayEnabled) {
      if (!autoPayStartDate) return 'Elige la fecha del primer pago.'
      if (!(Number(autoPayIntervalCount) > 0)) return 'La frecuencia debe ser mayor a 0.'
    }
    return null
  }

  function autoPayPayload() {
    return autoPayEnabled
      ? {
          amount: Number(autoPayAmount),
          startDate: autoPayStartDate,
          intervalUnit: autoPayIntervalUnit,
          intervalCount: Number(autoPayIntervalCount),
        }
      : undefined
  }

  async function handleCreateInvite() {
    if (!lookupResult) return
    const validationError = validateDetailFields()
    if (validationError) return setCreateError(validationError)

    setCreating(true)
    setCreateError(null)
    const res = await createSharedDebtInvite({
      direction: role === 'debtor' ? 'yo_debo' : 'me_deben',
      counterpartUserId: lookupResult.userId,
      counterpartName: lookupResult.name,
      name: newName.trim(),
      description: newDescription || null,
      totalAmount: Number(newTotal),
      autoPay: autoPayPayload(),
    })
    setCreating(false)
    if (res.error) {
      setCreateError(res.error)
    } else {
      setEmail('')
      setUsername('')
      setLookupResult(null)
      resetDetailFields()
    }
  }

  async function handleGenerateLink() {
    const validationError = validateDetailFields()
    if (validationError) return setCreateError(validationError)

    setCreating(true)
    setCreateError(null)
    setGeneratedLink(null)
    const res = await createSharedDebtLinkInvite({
      direction: role === 'debtor' ? 'yo_debo' : 'me_deben',
      name: newName.trim(),
      description: newDescription || null,
      totalAmount: Number(newTotal),
      autoPay: autoPayPayload(),
    })
    setCreating(false)
    if ('error' in res) {
      setCreateError(res.error)
      return
    }
    setGeneratedLink(`${window.location.origin}/invitacion/${res.token}`)
    setGeneratedToken(res.token)
    setLinkCopied(false)
    setRevoked(false)
    resetDetailFields()
  }

  async function handleCopyLink() {
    if (!generatedLink) return
    try {
      await navigator.clipboard.writeText(generatedLink)
      setLinkCopied(true)
    } catch {
      // Portapapeles bloqueado (permiso, navegador viejo): el link ya está
      // visible en pantalla, el usuario lo copia a mano.
    }
  }

  async function handleRevokeLink() {
    if (!generatedToken) return
    setRevoking(true)
    setCreateError(null)
    const res = await revokeSharedDebtLinkInvite({ token: generatedToken })
    setRevoking(false)
    if (res.error) {
      setCreateError(res.error)
      return
    }
    setRevoked(true)
  }

  const detailFieldsVisible = shareMethod === 'link' || lookupResult !== null

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="text-sm font-medium">
        Vincular {role === 'debtor' ? 'una deuda' : 'un deudor'} a otro usuario
      </h3>

      <div className="flex gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name={`share-method-${role}`}
            checked={shareMethod === 'account'}
            onChange={() => handleShareMethodChange('account')}
          />
          Buscar cuenta
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name={`share-method-${role}`}
            checked={shareMethod === 'link'}
            onChange={() => handleShareMethodChange('link')}
          />
          Generar link
        </label>
      </div>

      {shareMethod === 'account' && (
        <>
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name={`lookup-method-${role}`}
                checked={lookupMethod === 'email'}
                onChange={() => {
                  setLookupMethod('email')
                  setLookupResult(null)
                }}
              />
              Por email
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name={`lookup-method-${role}`}
                checked={lookupMethod === 'username'}
                onChange={() => {
                  setLookupMethod('username')
                  setLookupResult(null)
                }}
              />
              Por nombre de usuario
            </label>
          </div>
          <div className="flex gap-2">
            {lookupMethod === 'email' ? (
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
            ) : (
              <input
                type="text"
                placeholder="@usuario"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  setLookupResult(null)
                }}
                className={`${inputClass} flex-1`}
              />
            )}
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
            <p className="text-sm">
              Encontramos a <span className="font-medium">{lookupResult.name}</span>. Completa los datos:
            </p>
          )}
        </>
      )}

      {shareMethod === 'link' && !generatedLink && (
        <p className="text-sm text-zinc-500">
          Completa los datos y genera un link para mandarle a la otra persona — no hace falta que
          ya tenga cuenta en FinancyBoss, ni que sepas su email o username. Va a ver una pantalla
          con estos datos y un botón para aceptar antes de que el vínculo se cree.
        </p>
      )}

      {shareMethod === 'link' && generatedLink && (
        <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
          {revoked ? (
            <>
              <p className="text-sm text-zinc-500">Cancelado — ese link ya no se puede usar.</p>
              <button
                onClick={() => {
                  setGeneratedLink(null)
                  setGeneratedToken(null)
                  setRevoked(false)
                }}
                className="self-start text-xs text-zinc-500 underline"
              >
                Generar otro
              </button>
            </>
          ) : (
            <>
              <p className="text-sm">Listo, mándale este link a la otra persona:</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={generatedLink}
                  className={`${inputClass} flex-1`}
                  onFocus={(e) => e.target.select()}
                />
                <button onClick={handleCopyLink} className={secondaryButtonClass}>
                  {linkCopied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                No se vincula nada hasta que la otra persona lo abra y confirme.
              </p>
              {createError && (
                <p className="text-sm text-red-600" role="alert">
                  {createError}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setGeneratedLink(null)
                    setGeneratedToken(null)
                  }}
                  className="text-xs text-zinc-500 underline"
                >
                  Generar otro
                </button>
                <button onClick={handleRevokeLink} disabled={revoking} className="text-xs text-red-600 underline disabled:opacity-40">
                  {revoking ? 'Cancelando…' : 'Cancelar este link'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {detailFieldsVisible && !generatedLink && (
        <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
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
            step="any"
            onWheel={(e) => e.currentTarget.blur()}
            min={0}
            placeholder="Monto total (Bs)"
            value={newTotal}
            onChange={(e) => setNewTotal(e.target.value)}
            className={inputClass}
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoPayEnabled}
              onChange={(e) => setAutoPayEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            Programar recordatorio de pago
          </label>

          {autoPayEnabled && (
            <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <input
                type="number"
                step="any"
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
                Es solo un aviso para que el deudor no se olvide de proponer el pago — no propone
                ni descuenta nada solo.
              </p>
            </div>
          )}

          {createError && (
            <p className="text-sm text-red-600" role="alert">
              {createError}
            </p>
          )}
          <button
            onClick={shareMethod === 'account' ? handleCreateInvite : handleGenerateLink}
            disabled={creating}
            className={primaryButtonClass}
          >
            {creating ? 'Guardando…' : shareMethod === 'account' ? 'Enviar invitación' : 'Generar link'}
          </button>
        </div>
      )}
    </div>
  )
}
