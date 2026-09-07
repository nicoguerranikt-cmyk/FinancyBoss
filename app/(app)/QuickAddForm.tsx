'use client'

// Acceso rápido a registrar gasto/ingreso extra (manual.md sección 9, tab
// Dashboard). Un gasto siempre va al pilar Gasto (manual §5.4: Ahorro e
// Inversión son intocables para el gasto cotidiano). Un ingreso extra el
// usuario elige a mano a qué pilar va (manual §3.2).
//
// Efecto dominó v2 (manual §4.3): después de registrar un gasto puede venir
// un DominoOutcome —
//   Caso 1: informativo + botón opcional "Cubrir con Ahorro" (no bloquea).
//   Caso 2: diálogo obligatorio (el discrecional del mes quedó en negativo,
//   hay que declarar de dónde salió esa plata).

import { useMemo, useState, type FormEvent } from 'react'
import {
  coverWithAhorro,
  registerTransaction,
  resolveDeficit,
  type DominoOutcome,
} from './actions'
import { formatBs } from '@/lib/format'

type PillarName = 'ahorro' | 'gasto' | 'inversion'
type PillarOption = { id: string; name: PillarName }
type CategoryOption = { id: string; pillar_id: string; name: string }

const PILLAR_LABEL: Record<PillarName, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

type ResolveChoice = 'future_days' | 'ahorro' | 'inversion' | 'debt'

