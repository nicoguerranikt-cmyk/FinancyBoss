'use client'

// Wizard de onboarding: 5 pasos en una sola página. El estado vive en el
// navegador y NADA se guarda en la base hasta el último paso ("Ir al dashboard"),
// que llama a la Server Action completeOnboarding. Migración 0030: ya no se
// pide un monto único por pilar — hay una pantalla POR pilar (Ahorro, Gasto,
// Inversión) donde se arman sus categorías, cada una con su monto opcional;
// el monto del pilar sale de sumar el de sus categorías.

import { useState } from 'react'
import { formatBs } from '@/lib/format'
import { completeOnboarding, type PillarKey } from './actions'

// Subcategorías sugeridas por pilar (tabla del manual, sección 1.2, pantalla 3).
// En Gasto las sugeridas son GASTOS FIJOS (llevan monto). Los gastos del día a
// día van aparte (SUGGESTED_DAILY) y nunca llevan monto: solo sirven para
// registrar en qué se gasta.
const SUGGESTED: Record<PillarKey, string[]> = {
  ahorro: ['Fondo de emergencia', 'Viajes', 'Meta específica', 'Imprevistos'],
  gasto: ['Alquiler', 'Servicios básicos', 'Internet', 'Suscripciones'],
  inversion: ['Proyecto personal', 'Educación', 'Otro'],
}
const SUGGESTED_DAILY = ['Comida', 'Transporte', 'Ocio']

const PILLAR_LABEL: Record<PillarKey, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

// daily: categoría de gasto del día a día (solo en Gasto) — nunca lleva monto.
type CatItem = { name: string; checked: boolean; amount: string; daily?: boolean }

// Sin marcar por default: si el usuario no toca nada acá, termina con solo
// las 3 categorías "general" (las crea complete_onboarding() aparte,
// siempre) — cualquier otra categoría tiene que ser una elección a
// propósito, nunca algo que "vino solo" por pasar rápido este paso.
function initialCats(): Record<PillarKey, CatItem[]> {
  return {
    ahorro: SUGGESTED.ahorro.map((name) => ({ name, checked: false, amount: '' })),
    gasto: [
      ...SUGGESTED.gasto.map((name) => ({ name, checked: false, amount: '' })),
      ...SUGGESTED_DAILY.map((name) => ({ name, checked: false, amount: '', daily: true })),
    ],
    inversion: SUGGESTED.inversion.map((name) => ({ name, checked: false, amount: '' })),
  }
}

const PILLAR_KEYS: PillarKey[] = ['ahorro', 'gasto', 'inversion']
const DINERO_LIBRE_STEP = 2 + PILLAR_KEYS.length // paso final, después del último pilar
const TOTAL_STEPS = DINERO_LIBRE_STEP + 1 // bienvenida + ingreso + 1 por pilar + dinero libre

