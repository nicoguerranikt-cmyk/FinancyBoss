'use client'

// Más (manual.md v2.0, sección 9): Perfil + Configuración.

import { useMemo, useRef, useState } from 'react'
import { logout } from '@/app/login/actions'
import { removePaymentQr, updateProfile, uploadPaymentQr } from './actions'

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100'
const primaryButtonClass =
  'rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300'
const secondaryButtonClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800'

export default function MasClient({
  email,
  name: initialName,
  baseIncome: initialBaseIncome,
  autoRepeatIncome: initialAutoRepeat,
  username: initialUsername,
  timeZone: initialTimeZone,
  qrUrl,
}: {
  email: string
  name: string
  baseIncome: number
  autoRepeatIncome: boolean
  username: string | null
  timeZone: string
  qrUrl: string | null
}) {
  const [name, setName] = useState(initialName)
  const [baseIncome, setBaseIncome] = useState(String(initialBaseIncome))
  const [autoRepeatIncome, setAutoRepeatIncome] = useState(initialAutoRepeat)
  const [username, setUsername] = useState(initialUsername ?? '')
  const [timeZone, setTimeZone] = useState(initialTimeZone)
  // Todas las zonas IANA que conoce el navegador, con la guardada siempre
  // incluida (por si el navegador no la lista).
  const timeZoneOptions = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
    return all.includes(initialTimeZone) ? all : [initialTimeZone, ...all]
  }, [initialTimeZone])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const qrFileInputRef = useRef<HTMLInputElement>(null)
  const [qrSaving, setQrSaving] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)

  // No guardamos el resultado en un estado propio: al llamar a una Server
  // Action desde un Client Component, Next.js re-renderiza solo el árbol de
  // Server Components (page.tsx vuelve a generar la signed URL) — el prop
  // qrUrl se actualiza solo con eso.
  async function handleQrFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setQrSaving(true)
    setQrError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await uploadPaymentQr(formData)
      if (res.error) setQrError(res.error)
    } catch {
      setQrError('No pudimos subir el QR. Revisa tu conexión y prueba de nuevo.')
    } finally {
      setQrSaving(false)
      if (qrFileInputRef.current) qrFileInputRef.current.value = ''
    }
  }

  async function handleRemoveQr() {
    setQrSaving(true)
    setQrError(null)
    try {
      const res = await removePaymentQr()
      if (res.error) setQrError(res.error)
    } catch {
      setQrError('No pudimos quitar el QR. Revisa tu conexión y prueba de nuevo.')
    } finally {
      setQrSaving(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await updateProfile({
        name,
        baseIncome: Number(baseIncome),
        autoRepeatIncome,
        username,
        timeZone,
      })
      if (res.error) {
        setError(res.error)
      } else {
        setSaved(true)
      }
    } catch {
      setError('No pudimos guardar los cambios. Revisa tu conexión y prueba de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Más</h1>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Perfil</h2>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium">
              Nombre
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Email</label>
            <p className="text-sm text-zinc-500">{email}</p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="username" className="text-sm font-medium">
              Nombre de usuario
            </label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-zinc-500">@</span>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="ej. nico123"
                className={`${inputClass} flex-1`}
              />
            </div>
            <p className="text-xs text-zinc-500">
              Opcional — sirve para que otros te encuentren al vincular una deuda, sin
              necesitar tu email. 3-20 caracteres: letras, números o guión bajo.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">QR de cobro</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Sube el QR con el que te pagan (banco, billetera). Cuando alguien te deba plata en una
          deuda vinculada, lo va a ver en pantalla al momento de proponer el pago.
        </p>
        <div className="mt-3 flex items-start gap-3">
          <label
            className={`relative flex h-32 w-32 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed border-zinc-300 text-center transition-colors hover:border-brand hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900 ${
              qrSaving ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            {qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL temporal de Supabase Storage, no un asset local para next/image
              <img src={qrUrl} alt="Tu QR de cobro" className="h-full w-full object-contain p-1" />
            ) : (
              <>
                <svg
                  className="h-6 w-6 text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0-12 4 4m-4-4-4 4M4 18h16" />
                </svg>
                <span className="px-2 text-xs font-medium text-zinc-500">
                  {qrSaving ? 'Subiendo…' : 'Sube una imagen'}
                </span>
              </>
            )}
            <input
              ref={qrFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleQrFileChange}
              disabled={qrSaving}
              className="hidden"
            />
          </label>
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-xs text-zinc-500">PNG, JPG o WEBP, hasta 5 MB.</p>
            {qrUrl && (
              <div className="flex gap-2">
                <button onClick={() => qrFileInputRef.current?.click()} disabled={qrSaving} className={secondaryButtonClass}>
                  Cambiar
                </button>
                <button onClick={handleRemoveQr} disabled={qrSaving} className={secondaryButtonClass}>
                  {qrSaving ? 'Guardando…' : 'Quitar'}
                </button>
              </div>
            )}
          </div>
        </div>
        {qrError && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {qrError}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Configuración</h2>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="baseIncome" className="text-sm font-medium">
              Ingreso mensual base (Bs)
            </label>
            <input
              id="baseIncome"
              type="number"
              step="any"
              onWheel={(e) => e.currentTarget.blur()}
              min={0}
              value={baseIncome}
              onChange={(e) => setBaseIncome(e.target.value)}
              className={inputClass}
            />
          </div>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={autoRepeatIncome}
              onChange={(e) => setAutoRepeatIncome(e.target.checked)}
              className="h-4 w-4"
            />
            Repetir automáticamente cada mes
          </label>
          {!autoRepeatIncome && (
            <p className="text-xs text-zinc-500">
              Con esto desactivado, tienes que volver acá a cargar el ingreso manualmente al
              empezar cada mes.
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="timeZone" className="text-sm font-medium">
              Zona horaria
            </label>
            <select
              id="timeZone"
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className={inputClass}
            >
              {timeZoneOptions.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)}
              className="self-start text-xs font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Usar la de mi dispositivo
            </button>
            <p className="text-xs text-zinc-500">
              Define qué es &quot;hoy&quot; y dónde empieza y termina cada mes para ti. Cambiarla no mueve los
              movimientos ya guardados ni los meses ya cerrados.
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {saved && !error && <p className="mt-3 text-sm text-green-700 dark:text-green-400">Cambios guardados.</p>}

        <button onClick={handleSave} disabled={saving} className={`mt-4 ${primaryButtonClass}`}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </section>

      <section>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Cerrar sesión
          </button>
        </form>
      </section>
    </div>
  )
}
