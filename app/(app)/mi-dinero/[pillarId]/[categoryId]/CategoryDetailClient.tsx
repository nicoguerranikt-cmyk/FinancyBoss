'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { PillarName } from '@/lib/dashboard'
import { formatBs } from '@/lib/format'
import type { RecurrenceUnit } from '@/lib/recurrence'
import { suggestedMonthlyContribution } from '@/lib/savingsGoal'
import {
  bumpFixedExpenseThisMonth,
  confirmFixedExpense,
  deleteCategory,
  registerInvestmentReturn,
  registerPastInvestment,
  registerPastSavings,
  updateCategory,
  type UpdateCategoryInput,
} from '../../actions'

type CategoryRow = {
  id: string
  pillar_id: string
  name: string
  fixed_amount: number | null
  auto_repeat: boolean
  fixed_start_date: string | null
  fixed_interval_unit: RecurrenceUnit | null
  fixed_interval_count: number | null
  is_general: boolean
  goal_amount: number | null
  goal_target_date: string | null
}
type HistoryRow = {
  id: string
  amount: number
  type: 'expense' | 'extra_income'
  description: string | null
  date: string
  is_allocation: boolean
}
type Draft = {
  name: string
  fixedAmount: string
  autoRepeat: boolean
  fixedStartDate: string
  fixedIntervalUnit: RecurrenceUnit
  fixedIntervalCount: string
  goalAmount: string
  goalTargetDate: string
}

function draftFromCategory(c: CategoryRow, todayIso: string): Draft {
  return {
    name: c.name,
    fixedAmount: c.fixed_amount === null ? '' : String(c.fixed_amount),
    autoRepeat: c.auto_repeat,
    fixedStartDate: c.fixed_start_date ?? todayIso,
    fixedIntervalUnit: c.fixed_interval_unit ?? 'month',
    fixedIntervalCount: c.fixed_interval_count === null ? '1' : String(c.fixed_interval_count),
    goalAmount: c.goal_amount === null ? '' : String(c.goal_amount),
    goalTargetDate: c.goal_target_date ?? '',
  }
}