export default function QuickAddForm({
  pillars,
  categories,
}: {
  pillars: PillarOption[]
  categories: CategoryOption[]
}) {
  const gastoPillar = pillars.find((p) => p.name === 'gasto')
  const pillarNameById = useMemo(
    () => Object.fromEntries(pillars.map((p) => [p.id, p.name])),
    [pillars]
  )

  const [type, setType] = useState<'expense' | 'extra_income'>('expense')
  const [pillarId, setPillarId] = useState(gastoPillar?.id ?? pillars[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [domino, setDomino] = useState<DominoOutcome | undefined>(undefined)

  // Caso 1 — botón "Cubrir con Ahorro".
  const [covering, setCovering] = useState(false)
  const [covered, setCovered] = useState(false)

  // Caso 2 — diálogo obligatorio.
  const [resolveChoice, setResolveChoice] = useState<ResolveChoice>('future_days')
  const [resolveCategoryId, setResolveCategoryId] = useState('')
  const [debtName, setDebtName] = useState('')
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)

  const effectivePillarId = type === 'expense' ? gastoPillar?.id ?? '' : pillarId

  const categoryOptions = useMemo(
    () => categories.filter((c) => c.pillar_id === effectivePillarId),
    [categories, effectivePillarId]
  )

  const ahorroCategoryOptions = useMemo(
    () => categories.filter((c) => pillarNameById[c.pillar_id] === 'ahorro'),
    [categories, pillarNameById]
  )
  const inversionCategoryOptions = useMemo(
    () => categories.filter((c) => pillarNameById[c.pillar_id] === 'inversion'),
    [categories, pillarNameById]
  )

  function resetDominoState() {
    setDomino(undefined)
    setCovering(false)
    setCovered(false)
    setResolveChoice('future_days')
    setResolveCategoryId('')
    setDebtName('')
    setResolving(false)
    setResolved(false)
    setResolveError(null)
  }

  function handleTypeChange(next: 'expense' | 'extra_income') {
    setType(next)
    setCategoryId('')
    setSuccess(false)
    resetDominoState()
    if (next === 'extra_income' && !pillarId) {
      setPillarId(pillars[0]?.id ?? '')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    resetDominoState()

    const amountNumber = Number(amount)
    if (!(amountNumber > 0)) {
      setError('Ingresá un monto mayor a 0.')
      return
    }
    if (!effectivePillarId) {
      setError('Elegí un pilar.')
      return
    }

    setSubmitting(true)
    const res = await registerTransaction({
      type,
      pillarId: effectivePillarId,
      categoryId: categoryId || null,
      amount: amountNumber,
      description: description.trim() || undefined,
    })
    setSubmitting(false)

    if (res?.error) {
      setError(res.error)
      return
    }

    setAmount('')
    setDescription('')
    setCategoryId('')
    setSuccess(true)
    setDomino(res?.domino)
  }

  async function handleCover() {
    if (domino?.case !== 1) return
    setCovering(true)
    const res = await coverWithAhorro({
      transactionId: domino.transactionId,
      sourceCategoryId: domino.sourceCategoryId,
      amount: domino.amount,
    })
    setCovering(false)
    if (res.error) {
      setResolveError(res.error)
      return
    }
    setCovered(true)
  }

  async function handleResolve() {
    if (domino?.case !== 2) return
    setResolveError(null)

    if ((resolveChoice === 'ahorro' || resolveChoice === 'inversion') && !resolveCategoryId) {
      setResolveError('Elegí una subcategoría.')
      return
    }
    if (resolveChoice === 'debt' && !debtName.trim()) {
      setResolveError('Ingresá quién te prestó la plata.')
      return
    }

    setResolving(true)
    const res = await resolveDeficit({
      choice: resolveChoice,
      transactionId: domino.transactionId,
      sourceCategoryId: domino.sourceCategoryId,
      amount: domino.deficitAmount,
      categoryId: resolveCategoryId || undefined,
      debtName: debtName || undefined,
    })
    setResolving(false)

    if (res.error) {
      setResolveError(res.error)
      return
    }
    setResolved(true)
  }

  function handleUseExtraIncome() {
    if (domino?.case !== 2) return
    setType('extra_income')
    setAmount(String(domino.deficitAmount))
    resetDominoState()
    setSuccess(false)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleTypeChange('expense')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            type === 'expense'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'border border-zinc-300 dark:border-zinc-700'
          }`}
        >
          Gasto
        </button>
        <button
          type="button"
          onClick={() => handleTypeChange('extra_income')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            type === 'extra_income'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'border border-zinc-300 dark:border-zinc-700'
          }`}
        >
          Ingreso extra
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="qa-amount" className="text-sm font-medium">
            Monto (Bs)
          </label>
          <input
            id="qa-amount"
            type="number"
              onWheel={(e) => e.currentTarget.blur()}
            inputMode="numeric"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ej. 50"
            className="rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
          />
        </div>

        {type === 'extra_income' && (
          <div className="flex flex-col gap-1">
            <label htmlFor="qa-pillar" className="text-sm font-medium">
              Pilar
            </label>
            <select
              id="qa-pillar"
              value={pillarId}
              onChange={(e) => {
                setPillarId(e.target.value)
                setCategoryId('')
              }}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none [color-scheme:light] focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark] dark:focus:border-zinc-100"
            >
              {pillars.map((p) => (
                <option key={p.id} value={p.id} className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                  {PILLAR_LABEL[p.name]}
                </option>
              ))}
            </select>
          </div>
        )}

        {categoryOptions.length > 0 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="qa-category" className="text-sm font-medium">
              Categoría (opcional)
            </label>
            <select
              id="qa-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none [color-scheme:light] focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark] dark:focus:border-zinc-100"
            >
              <option value="" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                Sin categoría (va directo al pilar)
              </option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id} className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="qa-description" className="text-sm font-medium">
            Descripción (opcional)
          </label>
          <input
            id="qa-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Almuerzo"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {success && !error && (
        <p className="mt-3 text-sm text-green-700 dark:text-green-400">Movimiento registrado.</p>
      )}

      {/* Caso 1: informativo, no bloquea. */}
      {domino?.case === 1 && (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-950/40">
          <p className="text-sm text-amber-800 dark:text-amber-300">{domino.message}</p>
          {covered ? (
            <p className="mt-2 text-sm text-green-700 dark:text-green-400">Cubierto con tu Ahorro.</p>
          ) : (
            <button
              type="button"
              onClick={handleCover}
              disabled={covering}
              className="mt-2 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
            >
              {covering ? 'Cubriendo…' : 'Cubrir con Ahorro'}
            </button>
          )}
          {resolveError && <p className="mt-2 text-xs text-red-600">{resolveError}</p>}
        </div>
      )}

      {/* Caso 2: el discrecional del mes quedó en negativo — hay que declarar el origen. */}
      {domino?.case === 2 && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
          {resolved ? (
            <p className="text-sm text-green-700 dark:text-green-400">Registrado.</p>
          ) : (
            <>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                Te faltan {formatBs(domino.deficitAmount)} Bs. ¿De dónde salieron?
              </p>

              <div className="mt-2 flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="resolve-choice"
                    checked={resolveChoice === 'future_days'}
                    onChange={() => setResolveChoice('future_days')}
                  />
                  Del presupuesto de los próximos días
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="resolve-choice"
                    checked={resolveChoice === 'ahorro'}
                    onChange={() => setResolveChoice('ahorro')}
                  />
                  De Ahorro
                </label>
                {resolveChoice === 'ahorro' && (
                  <select
                    value={resolveCategoryId}
                    onChange={(e) => setResolveCategoryId(e.target.value)}
                    className="ml-6 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none [color-scheme:light] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark]"
                  >
                    <option value="">Elegí una subcategoría</option>
                    {ahorroCategoryOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="resolve-choice"
                    checked={resolveChoice === 'inversion'}
                    onChange={() => setResolveChoice('inversion')}
                  />
                  De Inversión
                </label>
                {resolveChoice === 'inversion' && (
                  <select
                    value={resolveCategoryId}
                    onChange={(e) => setResolveCategoryId(e.target.value)}
                    className="ml-6 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none [color-scheme:light] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark]"
                  >
                    <option value="">Elegí una subcategoría</option>
                    {inversionCategoryOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="resolve-choice"
                    checked={resolveChoice === 'debt'}
                    onChange={() => setResolveChoice('debt')}
                  />
                  Alguien me lo prestó
                </label>
                {resolveChoice === 'debt' && (
                  <input
                    type="text"
                    value={debtName}
                    onChange={(e) => setDebtName(e.target.value)}
                    placeholder="¿Quién te prestó?"
                    className="ml-6 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
                  />
                )}
              </div>

              {resolveError && <p className="mt-2 text-xs text-red-600">{resolveError}</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleResolve}
                  disabled={resolving}
                  className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-50"
                >
                  {resolving ? 'Guardando…' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  onClick={handleUseExtraIncome}
                  className="text-xs text-red-700 underline dark:text-red-400"
                >
                  Ingreso extra que no registré
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 w-full rounded-lg bg-zinc-900 py-2.5 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {submitting ? 'Guardando…' : 'Registrar'}
      </button>
    </form>
  )
}
