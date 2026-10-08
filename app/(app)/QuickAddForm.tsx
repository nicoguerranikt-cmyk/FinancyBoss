'use client'

// Acceso rápido a registrar un gasto del día a día o un ingreso extra (manual
// sección 9, tab Dashboard).
//
// Gasto del día a día (migración 0041): no tiene presupuesto propio y no baja
// el saldo de Gasto — la plata sale de Dinero libre o de una categoría de
// Ahorro, a elección del usuario en cada gasto. Si el origen no alcanza, se
// rechaza con un aviso.
//
// Ingreso extra (manual §3.2): el usuario elige a mano a qué pilar o categoría
// va. Nunca a Gasto (Gasto son solo los gastos fijos).

import { useMemo, useState, type FormEvent } from 'react'
import { registerDailyExpense, registerExtraIncome } from './actions'
import { registerFreeMoneyMovement } from './mi-dinero/libre/actions'
import { formatBs } from '@/lib/format'

type PillarName = 'ahorro' | 'gasto' | 'inversion'
type PillarOption = { id: string; name: PillarName }
type CategoryOption = {
  id: string
  pillar_id: string
  name: string
  fixed_amount: number | null
  is_general: boolean
}

const PILLAR_LABEL: Record<PillarName, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

// Sentinel de UI (nunca se manda al servidor como id): Dinero libre no es un
// pilar de verdad, no tiene id en la tabla pillars.
const FREE_MONEY_TARGET = 'libre' as const

const selectClass =
  'rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none [color-scheme:light] focus:border-brand dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark] dark:focus:border-brand'
const optionClass = 'bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100'

