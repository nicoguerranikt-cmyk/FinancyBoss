'use client'

// Más (manual.md v2.0, sección 9): Perfil + Configuración.

import { useState } from 'react'
import { logout } from '@/app/login/actions'
import { updateProfile } from './actions'

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100'
const primaryButtonClass =
  'rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300'

export default function MasClient({
  email,
  name: initialName,
  baseIncome: initialBaseIncome,
  autoRepeatIncome: initialAutoRepeat,
}: {
  email: string
  name: string
  baseIncome: number
  autoRepeatIncome: boolean
}) {
  const [name, setName] = useState(initialName)
  const [baseIncome, setBaseIncome] = useState(String(initialBaseIncome))
  const [autoRepeatIncome, setAutoRepeatIncome] = useState(initialAutoRepeat)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    const res = await updateProfile({
      name,
      baseIncome: Number(baseIncome),
      autoRepeatIncome,
    })
    setSaving(false)
    if (res.error) {
      setError(res.error)
    } else {
      setSaved(true)
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
        </div>
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
              Con esto desactivado, tenés que volver acá a cargar el ingreso manualmente al
              empezar cada mes.
            </p>
          )}
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
