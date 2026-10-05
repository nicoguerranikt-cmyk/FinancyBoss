'use client'

// Wizard de onboarding: 4 pasos en una sola página. El estado vive en el
// navegador y NADA se guarda en la base hasta el último paso ("Ir al dashboard"),
// que llama a la Server Action completeOnboarding.

import { useMemo, useState } from 'react'
import { completeOnboarding, type PillarKey } from './actions'

// Subcategorías sugeridas por pilar (tabla del manual, sección 1.2, pantalla 3).
const SUGGESTED: Record<PillarKey, string[]> = {
  ahorro: ['Fondo de emergencia', 'Viajes', 'Meta específica', 'Imprevistos'],
  gasto: ['Comida', 'Transporte', 'Vivienda', 'Gastos diarios'],
  inversion: ['Proyecto personal', 'Educación', 'Otro'],
}

const PILLAR_LABEL: Record<PillarKey, string> = {
  ahorro: 'Ahorro',
  gasto: 'Gasto',
  inversion: 'Inversión',
}

type CatItem = { name: string; checked: boolean }

// Sin marcar por default: si el usuario no toca nada acá, termina con solo
// las 3 categorías "general" (las crea complete_onboarding() aparte,
// siempre) — cualquier otra categoría tiene que ser una elección a
// propósito, nunca algo que "vino solo" por pasar rápido este paso.
function initialCats(): Record<PillarKey, CatItem[]> {
  return {
    ahorro: SUGGESTED.ahorro.map((name) => ({ name, checked: false })),
    gasto: SUGGESTED.gasto.map((name) => ({ name, checked: false })),
    inversion: SUGGESTED.inversion.map((name) => ({ name, checked: false })),
  }
}

const PILLAR_KEYS: PillarKey[] = ['ahorro', 'gasto', 'inversion']

function formatBs(n: number) {
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(n)
}