// Compara el draft contra los valores guardados y arma el patch con solo lo
// que cambió. Devuelve null si no hay nada que guardar. (Mismo criterio que
// tenía MiDineroClient.tsx antes de mudar esto acá.)
function computeCategoryPatch(
  category: CategoryRow,
  draft: Draft
): { patch: UpdateCategoryInput; error?: string } | null {
  const patch: UpdateCategoryInput = { categoryId: category.id }
  let error: string | undefined

  const name = draft.name.trim()
  if (name !== category.name) patch.name = name

  const originalFixed = category.fixed_amount === null ? '' : String(category.fixed_amount)
  if (draft.fixedAmount.trim() !== originalFixed) {
    const n = draft.fixedAmount.trim() === '' ? null : Number(draft.fixedAmount)
    if (n !== null && (Number.isNaN(n) || !(n >= 0))) {
      error = 'El monto debe ser mayor o igual a 0.'
    } else {
      patch.fixedAmount = n
    }
  }

  // La fecha/frecuencia solo importa mientras "descontar automáticamente"
  // esté prendido — si cambió cualquiera de las dos, o si se prendió el
  // checkbox recién ahora, hay que reenviar el combo completo (el server no
  // guarda un campo suelto sin los otros dos, ver mi-dinero/actions.ts).
  const scheduleChanged =
    draft.fixedStartDate !== (category.fixed_start_date ?? draft.fixedStartDate) ||
    draft.fixedIntervalUnit !== (category.fixed_interval_unit ?? draft.fixedIntervalUnit) ||
    draft.fixedIntervalCount !== (category.fixed_interval_count === null ? draft.fixedIntervalCount : String(category.fixed_interval_count))

  if (draft.autoRepeat !== category.auto_repeat || (draft.autoRepeat && scheduleChanged)) {
    patch.autoRepeat = draft.autoRepeat
    if (draft.autoRepeat) {
      const count = Number(draft.fixedIntervalCount)
      if (!draft.fixedStartDate) {
        error = error ?? 'Elige la fecha del primer descuento.'
      } else if (!(Number.isInteger(count) && count > 0)) {
        error = error ?? 'La frecuencia debe ser un número entero mayor a 0.'
      } else {
        patch.fixedSchedule = {
          startDate: draft.fixedStartDate,
          intervalUnit: draft.fixedIntervalUnit,
          intervalCount: count,
        }
      }
    }
  }

  const originalGoalAmount = category.goal_amount === null ? '' : String(category.goal_amount)
  const originalGoalDate = category.goal_target_date ?? ''
  if (draft.goalAmount.trim() !== originalGoalAmount || draft.goalTargetDate !== originalGoalDate) {
    const amountEmpty = draft.goalAmount.trim() === ''
    const dateEmpty = draft.goalTargetDate.trim() === ''
    if (amountEmpty && dateEmpty) {
      patch.savingsGoal = null
    } else if (amountEmpty || dateEmpty) {
      error = error ?? 'Completa el monto y la fecha de tu meta (o deja los dos vacíos).'
    } else {
      const n = Number(draft.goalAmount)
      if (!(n > 0)) {
        error = error ?? 'La meta de ahorro debe ser mayor a 0.'
      } else {
        patch.savingsGoal = { amount: n, targetDate: draft.goalTargetDate }
      }
    }
  }

  if (!error && Object.keys(patch).length === 1) return null
  return { patch, error }
}

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-brand dark:border-zinc-700 dark:focus:border-brand'
const secondaryButtonClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800'

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-brand text-white dark:text-zinc-950'
          : 'border border-zinc-300 dark:border-zinc-700'
      }`}
    >
      {children}
    </button>
  )
}

export default function CategoryDetailClient({
  pillarName,
  category,
  accumulated,
  history,
  todayIso,
  backHref,
  ahorroCategories,
  pendingFixedConfirmation,
  fixedBudget,
}: {
  pillarName: PillarName
  category: CategoryRow
  accumulated: number
  history: HistoryRow[]
  todayIso: string
  // A dónde volver al borrar (en Gasto, la pantalla de fijos o cotidianos
  // según corresponda — ver [categoryId]/page.tsx).
  backHref: string
  // Retorno de inversión, destino "a Ahorro" (ver [categoryId]/page.tsx), y
  // "Aumentar presupuesto este mes" con fuente "Ahorro" (migración 0031) —
  // las categorías de Ahorro del usuario con su saldo. Vacío cuando no hace
  // falta (ver needsAhorroCategories en el page.tsx).
  ahorroCategories: { id: string; name: string; balance: number }[]
  // true si esta categoría es un gasto fijo con una cuota ya vencida y sin
  // confirmar todavía (ver confirmFixedExpense, mi-dinero/actions.ts).
  pendingFixedConfirmation: boolean
  // Asignado/usado/restante de ESTE MES, solo para gastos fijos de Gasto
  // (null en cualquier otro caso) — ver [categoryId]/page.tsx.
  fixedBudget: {
    assigned: number
    used: number
    remaining: number
    modality: 'pago_unico' | 'consumo_gradual'
    status: 'pendiente' | 'pagado' | 'programado' | 'agotado' | 'disponible'
  } | null
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'consulta' | 'configuracion'>('consulta')

  const [draft, setDraft] = useState<Draft>(() => draftFromCategory(category, todayIso))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [pastSavingsAmount, setPastSavingsAmount] = useState('')
  const [pastSavingsDate, setPastSavingsDate] = useState(todayIso)
  const [pastSavingsSaving, setPastSavingsSaving] = useState(false)
  const [pastSavingsError, setPastSavingsError] = useState<string | null>(null)
  const [pastSavingsSuccess, setPastSavingsSuccess] = useState(false)

  const [pastInvestmentAmount, setPastInvestmentAmount] = useState('')
  const [pastInvestmentDate, setPastInvestmentDate] = useState(todayIso)
  const [pastInvestmentSaving, setPastInvestmentSaving] = useState(false)
  const [pastInvestmentError, setPastInvestmentError] = useState<string | null>(null)
  const [pastInvestmentSuccess, setPastInvestmentSuccess] = useState(false)

  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const [bumpAmount, setBumpAmount] = useState('')
  const [bumpSource, setBumpSource] = useState<'disponible' | 'ahorro'>('disponible')
  const [bumpAhorroCategoryId, setBumpAhorroCategoryId] = useState('')
  const [bumpSaving, setBumpSaving] = useState(false)
  const [bumpError, setBumpError] = useState<string | null>(null)
  const [bumpSuccess, setBumpSuccess] = useState(false)

  const [returnAmount, setReturnAmount] = useState('')
  const [returnDate, setReturnDate] = useState(todayIso)
  const [returnDestination, setReturnDestination] = useState<'free_money' | 'reinvest' | 'ahorro'>('free_money')
  const [returnAhorroCategoryId, setReturnAhorroCategoryId] = useState(ahorroCategories[0]?.id ?? '')
  const [returnSaving, setReturnSaving] = useState(false)
  const [returnError, setReturnError] = useState<string | null>(null)
  const [returnSuccess, setReturnSuccess] = useState(false)

  const dirty = computeCategoryPatch(category, draft) !== null

  function updateDraft(patch: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...patch }))
    setSaved(false)
  }

  function handleFixedAmountChange(value: string) {
    // Sin monto fijo no tiene sentido "descontar automáticamente" — se
    // apaga solo en el borrador (el server hace lo mismo).
    if (value.trim() === '') {
      setDraft((prev) => ({ ...prev, fixedAmount: value, autoRepeat: false }))
      setSaved(false)
    } else {
      updateDraft({ fixedAmount: value })
    }
  }

  async function handleSave() {
    const result = computeCategoryPatch(category, draft)
    if (!result) return
    if (result.error) {
      setError(result.error)
      return
    }
    setError(null)
    setSaved(false)
    setSaving(true)
    const res = await updateCategory(result.patch)
    setSaving(false)
    if (res.error) setError(res.error)
    else setSaved(true)
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await deleteCategory({ categoryId: category.id })
    setDeleting(false)
    if (res.error) {
      setError(res.error)
      setConfirmingDelete(false)
      return
    }
    router.push(backHref)
  }

  async function handleRegisterPastSavings() {
    setPastSavingsError(null)
    setPastSavingsSuccess(false)
    const amountNumber = Number(pastSavingsAmount)
    if (!(amountNumber > 0)) {
      setPastSavingsError('Ingresa un monto mayor a 0.')
      return
    }
    setPastSavingsSaving(true)
    const res = await registerPastSavings({
      categoryId: category.id,
      amount: amountNumber,
      date: pastSavingsDate,
    })
    setPastSavingsSaving(false)
    if (res.error) {
      setPastSavingsError(res.error)
      return
    }
    setPastSavingsAmount('')
    setPastSavingsDate(todayIso)
    setPastSavingsSuccess(true)
  }

  async function handleRegisterPastInvestment() {
    setPastInvestmentError(null)
    setPastInvestmentSuccess(false)
    const amountNumber = Number(pastInvestmentAmount)
    if (!(amountNumber > 0)) {
      setPastInvestmentError('Ingresa un monto mayor a 0.')
      return
    }
    setPastInvestmentSaving(true)
    const res = await registerPastInvestment({
      categoryId: category.id,
      amount: amountNumber,
      date: pastInvestmentDate,
    })
    setPastInvestmentSaving(false)
    if (res.error) {
      setPastInvestmentError(res.error)
      return
    }
    setPastInvestmentAmount('')
    setPastInvestmentDate(todayIso)
    setPastInvestmentSuccess(true)
  }

  async function handleConfirmFixedExpense() {
    setConfirmError(null)
    setConfirming(true)
    const res = await confirmFixedExpense({ categoryId: category.id })
    setConfirming(false)
    if (res.error) {
      setConfirmError(res.error)
      return
    }
    setConfirmed(true)
  }

  async function handleBumpThisMonth() {
    setBumpError(null)
    setBumpSuccess(false)
    const amountNumber = Number(bumpAmount)
    if (!(amountNumber > 0)) {
      setBumpError('Ingresa un monto mayor a 0.')
      return
    }
    if (bumpSource === 'ahorro' && !bumpAhorroCategoryId) {
      setBumpError('Elige de qué ahorro sale la plata.')
      return
    }
    setBumpSaving(true)
    const res = await bumpFixedExpenseThisMonth({
      categoryId: category.id,
      amount: amountNumber,
      source: bumpSource,
      sourceCategoryId: bumpSource === 'ahorro' ? bumpAhorroCategoryId : undefined,
    })
    setBumpSaving(false)
    if (res.error) {
      setBumpError(res.error)
      return
    }
    setBumpAmount('')
    setBumpSuccess(true)
  }

  async function handleRegisterReturn() {
    setReturnError(null)
    setReturnSuccess(false)
    const amountNumber = Number(returnAmount)
    if (!(amountNumber > 0)) {
      setReturnError('Ingresa un monto mayor a 0.')
      return
    }
    if (returnDestination === 'ahorro' && !returnAhorroCategoryId) {
      setReturnError('Elige a qué categoría de Ahorro va.')
      return
    }
    setReturnSaving(true)
    const res = await registerInvestmentReturn({
      sourceCategoryId: category.id,
      amount: amountNumber,
      date: returnDate,
      destination:
        returnDestination === 'ahorro' ? { type: 'ahorro', categoryId: returnAhorroCategoryId } : { type: returnDestination },
    })
    setReturnSaving(false)
    if (res.error) {
      setReturnError(res.error)
      return
    }
    setReturnAmount('')
    setReturnDate(todayIso)
    setReturnSuccess(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        <TabButton active={tab === 'consulta'} onClick={() => setTab('consulta')}>
          Consulta
        </TabButton>
        <TabButton active={tab === 'configuracion'} onClick={() => setTab('configuracion')}>
          Configuración
        </TabButton>
      </div>

      {tab === 'consulta' ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-sm text-zinc-500">Acumulado histórico</p>
            <p className="text-2xl font-semibold tracking-tight">{formatBs(accumulated)} Bs</p>
          </div>

          {fixedBudget && (
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Este mes</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    fixedBudget.status === 'agotado' || fixedBudget.status === 'pendiente'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                  }`}
                >
                  {
                    {
                      pendiente: 'Pendiente de confirmar',
                      pagado: 'Pagado',
                      programado: 'Programado',
                      agotado: 'Presupuesto agotado',
                      disponible: 'Disponible',
                    }[fixedBudget.status]
                  }
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {fixedBudget.modality === 'pago_unico'
                  ? 'Pago único mensual (tiene fecha y frecuencia configuradas).'
                  : 'Consumo gradual (lo vas registrando de a poco, sin fecha fija).'}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
                  <p className="text-xs text-zinc-500">Asignado</p>
                  <p className="text-sm font-medium tabular-nums">{formatBs(fixedBudget.assigned)} Bs</p>
                </div>
                <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
                  <p className="text-xs text-zinc-500">Usado</p>
                  <p className="text-sm font-medium tabular-nums">{formatBs(fixedBudget.used)} Bs</p>
                </div>
                <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
                  <p className="text-xs text-zinc-500">Restante</p>
                  <p className="text-sm font-medium tabular-nums">{formatBs(Math.max(0, fixedBudget.remaining))} Bs</p>
                </div>
              </div>
            </div>
          )}

          {pillarName === 'gasto' && pendingFixedConfirmation && !confirmed && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Hoy corresponde pagar {category.name} por {formatBs(category.fixed_amount ?? 0)} Bs. ¿Ya lo pagaste?
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                Esto solo registra el pago en el historial — esa plata ya estaba separada de tu
                ingreso desde que configuraste el monto fijo, no se vuelve a descontar de nada.
              </p>
              <button
                onClick={handleConfirmFixedExpense}
                disabled={confirming}
                className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-800 disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
              >
                {confirming ? 'Guardando…' : 'Ya lo pagué'}
              </button>
              {confirmError && (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {confirmError}
                </p>
              )}
            </div>
          )}
          {confirmed && (
            <p className="text-sm text-green-700 dark:text-green-400">Pago registrado.</p>
          )}

          {pillarName === 'gasto' && category.fixed_amount !== null && (
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-sm font-medium">Aumentar presupuesto este mes</p>
              <p className="mt-1 text-xs text-zinc-500">
                Para cuando este gasto fijo te sale más caro un mes puntual — no cambia el monto
                fijo, el mes que viene vuelve a ser {formatBs(category.fixed_amount)} Bs.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  step="any"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  value={bumpAmount}
                  onChange={(e) => {
                    setBumpAmount(e.target.value)
                    setBumpSuccess(false)
                  }}
                  placeholder="Monto extra (Bs)"
                  className={`${inputClass} w-32`}
                />
              </div>

              <p className="mt-3 text-xs font-medium text-zinc-500">¿De dónde sale esa plata?</p>
              <div className="mt-1 flex flex-col gap-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={bumpSource === 'disponible'}
                    onChange={() => {
                      setBumpSource('disponible')
                      setBumpSuccess(false)
                    }}
                    className="h-4 w-4"
                  />
                  Disponible general (Dinero libre)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={bumpSource === 'ahorro'}
                    disabled={ahorroCategories.length === 0}
                    onChange={() => {
                      setBumpSource('ahorro')
                      setBumpSuccess(false)
                    }}
                    className="h-4 w-4"
                  />
                  Un ahorro puntual
                </label>
              </div>
              {bumpSource === 'ahorro' && (
                <select
                  value={bumpAhorroCategoryId}
                  onChange={(e) => {
                    setBumpAhorroCategoryId(e.target.value)
                    setBumpSuccess(false)
                  }}
                  className={`${inputClass} mt-2 w-full`}
                >
                  <option value="">Elige de qué ahorro</option>
                  {ahorroCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({formatBs(c.balance)} Bs disponibles)
                    </option>
                  ))}
                </select>
              )}
              {ahorroCategories.length === 0 && bumpSource === 'ahorro' && (
                <p className="mt-1 text-xs text-zinc-500">Todavía no tienes categorías de Ahorro.</p>
              )}

              <button
                onClick={handleBumpThisMonth}
                disabled={bumpSaving}
                className={`${secondaryButtonClass} mt-3`}
              >
                {bumpSaving ? 'Guardando…' : 'Aumentar'}
              </button>

              {bumpError && (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {bumpError}
                </p>
              )}
              {bumpSuccess && !bumpError && (
                <p className="mt-2 text-sm text-green-700 dark:text-green-400">Registrado.</p>
              )}
            </div>
          )}

          {pillarName === 'ahorro' && category.goal_amount !== null && category.goal_target_date && (
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-sm text-zinc-500">
                Meta: {formatBs(category.goal_amount)} Bs para el {category.goal_target_date}
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full bg-brand"
                  style={{
                    width: `${Math.min(100, Math.max(0, (accumulated / category.goal_amount) * 100))}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-sm">
                {accumulated >= category.goal_amount
                  ? '¡Ya llegaste a tu meta!'
                  : `Te conviene aportar ~${formatBs(
                      suggestedMonthlyContribution(category.goal_amount, accumulated, category.goal_target_date, todayIso)
                    )} Bs por mes para llegar a tiempo.`}
              </p>
            </div>
          )}

          {pillarName === 'ahorro' && (
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-sm font-medium">Registrar ahorro previo</p>
              <p className="mt-1 text-xs text-zinc-500">
                Plata que ya tenías ahorrada acá antes de usar la app — suma al acumulado y a tu progreso.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  step="any"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  value={pastSavingsAmount}
                  onChange={(e) => {
                    setPastSavingsAmount(e.target.value)
                    setPastSavingsSuccess(false)
                  }}
                  placeholder="Monto (Bs)"
                  className={`${inputClass} w-28`}
                />
                <input
                  type="date"
                  value={pastSavingsDate}
                  onChange={(e) => {
                    setPastSavingsDate(e.target.value)
                    setPastSavingsSuccess(false)
                  }}
                  className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`}
                />
                <button
                  onClick={handleRegisterPastSavings}
                  disabled={pastSavingsSaving}
                  className={secondaryButtonClass}
                >
                  {pastSavingsSaving ? 'Guardando…' : 'Registrar'}
                </button>
              </div>
              {pastSavingsError && (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {pastSavingsError}
                </p>
              )}
              {pastSavingsSuccess && !pastSavingsError && (
                <p className="mt-2 text-sm text-green-700 dark:text-green-400">Registrado.</p>
              )}
            </div>
          )}

          {pillarName === 'inversion' && !category.is_general && (
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-sm font-medium">Registrar monto ya invertido</p>
              <p className="mt-1 text-xs text-zinc-500">
                Capital que ya tenías puesto acá antes de usar la app — suma al acumulado.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  step="any"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  value={pastInvestmentAmount}
                  onChange={(e) => {
                    setPastInvestmentAmount(e.target.value)
                    setPastInvestmentSuccess(false)
                  }}
                  placeholder="Monto (Bs)"
                  className={`${inputClass} w-28`}
                />
                <input
                  type="date"
                  value={pastInvestmentDate}
                  onChange={(e) => {
                    setPastInvestmentDate(e.target.value)
                    setPastInvestmentSuccess(false)
                  }}
                  className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`}
                />
                <button
                  onClick={handleRegisterPastInvestment}
                  disabled={pastInvestmentSaving}
                  className={secondaryButtonClass}
                >
                  {pastInvestmentSaving ? 'Guardando…' : 'Registrar'}
                </button>
              </div>
              {pastInvestmentError && (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {pastInvestmentError}
                </p>
              )}
              {pastInvestmentSuccess && !pastInvestmentError && (
                <p className="mt-2 text-sm text-green-700 dark:text-green-400">Registrado.</p>
              )}
            </div>
          )}

          {pillarName === 'inversion' && !category.is_general && (
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-sm font-medium">Registrar retorno</p>
              <p className="mt-1 text-xs text-zinc-500">
                La ganancia de esta inversión — elige a dónde va.
              </p>

              <div className="mt-3 flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="return-destination"
                    checked={returnDestination === 'free_money'}
                    onChange={() => {
                      setReturnDestination('free_money')
                      setReturnSuccess(false)
                    }}
                  />
                  A Dinero libre
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="return-destination"
                    checked={returnDestination === 'reinvest'}
                    onChange={() => {
                      setReturnDestination('reinvest')
                      setReturnSuccess(false)
                    }}
                  />
                  Reinvertir acá (aumenta el capital de esta inversión)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="return-destination"
                    checked={returnDestination === 'ahorro'}
                    disabled={ahorroCategories.length === 0}
                    onChange={() => {
                      setReturnDestination('ahorro')
                      setReturnSuccess(false)
                    }}
                  />
                  A una categoría de Ahorro
                </label>
                {returnDestination === 'ahorro' && (
                  <select
                    value={returnAhorroCategoryId}
                    onChange={(e) => setReturnAhorroCategoryId(e.target.value)}
                    className={`${inputClass} ml-6 [color-scheme:light] dark:[color-scheme:dark]`}
                  >
                    {ahorroCategories.map((c) => (
                      <option key={c.id} value={c.id} className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  step="any"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  value={returnAmount}
                  onChange={(e) => {
                    setReturnAmount(e.target.value)
                    setReturnSuccess(false)
                  }}
                  placeholder="Monto (Bs)"
                  className={`${inputClass} w-28`}
                />
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => {
                    setReturnDate(e.target.value)
                    setReturnSuccess(false)
                  }}
                  className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`}
                />
                <button onClick={handleRegisterReturn} disabled={returnSaving} className={secondaryButtonClass}>
                  {returnSaving ? 'Guardando…' : 'Registrar'}
                </button>
              </div>
              {returnError && (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {returnError}
                </p>
              )}
              {returnSuccess && !returnError && (
                <p className="mt-2 text-sm text-green-700 dark:text-green-400">Registrado.</p>
              )}
            </div>
          )}

          <div>
            <h2 className="text-sm font-medium text-zinc-500">Historial</h2>
            {history.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">Todavía no hay movimientos registrados acá.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {history.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                  >
                    <div>
                      <p className="text-sm">
                        {t.description ||
                          (t.is_allocation
                            ? 'Reparto mensual'
                            : t.type === 'extra_income'
                              ? 'Ingreso extra'
                              : 'Sin descripción')}
                      </p>
                      <p className="text-xs text-zinc-500">{t.date}</p>
                    </div>
                    <p
                      className={`text-sm font-medium ${
                        t.amount >= 0
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {t.amount >= 0 ? '+' : ''}
                      {formatBs(t.amount)} Bs
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          {category.is_general && (
            <p className="mb-2 text-sm text-zinc-500">
              Esta es la categoría general de {pillarName === 'gasto' ? 'Gasto' : pillarName === 'ahorro' ? 'Ahorro' : 'Inversión'} — recibe automáticamente lo que no tenga un monto asignado a otra categoría en el reparto mensual. No se puede borrar ni asignarle un monto propio.
            </p>
          )}
          <input
            type="text"
            value={draft.name}
            onChange={(e) => updateDraft({ name: e.target.value })}
            className={`${inputClass} w-full`}
          />

          {pillarName === 'gasto' && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <label className="text-sm text-zinc-500">Monto fijo (Bs)</label>
                <input
                  type="number"
                  step="any"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  placeholder="—"
                  value={draft.fixedAmount}
                  onChange={(e) => handleFixedAmountChange(e.target.value)}
                  className={`${inputClass} w-24 text-right`}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.autoRepeat}
                  disabled={draft.fixedAmount.trim() === ''}
                  onChange={(e) => updateDraft({ autoRepeat: e.target.checked })}
                  className="h-4 w-4"
                />
                Descontar automáticamente
              </label>

              {draft.autoRepeat && (
                <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500">Primera vez que se descuenta</label>
                    <input
                      type="date"
                      value={draft.fixedStartDate}
                      onChange={(e) => updateDraft({ fixedStartDate: e.target.value })}
                      className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-500">Repetir cada</span>
                    <input
                      type="number"
                      onWheel={(e) => e.currentTarget.blur()}
                      min={1}
                      value={draft.fixedIntervalCount}
                      onChange={(e) => updateDraft({ fixedIntervalCount: e.target.value })}
                      className={`${inputClass} w-16 text-right`}
                    />
                    <select
                      value={draft.fixedIntervalUnit}
                      onChange={(e) => updateDraft({ fixedIntervalUnit: e.target.value as RecurrenceUnit })}
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
                  <p className="pt-1 text-xs text-zinc-500">
                    Cuando llegue la fecha te avisamos y tú confirmas con &quot;Ya lo pagué&quot;. Nunca se
                    descuenta solo.
                  </p>
                </div>
              )}
            </div>
          )}

          {!category.is_general && pillarName !== 'gasto' && (
            <div className="mt-3 flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <label className="text-sm text-zinc-500">Monto mensual (Bs)</label>
                <input
                  type="number"
                  step="any"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  placeholder="—"
                  value={draft.fixedAmount}
                  onChange={(e) => handleFixedAmountChange(e.target.value)}
                  className={`${inputClass} w-24 text-right`}
                />
              </div>
              <p className="text-xs text-zinc-500">
                Es el aporte que le llega cada mes del reparto de {pillarName === 'ahorro' ? 'Ahorro' : 'Inversión'}
                — no el total que ya {pillarName === 'ahorro' ? 'ahorraste' : 'invertiste'}. Para cargar eso, usa
                &quot;{pillarName === 'ahorro' ? 'Registrar ahorro previo' : 'Registrar monto ya invertido'}&quot; en Consulta.
              </p>
            </div>
          )}

          {pillarName === 'ahorro' && (
            <div className="mt-3 flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-sm font-medium">Meta de ahorro (opcional)</p>
              <div className="flex items-center gap-1">
                <label className="text-sm text-zinc-500">Monto</label>
                <input
                  type="number"
                  step="any"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  placeholder="—"
                  value={draft.goalAmount}
                  onChange={(e) => updateDraft({ goalAmount: e.target.value })}
                  className={`${inputClass} w-24 text-right`}
                />
                <span className="text-sm text-zinc-500">Bs</span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Fecha objetivo</label>
                <input
                  type="date"
                  value={draft.goalTargetDate}
                  onChange={(e) => updateDraft({ goalTargetDate: e.target.value })}
                  className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`}
                />
              </div>
              {draft.goalAmount.trim() !== '' && draft.goalTargetDate.trim() !== '' && (
                <p className="text-xs text-zinc-500">
                  Aporte mensual sugerido: ~
                  {formatBs(
                    suggestedMonthlyContribution(Number(draft.goalAmount), accumulated, draft.goalTargetDate, todayIso)
                  )}{' '}
                  Bs/mes.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          {saved && !error && (
            <p className="mt-2 text-sm text-green-700 dark:text-green-400">Cambios guardados.</p>
          )}

          {category.is_general ? (
            <div className="mt-3 flex items-center gap-3">
              <button onClick={handleSave} disabled={!dirty || saving} className={secondaryButtonClass}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          ) : confirmingDelete ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-sm text-zinc-500">
                ¿Eliminar &quot;{category.name}&quot;? Las transacciones ya registradas se conservan.
              </p>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-40"
              >
                Sí, eliminar
              </button>
              <button onClick={() => setConfirmingDelete(false)} className={secondaryButtonClass}>
                Cancelar
              </button>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <button onClick={handleSave} disabled={!dirty || saving} className={secondaryButtonClass}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                className="text-sm font-medium text-red-600 hover:text-red-700"
              >
                Eliminar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