export default function OnboardingWizard({ userName }: { userName: string }) {
  const [step, setStep] = useState(0)

  // Paso 1 — ingreso
  const [income, setIncome] = useState('')
  const [autoRepeat, setAutoRepeat] = useState(true)

  // Pasos 2-4 — una pantalla por pilar: categorías + monto opcional de cada una.
  const [cats, setCats] = useState<Record<PillarKey, CatItem[]>>(initialCats)
  const [newCat, setNewCat] = useState<Record<PillarKey, string>>({
    ahorro: '',
    gasto: '',
    inversion: '',
  })
  const [newAmount, setNewAmount] = useState<Record<PillarKey, string>>({
    ahorro: '',
    gasto: '',
    inversion: '',
  })

  // Gasto: cuánto de tu ingreso se descuenta cada mes para Gasto. Los gastos
  // fijos salen de ahí; lo que queda es el dinero para el día a día.
  const [gastoAmount, setGastoAmount] = useState('')
  const [newDaily, setNewDaily] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const incomeNumber = Number(income) || 0
  const canContinueIncome = incomeNumber > 0

  // Gastos fijos de Gasto: las categorías marcadas que NO son del día a día.
  const gastoFixedTotal = cats.gasto
    .filter((c) => c.checked && !c.daily)
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
  const gastoAmountNumber = Number(gastoAmount) || 0
  // Si no escribes el monto de Gasto, es la suma de tus gastos fijos.
  const gastoPillarAmount = gastoAmountNumber > 0 ? gastoAmountNumber : gastoFixedTotal
  const gastoDailyPool = gastoPillarAmount - gastoFixedTotal
  const gastoCoversFixed = gastoPillarAmount >= gastoFixedTotal

  function pillarTotal(pillar: PillarKey) {
    if (pillar === 'gasto') return gastoPillarAmount
    return cats[pillar]
      .filter((c) => c.checked)
      .reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
  }

  const totalAllocated = PILLAR_KEYS.reduce((sum, p) => sum + pillarTotal(p), 0)
  const freeMoney = Math.max(0, incomeNumber - totalAllocated)
  const canContinueAllocation = totalAllocated <= incomeNumber

  // Vista previa de "Dinero libre" repartido en lo que queda del mes, mismo
  // cálculo que app/(app)/mi-dinero/libre/page.tsx (ahí sí usa el día de
  // Bolivia; acá alcanza con la fecha local para ilustrar el concepto).
  const previewNow = new Date()
  const previewDaysInMonth = new Date(previewNow.getFullYear(), previewNow.getMonth() + 1, 0).getDate()
  const previewDaysRemaining = Math.max(1, previewDaysInMonth - previewNow.getDate() + 1)
  const previewWeeksRemaining = Math.max(1, Math.ceil(previewDaysRemaining / 7))
  const previewBiweeksRemaining = Math.max(1, Math.ceil(previewDaysRemaining / 14))

  function toggleCat(pillar: PillarKey, index: number) {
    setCats((prev) => {
      const copy = { ...prev, [pillar]: [...prev[pillar]] }
      copy[pillar][index] = {
        ...copy[pillar][index],
        checked: !copy[pillar][index].checked,
      }
      return copy
    })
  }

  function setCatAmount(pillar: PillarKey, index: number, value: string) {
    // Sin redondear: el usuario puede escribir centavos (12.50). Solo se
    // evita un monto negativo.
    const amount = value === '' ? '' : Number(value) < 0 ? '0' : value
    setCats((prev) => {
      const copy = { ...prev, [pillar]: [...prev[pillar]] }
      copy[pillar][index] = { ...copy[pillar][index], amount }
      return copy
    })
  }

  function addCat(pillar: PillarKey) {
    const name = newCat[pillar].trim()
    if (!name) return
    const amount = newAmount[pillar].trim()
    setCats((prev) => ({
      ...prev,
      [pillar]: [...prev[pillar], { name, checked: true, amount }],
    }))
    setNewCat((prev) => ({ ...prev, [pillar]: '' }))
    setNewAmount((prev) => ({ ...prev, [pillar]: '' }))
  }

  function addDaily() {
    const name = newDaily.trim()
    if (!name) return
    setCats((prev) => ({ ...prev, gasto: [...prev.gasto, { name, checked: true, amount: '', daily: true }] }))
    setNewDaily('')
  }

  async function handleFinish() {
    setError(null)
    setSubmitting(true)
    const categories = PILLAR_KEYS.flatMap((pillar) =>
      cats[pillar]
        .filter((c) => c.checked)
        // Un gasto del día a día nunca lleva monto.
        .map((c) => ({ pillar, name: c.name, amount: c.daily ? undefined : Number(c.amount) || undefined }))
    )
    const res = await completeOnboarding({
      income: incomeNumber,
      autoRepeat,
      categories,
      gastoAmount: gastoAmountNumber > 0 ? gastoAmountNumber : undefined,
      // La zona horaria del dispositivo: define qué es "hoy" y dónde termina
      // cada mes para este usuario.
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    // Si hubo éxito, completeOnboarding redirige y no llegamos acá.
    if (res?.error) {
      setError(res.error)
      setSubmitting(false)
    }
  }

  const pillarStepIndex = step - 2 // 0, 1, 2 dentro de PILLAR_KEYS, solo válido en pasos 2-4
  const pillar = PILLAR_KEYS[pillarStepIndex]

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Indicador de progreso */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i).map((i) => (
            <span
              key={i}
              className={`h-1.5 w-8 rounded-full transition-colors ${
                i <= step ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-200 dark:bg-zinc-800'
              }`}
            />
          ))}
        </div>

        {/* ---------- Paso 0: Bienvenida ---------- */}
        {step === 0 && (
          <section className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {userName ? `Hola, ${userName}` : 'Bienvenido a FinancyBoss'}
            </h1>
            <p className="mt-2 text-sm text-zinc-500">Así funciona, en 3 ideas:</p>
            <ul className="mt-6 flex flex-col gap-4 text-left">
              <li className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                Tu plata se divide en <strong>3 pilares</strong>: Ahorro, Gasto e Inversión.
              </li>
              <li className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <strong>Tú decides</strong> cuánta plata va a cada categoría dentro de cada pilar.
              </li>
              <li className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                Cuando te excedas en algo, te decimos <strong>exactamente qué meta</strong> estás sacrificando.
              </li>
            </ul>
            <p className="mt-4 text-xs text-zinc-500">
              Más adelante también vas a poder ahorrar en dólares (con conversión manual a
              bolivianos) y mover tu dinero libre a cualquier categoría cuando quieras.
            </p>
            <button
              onClick={() => setStep(1)}
              className="mt-8 w-full rounded-lg bg-zinc-900 py-2.5 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Empecemos
            </button>
          </section>
        )}

        {/* ---------- Paso 1: Ingreso mensual ---------- */}
        {step === 1 && (
          <section>
            <h2 className="text-xl font-semibold tracking-tight">Tu ingreso mensual</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Este es el dinero con el que trabajaremos cada mes. Puedes ajustarlo cuando quieras.
            </p>

            <div className="mt-6 flex flex-col gap-1">
              <label htmlFor="income" className="text-sm font-medium">
                Ingreso mensual base (Bs)
              </label>
              <input
                id="income"
                type="number"
                step="any"
                onWheel={(e) => e.currentTarget.blur()}
                inputMode="decimal"
                min={0}
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                placeholder="Ej. 3000"
                className="rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
              />
            </div>

            <label className="mt-4 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={autoRepeat}
                onChange={(e) => setAutoRepeat(e.target.checked)}
                className="h-4 w-4"
              />
              Repetir automáticamente cada mes
            </label>

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setStep(0)}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Atrás
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!canContinueIncome}
                className="flex-1 rounded-lg bg-zinc-900 py-2.5 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Continuar
              </button>
            </div>
          </section>
        )}

        {/* ---------- Paso de Gasto: monto del pilar + fijos con monto + día a día sin monto ---------- */}
        {pillar === 'gasto' && (
          <section>
            <h2 className="text-xl font-semibold tracking-tight">Gastos fijos</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Define cuánto de tu ingreso se descuenta cada mes para Gasto. Dentro de ese monto,
              agrega tus gastos fijos (los que pagas todos los meses) con su monto.
            </p>

            <div className="mt-6 flex flex-col gap-1">
              <label htmlFor="gastoAmount" className="text-sm font-medium">
                ¿Cuánto de tu ingreso va a Gasto cada mes? (Bs)
              </label>
              <input
                id="gastoAmount"
                type="number"
                step="any"
                onWheel={(e) => e.currentTarget.blur()}
                inputMode="decimal"
                min={0}
                value={gastoAmount}
                onChange={(e) => setGastoAmount(e.target.value)}
                placeholder="Ej. 1300"
                className="rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
              />
              <p className="text-xs text-zinc-500">
                Si lo dejas vacío, Gasto es la suma de tus gastos fijos y no te queda nada para el
                día a día.
              </p>
            </div>

            <h3 className="mt-6 text-sm font-medium">Tus gastos fijos</h3>
            <div className="mt-2 flex flex-col gap-2">
              {cats.gasto.map((cat, i) =>
                cat.daily ? null : (
                  <div key={`${cat.name}-${i}`} className="flex items-center gap-3 text-sm">
                    <label className="flex flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={cat.checked}
                        onChange={() => toggleCat('gasto', i)}
                        className="h-4 w-4 shrink-0"
                      />
                      {cat.name}
                    </label>
                    {cat.checked && (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="any"
                          onWheel={(e) => e.currentTarget.blur()}
                          inputMode="decimal"
                          min={0}
                          value={cat.amount}
                          onChange={(e) => setCatAmount('gasto', i, e.target.value)}
                          placeholder="0"
                          className="w-20 rounded-lg border border-zinc-300 px-2 py-1 text-right outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
                        />
                        <span className="text-xs text-zinc-500">Bs</span>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newCat.gasto}
                onChange={(e) => setNewCat((prev) => ({ ...prev, gasto: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCat('gasto')
                  }
                }}
                placeholder="Agregar gasto fijo"
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
              />
              <input
                type="number"
                step="any"
                onWheel={(e) => e.currentTarget.blur()}
                inputMode="decimal"
                min={0}
                value={newAmount.gasto}
                onChange={(e) => setNewAmount((prev) => ({ ...prev, gasto: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCat('gasto')
                  }
                }}
                placeholder="Monto (Bs)"
                className="w-24 rounded-lg border border-zinc-300 px-2 py-1.5 text-right text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
              />
              <button
                type="button"
                onClick={() => addCat('gasto')}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Agregar
              </button>
            </div>

            {/* Lo que queda del monto de Gasto después de los fijos: el dinero para el día a día. */}
            <div
              className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                gastoCoversFixed
                  ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
              }`}
            >
              {gastoCoversFixed
                ? `Gasto: ${formatBs(gastoPillarAmount)} Bs. Fijos: ${formatBs(gastoFixedTotal)} Bs. Para el día a día te quedan ${formatBs(gastoDailyPool)} Bs (unos ${formatBs(gastoDailyPool / previewDaysRemaining)} Bs por día).`
                : `Tus gastos fijos suman ${formatBs(gastoFixedTotal)} Bs, más que el monto de Gasto (${formatBs(gastoPillarAmount)} Bs).`}
            </div>

            <h3 className="mt-6 text-sm font-medium">Gastos del día a día</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Estas categorías no llevan monto: solo sirven para registrar en qué gastas. Lo que
              gastes sale del dinero para el día a día.
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {cats.gasto.map((cat, i) =>
                cat.daily ? (
                  <label key={`${cat.name}-${i}`} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={cat.checked}
                      onChange={() => toggleCat('gasto', i)}
                      className="h-4 w-4 shrink-0"
                    />
                    {cat.name}
                  </label>
                ) : null
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newDaily}
                onChange={(e) => setNewDaily(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addDaily()
                  }
                }}
                placeholder="Agregar categoría del día a día"
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
              />
              <button
                type="button"
                onClick={addDaily}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Agregar
              </button>
            </div>

            {!canContinueAllocation && (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                En total llevas asignados {formatBs(totalAllocated)} Bs, más que tu ingreso ({formatBs(incomeNumber)} Bs).
              </p>
            )}
            {canContinueAllocation && (
              <p className="mt-4 text-xs text-zinc-500">
                Te quedan {formatBs(freeMoney)} Bs libres de tu ingreso ({formatBs(incomeNumber)} Bs).
              </p>
            )}

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setStep(step - 1)}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Atrás
              </button>
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canContinueAllocation || !gastoCoversFixed}
                className="flex-1 rounded-lg bg-zinc-900 py-2.5 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Continuar
              </button>
            </div>
          </section>
        )}

        {/* ---------- Pasos de Ahorro e Inversión: categorías, cada una con su monto opcional ---------- */}
        {pillar && pillar !== 'gasto' && (
          <section>
            <h2 className="text-xl font-semibold tracking-tight">{PILLAR_LABEL[pillar]}</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Arma las categorías de {PILLAR_LABEL[pillar]}. A cada una le puedes poner un monto
              fijo en Bs, o dejarla sin monto si prefieres anotar ahí lo que ahorres o inviertas
              sin un monto mensual definido todavía.
            </p>

            <div className="mt-6 flex flex-col gap-2">
              {cats[pillar].map((cat, i) => (
                <div key={`${cat.name}-${i}`} className="flex items-center gap-3 text-sm">
                  <label className="flex flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={cat.checked}
                      onChange={() => toggleCat(pillar, i)}
                      className="h-4 w-4 shrink-0"
                    />
                    {cat.name}
                  </label>
                  {cat.checked && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="any"
                        onWheel={(e) => e.currentTarget.blur()}
                        min={0}
                        value={cat.amount}
                        onChange={(e) => setCatAmount(pillar, i, e.target.value)}
                        placeholder="0"
                        className="w-20 rounded-lg border border-zinc-300 px-2 py-1 text-right outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
                      />
                      <span className="text-xs text-zinc-500">Bs</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newCat[pillar]}
                onChange={(e) => setNewCat((prev) => ({ ...prev, [pillar]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCat(pillar)
                  }
                }}
                placeholder="Agregar categoría"
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
              />
              <input
                type="number"
                step="any"
                onWheel={(e) => e.currentTarget.blur()}
                min={0}
                value={newAmount[pillar]}
                onChange={(e) => setNewAmount((prev) => ({ ...prev, [pillar]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCat(pillar)
                  }
                }}
                placeholder="Monto (Bs)"
                className="w-24 rounded-lg border border-zinc-300 px-2 py-1.5 text-right text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
              />
              <button
                type="button"
                onClick={() => addCat(pillar)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Agregar
              </button>
            </div>

            {/* Indicador: cuánto llevas asignado en total vs tu ingreso */}
            <div
              className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                canContinueAllocation
                  ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
              }`}
            >
              {canContinueAllocation
                ? `${PILLAR_LABEL[pillar]}: ${formatBs(pillarTotal(pillar))} Bs. Te quedan ${formatBs(freeMoney)} Bs libres de tu ingreso (${formatBs(incomeNumber)} Bs).`
                : `En total llevas asignados ${formatBs(totalAllocated)} Bs, más que tu ingreso (${formatBs(incomeNumber)} Bs).`}
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setStep(step - 1)}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Atrás
              </button>
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canContinueAllocation}
                className="flex-1 rounded-lg bg-zinc-900 py-2.5 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Continuar
              </button>
            </div>
          </section>
        )}

        {/* ---------- Paso final: Dinero libre ---------- */}
        {step === DINERO_LIBRE_STEP && (
          <section>
            <h2 className="text-xl font-semibold tracking-tight">Dinero libre</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Todo lo que no asignaste a ninguna categoría de Ahorro, Gasto o Inversión no se
              pierde ni queda flotando — pasa directo a tu Dinero libre: plata sin destino
              específico, para gastar en lo que quieras.
            </p>

            <div className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-sm text-zinc-500">Con lo que cargaste, te queda libre</p>
              <p className="text-2xl font-semibold tracking-tight">{formatBs(freeMoney)} Bs</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
                  <p className="text-xs text-zinc-500">Por mes</p>
                  <p className="text-sm font-medium tabular-nums">{formatBs(freeMoney)} Bs</p>
                </div>
                <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
                  <p className="text-xs text-zinc-500">Por quincena</p>
                  <p className="text-sm font-medium tabular-nums">
                    {formatBs(freeMoney / previewBiweeksRemaining)} Bs
                  </p>
                </div>
                <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
                  <p className="text-xs text-zinc-500">Por semana</p>
                  <p className="text-sm font-medium tabular-nums">
                    {formatBs(freeMoney / previewWeeksRemaining)} Bs
                  </p>
                </div>
                <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
                  <p className="text-xs text-zinc-500">Por día</p>
                  <p className="text-sm font-medium tabular-nums">
                    {formatBs(freeMoney / previewDaysRemaining)} Bs
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Cuatro formas de ver el mismo total: cuánto es si lo repartes en lo que queda de
                este mes.
              </p>
            </div>

            <p className="mt-4 text-xs text-zinc-500">
              Esto lo vas a ver siempre actualizado en &quot;Mi Dinero → Dinero libre&quot;. Desde
              ahí también puedes registrar un gasto, anotar un ingreso extra, o asignar parte de
              esta plata a una categoría cuando decidas en qué usarla.
            </p>

            {error && (
              <p className="mt-4 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setStep(step - 1)}
                disabled={submitting}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Atrás
              </button>
              <button
                onClick={handleFinish}
                disabled={submitting}
                className="flex-1 rounded-lg bg-zinc-900 py-2.5 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {submitting ? 'Guardando…' : 'Ir al dashboard'}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
