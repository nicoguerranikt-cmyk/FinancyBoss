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

function initialCats(): Record<PillarKey, CatItem[]> {
  return {
    ahorro: SUGGESTED.ahorro.map((name) => ({ name, checked: true })),
    gasto: SUGGESTED.gasto.map((name) => ({ name, checked: true })),
    inversion: SUGGESTED.inversion.map((name) => ({ name, checked: true })),
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

  // Paso 2 — pilares (valores que suman 100 por default, ajustables)
  const [pct, setPct] = useState({ ahorro: 20, gasto: 60, inversion: 20 })

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
  const pctSum = pct.ahorro + pct.gasto + pct.inversion

  const canContinueIncome = incomeNumber > 0
  const canContinuePillars = Math.round(pctSum) === 100

  function setPillarPct(key: PillarKey, value: string) {
    const n = Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
    setPct((prev) => ({ ...prev, [key]: n }))
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
      pillars: pct,
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
                <strong>Vos decidís</strong> qué % va a cada uno.
              </li>
              <li className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                Cuando te excedás en algo, te decimos <strong>exactamente qué meta</strong> estás sacrificando.
              </li>
            </ul>
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
              Este es el dinero con el que trabajaremos cada mes. Podés ajustarlo cuando quieras.
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
                onClick={() => setStep(2)}
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
              Definí qué porcentaje de tu ingreso va a cada pilar. Tienen que sumar 100%.
            </p>

            <div className="mt-6 flex flex-col gap-4">
              {PILLAR_KEYS.map((key) => (
                <div key={key} className="flex items-center gap-3">
                  <label htmlFor={`pct-${key}`} className="w-24 text-sm font-medium">
                    {PILLAR_LABEL[key]}
                  </label>
                  <input
                    id={`pct-${key}`}
                    type="number"
                onWheel={(e) => e.currentTarget.blur()}
                    min={0}
                    max={100}
                    value={pct[key]}
                    onChange={(e) => setPillarPct(key, e.target.value)}
                    className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-right outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
                  />
                  <span className="text-sm text-zinc-500">%</span>
                  <span className="ml-auto text-sm tabular-nums text-zinc-500">
                    {formatBs((incomeNumber * pct[key]) / 100)} Bs
                  </span>
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
                ? 'Perfecto, suman 100%.'
                : `Suman ${pctSum}%. Ajustá para llegar a 100%.`}
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
              Dentro de cada pilar podés crear categorías para organizar mejor tu dinero. Te
              damos algunas sugerencias para empezar.
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
                      + Agregar
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