export default function QuickAddForm({
  pillars,
  categories,
  freeMoneyTotal,
}: {
  pillars: PillarOption[]
  categories: CategoryOption[]
  // Dinero libre disponible ahora (lo que se muestra en el Dashboard).
  freeMoneyTotal: number
}) {
  const pillarNameById = useMemo(
    () => Object.fromEntries(pillars.map((p) => [p.id, p.name])),
    [pillars]
  )
  const gastoPillarId = pillars.find((p) => p.name === 'gasto')?.id

  // Categorías del día a día: las de Gasto SIN monto (las que tienen monto son
  // gastos fijos, que se pagan desde Mi Dinero) y que no son la "general".
  const dailyCategories = useMemo(
    () =>
      categories.filter((c) => c.pillar_id === gastoPillarId && c.fixed_amount === null && !c.is_general),
    [categories, gastoPillarId]
  )
  const ahorroCategories = useMemo(
    () => categories.filter((c) => pillarNameById[c.pillar_id] === 'ahorro' && !c.is_general),
    [categories, pillarNameById]
  )

  // Ingreso extra NUNCA va a Gasto: el default es el primer pilar que no sea Gasto.
  const nonGastoPillars = useMemo(() => pillars.filter((p) => p.name !== 'gasto'), [pillars])

  const [type, setType] = useState<'expense' | 'extra_income'>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')

  // Gasto del día a día.
  const [dailyCategoryId, setDailyCategoryId] = useState('')
  const [source, setSource] = useState<'libre' | 'ahorro'>('libre')
  const [sourceCategoryId, setSourceCategoryId] = useState('')

  // Ingreso extra: id de un pilar real (nunca Gasto), o el sentinel FREE_MONEY_TARGET.
  const [pillarId, setPillarId] = useState<string>(nonGastoPillars[0]?.id ?? '')
  const [incomeCategoryId, setIncomeCategoryId] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const isFreeMoneyIncome = pillarId === FREE_MONEY_TARGET
  const incomeCategoryOptions = useMemo(
    () => (isFreeMoneyIncome ? [] : categories.filter((c) => c.pillar_id === pillarId && !c.is_general)),
    [categories, pillarId, isFreeMoneyIncome]
  )

  function handleTypeChange(next: 'expense' | 'extra_income') {
    setType(next)
    setError(null)
    setSuccess(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const amountNumber = Number(amount)
    if (!(amountNumber > 0)) {
      setError('Ingresa un monto mayor a 0.')
      return
    }

    if (type === 'expense' && source === 'ahorro' && !sourceCategoryId) {
      setError('Elige de qué categoría de Ahorro sale.')
      return
    }
    if (type === 'extra_income' && !pillarId) {
      setError('Elige un pilar.')
      return
    }

    setSubmitting(true)
    try {
      let res: { error?: string }
      if (type === 'expense') {
        res = await registerDailyExpense({
          categoryId: dailyCategoryId || null,
          amount: amountNumber,
          description: description.trim() || undefined,
          source,
          sourceCategoryId: source === 'ahorro' ? sourceCategoryId : null,
        })
      } else if (isFreeMoneyIncome) {
        // Dinero libre no es un pilar: el ingreso va a free_money_transactions.
        res = await registerFreeMoneyMovement({
          type: 'ingreso',
          amount: amountNumber,
          description: description.trim() || undefined,
        })
      } else {
        res = await registerExtraIncome({
          pillarId,
          categoryId: incomeCategoryId || null,
          amount: amountNumber,
          description: description.trim() || undefined,
        })
      }

      if (res.error) {
        setError(res.error)
        return
      }
      setAmount('')
      setDescription('')
      setDailyCategoryId('')
      setIncomeCategoryId('')
      setSuccess(true)
    } catch {
      setError('No pudimos guardar el movimiento. Revisa tu conexión y prueba de nuevo.')
    } finally {
      setSubmitting(false)
    }
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
              ? 'bg-brand text-white dark:text-zinc-950'
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
              ? 'bg-brand text-white dark:text-zinc-950'
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
            step="any"
            onWheel={(e) => e.currentTarget.blur()}
            inputMode="decimal"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ej. 50"
            className="rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-brand dark:border-zinc-700 dark:focus:border-brand"
          />
        </div>

        {type === 'expense' && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="qa-daily-category" className="text-sm font-medium">
                Categoría (opcional)
              </label>
              <select
                id="qa-daily-category"
                value={dailyCategoryId}
                onChange={(e) => setDailyCategoryId(e.target.value)}
                className={selectClass}
              >
                <option value="" className={optionClass}>
                  Sin categoría
                </option>
                {dailyCategories.map((c) => (
                  <option key={c.id} value={c.id} className={optionClass}>
                    {c.name}
                  </option>
                ))}
              </select>
              {dailyCategories.length === 0 && (
                <p className="text-xs text-zinc-500">
                  Todavía no tienes categorías del día a día. Puedes crearlas en Mi Dinero → Gasto.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="qa-source" className="text-sm font-medium">
                Sale de
              </label>
              <select
                id="qa-source"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value as 'libre' | 'ahorro')
                  setSourceCategoryId('')
                }}
                className={selectClass}
              >
                <option value="libre" className={optionClass}>
                  Dinero libre
                </option>
                <option value="ahorro" className={optionClass}>
                  Ahorro
                </option>
              </select>
              {source === 'libre' ? (
                <p className="text-xs text-zinc-500">Te quedan {formatBs(freeMoneyTotal)} Bs de Dinero libre.</p>
              ) : (
                <select
                  aria-label="Categoría de Ahorro de la que sale"
                  value={sourceCategoryId}
                  onChange={(e) => setSourceCategoryId(e.target.value)}
                  className={`mt-1 ${selectClass}`}
                >
                  <option value="" className={optionClass}>
                    Elige una categoría de Ahorro
                  </option>
                  {ahorroCategories.map((c) => (
                    <option key={c.id} value={c.id} className={optionClass}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </>
        )}

        {type === 'extra_income' && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="qa-pillar" className="text-sm font-medium">
                Pilar
              </label>
              <select
                id="qa-pillar"
                value={pillarId}
                onChange={(e) => {
                  setPillarId(e.target.value)
                  setIncomeCategoryId('')
                }}
                className={selectClass}
              >
                {nonGastoPillars.map((p) => (
                  <option key={p.id} value={p.id} className={optionClass}>
                    {PILLAR_LABEL[p.name]}
                  </option>
                ))}
                <option value={FREE_MONEY_TARGET} className={optionClass}>
                  Dinero libre
                </option>
              </select>
              <p className="text-xs text-zinc-500">
                Gasto no puede recibir ingresos: son solo tus gastos fijos. Si necesitas más plata para
                un gasto fijo este mes, aumenta su presupuesto desde esa categoría.
              </p>
            </div>

            {incomeCategoryOptions.length > 0 && (
              <div className="flex flex-col gap-1">
                <label htmlFor="qa-category" className="text-sm font-medium">
                  Categoría (opcional)
                </label>
                <select
                  id="qa-category"
                  value={incomeCategoryId}
                  onChange={(e) => setIncomeCategoryId(e.target.value)}
                  className={selectClass}
                >
                  <option value="" className={optionClass}>
                    Sin categoría (va directo al pilar)
                  </option>
                  {incomeCategoryOptions.map((c) => (
                    <option key={c.id} value={c.id} className={optionClass}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
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
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brand dark:border-zinc-700 dark:focus:border-brand"
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

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 w-full rounded-lg bg-brand py-2.5 font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50 dark:text-zinc-950"
      >
        {submitting ? 'Guardando…' : 'Registrar'}
      </button>
    </form>
  )
}