export default function OnboardingWizard({ userName }: { userName: string }) {
  const [step, setStep] = useState(0)

  // Paso 1 — ingreso
  const [income, setIncome] = useState('')
  const [autoRepeat, setAutoRepeat] = useState(true)

  // Paso 2 — pilares (montos en Bs, migración 0020 — ya no %). Arrancan
  // vacíos y se sugiere un reparto 20/60/20 recién al entrar a este paso,
  // cuando ya se conoce el ingreso del paso 1.
  const [amounts, setAmounts] = useState({ ahorro: '', gasto: '', inversion: '' })

  // Paso 3 — categorías
  const [cats, setCats] = useState<Record<PillarKey, CatItem[]>>(initialCats)
  const [newCat, setNewCat] = useState<Record<PillarKey, string>>({
    ahorro: '',
    gasto: '',
    inversion: '',
  })

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const incomeNumber = Number(income) || 0
  const amountsSum = (Number(amounts.ahorro) || 0) + (Number(amounts.gasto) || 0) + (Number(amounts.inversion) || 0)
  const freeMoney = Math.max(0, incomeNumber - amountsSum)

  const canContinueIncome = incomeNumber > 0
  const canContinuePillars = amountsSum <= incomeNumber

  function goToPillars() {
    // Sugerencia inicial 20/60/20, solo la primera vez que se llega acá.
    if (amounts.ahorro === '' && amounts.gasto === '' && amounts.inversion === '') {
      setAmounts({
        ahorro: String(Math.round(incomeNumber * 0.2)),
        gasto: String(Math.round(incomeNumber * 0.6)),
        inversion: String(Math.round(incomeNumber * 0.2)),
      })
    }
    setStep(2)
  }

  function setPillarAmount(key: PillarKey, value: string) {
    const n = Math.max(0, Math.round(Number(value) || 0))
    setAmounts((prev) => ({ ...prev, [key]: String(n) }))
  }

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

  function addCat(pillar: PillarKey) {
    const name = newCat[pillar].trim()
    if (!name) return
    setCats((prev) => ({
      ...prev,
      [pillar]: [...prev[pillar], { name, checked: true }],
    }))
    setNewCat((prev) => ({ ...prev, [pillar]: '' }))
  }

  const selectedCategories = useMemo(
    () =>
      PILLAR_KEYS.flatMap((pillar) =>
        cats[pillar]
          .filter((c) => c.checked)
          .map((c) => ({ pillar, name: c.name }))
      ),
    [cats]
  )

  async function handleFinish() {
    setError(null)
    setSubmitting(true)
    const res = await completeOnboarding({
      income: incomeNumber,
      autoRepeat,
      pillars: {
        ahorro: Number(amounts.ahorro) || 0,
        gasto: Number(amounts.gasto) || 0,
        inversion: Number(amounts.inversion) || 0,
      },
      categories: selectedCategories,
    })
    // Si hubo éxito, completeOnboarding redirige y no llegamos acá.
    if (res?.error) {
      setError(res.error)
      setSubmitting(false)
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Indicador de progreso */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {[0, 1, 2, 3].map((i) => (
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
                <strong>Tú decides</strong> cuánta plata va a cada uno.
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
                onWheel={(e) => e.currentTarget.blur()}
                inputMode="numeric"
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
                onClick={goToPillars}
                disabled={!canContinueIncome}
                className="flex-1 rounded-lg bg-zinc-900 py-2.5 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Continuar
              </button>
            </div>
          </section>
        )}

        {/* ---------- Paso 2: Distribución de pilares ---------- */}
        {step === 2 && (
          <section>
            <h2 className="text-xl font-semibold tracking-tight">Distribución de pilares</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Define cuánto de tu ingreso ({formatBs(incomeNumber)} Bs) va a cada pilar, en Bs. No
              hace falta usarlo todo — lo que sobre queda como dinero libre.
            </p>

            <div className="mt-6 flex flex-col gap-4">
              {PILLAR_KEYS.map((key) => (
                <div key={key} className="flex items-center gap-3">
                  <label htmlFor={`amount-${key}`} className="w-24 text-sm font-medium">
                    {PILLAR_LABEL[key]}
                  </label>
                  <input
                    id={`amount-${key}`}
                    type="number"
                    onWheel={(e) => e.currentTarget.blur()}
                    min={0}
                    value={amounts[key]}
                    onChange={(e) => setPillarAmount(key, e.target.value)}
                    className="w-24 rounded-lg border border-zinc-300 px-2 py-1.5 text-right outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
                  />
                  <span className="text-sm text-zinc-500">Bs</span>
                </div>
              ))}
            </div>

            {/* Indicador de suma */}
            <div
              className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                canContinuePillars
                  ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
              }`}
            >
              {canContinuePillars
                ? `Te quedan ${formatBs(freeMoney)} Bs libres de tu ingreso.`
                : `Suman ${formatBs(amountsSum)} Bs, más que tu ingreso (${formatBs(incomeNumber)} Bs).`}
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Atrás
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!canContinuePillars}
                className="flex-1 rounded-lg bg-zinc-900 py-2.5 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Continuar
              </button>
            </div>
          </section>
        )}

        {/* ---------- Paso 3: Subcategorías iniciales ---------- */}
        {step === 3 && (
          <section>
            <h2 className="text-xl font-semibold tracking-tight">Categorías iniciales</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Dentro de cada pilar puedes crear categorías para organizar mejor tu dinero. Te
              damos algunas sugerencias para empezar.
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Estas categorías nacen sin un monto fijo asignado. Si alguna es un gasto fijo (como
              un alquiler o un servicio), le asignas su monto y frecuencia después, desde
              &quot;Gastos fijos&quot; dentro de Mi Dinero.
            </p>

            <div className="mt-6 flex flex-col gap-6">
              {PILLAR_KEYS.map((pillar) => (
                <div key={pillar}>
                  <h3 className="mb-2 text-sm font-semibold">{PILLAR_LABEL[pillar]}</h3>
                  <div className="flex flex-col gap-2">
                    {cats[pillar].map((cat, i) => (
                      <label key={`${cat.name}-${i}`} className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={cat.checked}
                          onChange={() => toggleCat(pillar, i)}
                          className="h-4 w-4"
                        />
                        {cat.name}
                      </label>
                    ))}
                  </div>

                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={newCat[pillar]}
                      onChange={(e) =>
                        setNewCat((prev) => ({ ...prev, [pillar]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addCat(pillar)
                        }
                      }}
                      placeholder="Agregar categoría"
                      className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => addCat(pillar)}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <p className="mt-4 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setStep(2)}
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
