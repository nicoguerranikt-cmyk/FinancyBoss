'use client'

import { useMemo, useState } from 'react'
import { formatBs } from '@/lib/format'
import { convertUsdSavingsToBs, depositUsdSavings } from './actions'

type Movement = {
  id: string
  amount_usd: number
  bs_amount: number | null
  description: string | null
  date: string
}

const inputClass =
  'rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-brand dark:border-zinc-700 dark:focus:border-brand'
const primaryButtonClass =
  'rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-40 dark:text-zinc-950'

function groupByDate(movements: Movement[]): { date: string; items: Movement[] }[] {
  const groups: { date: string; items: Movement[] }[] = []
  for (const m of movements) {
    const last = groups[groups.length - 1]
    if (last && last.date === m.date) last.items.push(m)
    else groups.push({ date: m.date, items: [m] })
  }
  return groups
}

export default function UsdSavingsClient({
  pillarId,
  balanceUsd,
  movements,
  categories,
  todayIso,
}: {
  pillarId: string
  balanceUsd: number
  movements: Movement[]
  categories: { id: string; name: string }[]
  todayIso: string
}) {
  const [mode, setMode] = useState<'deposit' | 'convert'>('deposit')

  const [depositAmount, setDepositAmount] = useState('')
  const [depositDescription, setDepositDescription] = useState('')
  const [depositDate, setDepositDate] = useState(todayIso)
  const [depositSaving, setDepositSaving] = useState(false)
  const [depositError, setDepositError] = useState<string | null>(null)
  const [depositSuccess, setDepositSuccess] = useState(false)

  const [convertUsd, setConvertUsd] = useState('')
  const [convertBs, setConvertBs] = useState('')
  const [convertCategoryId, setConvertCategoryId] = useState(categories[0]?.id ?? '')
  const [convertDate, setConvertDate] = useState(todayIso)
  const [convertSaving, setConvertSaving] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [convertSuccess, setConvertSuccess] = useState(false)

  const groups = useMemo(() => groupByDate(movements), [movements])

  async function handleDeposit() {
    setDepositError(null)
    setDepositSuccess(false)
    const amount = Number(depositAmount)
    if (!(amount > 0)) {
      setDepositError('Ingresa un monto mayor a 0.')
      return
    }
    setDepositSaving(true)
    const res = await depositUsdSavings({
      pillarId,
      amountUsd: amount,
      description: depositDescription.trim() || undefined,
      date: depositDate,
    })
    setDepositSaving(false)
    if (res.error) {
      setDepositError(res.error)
      return
    }
    setDepositAmount('')
    setDepositDescription('')
    setDepositDate(todayIso)
    setDepositSuccess(true)
  }

  async function handleConvert() {
    setConvertError(null)
    setConvertSuccess(false)
    const usd = Number(convertUsd)
    const bs = Number(convertBs)
    if (!(usd > 0)) return setConvertError('Ingresa cuántos dólares conviertes.')
    if (!(bs > 0)) return setConvertError('Ingresa a cuántos bolivianos equivalen.')
    if (!convertCategoryId) return setConvertError('Elige a qué categoría de Ahorro va.')

    setConvertSaving(true)
    const res = await convertUsdSavingsToBs({
      pillarId,
      amountUsd: usd,
      bsAmount: bs,
      categoryId: convertCategoryId,
      date: convertDate,
    })
    setConvertSaving(false)
    if (res.error) {
      setConvertError(res.error)
      return
    }
    setConvertUsd('')
    setConvertBs('')
    setConvertDate(todayIso)
    setConvertSuccess(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('deposit')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === 'deposit' ? 'bg-brand text-white dark:text-zinc-950' : 'border border-zinc-300 dark:border-zinc-700'
            }`}
          >
            Agregar USD
          </button>
          <button
            type="button"
            onClick={() => setMode('convert')}
            disabled={categories.length === 0}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
              mode === 'convert' ? 'bg-brand text-white dark:text-zinc-950' : 'border border-zinc-300 dark:border-zinc-700'
            }`}
          >
            Convertir a Bs
          </button>
        </div>

        {mode === 'deposit' ? (
          <div className="mt-3 flex flex-col gap-2">
            <input
              type="number"
              step="any"
              onWheel={(e) => e.currentTarget.blur()}
              min={0}
              placeholder="Monto (USD)"
              value={depositAmount}
              onChange={(e) => {
                setDepositAmount(e.target.value)
                setDepositSuccess(false)
              }}
              className={inputClass}
            />
            <input
              type="date"
              value={depositDate}
              onChange={(e) => {
                setDepositDate(e.target.value)
                setDepositSuccess(false)
              }}
              className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`}
            />
            <input
              type="text"
              placeholder="Descripción (opcional)"
              value={depositDescription}
              onChange={(e) => setDepositDescription(e.target.value)}
              className={inputClass}
            />
            {depositError && (
              <p className="text-sm text-red-600" role="alert">
                {depositError}
              </p>
            )}
            {depositSuccess && !depositError && (
              <p className="text-sm text-green-700 dark:text-green-400">Registrado.</p>
            )}
            <button onClick={handleDeposit} disabled={depositSaving} className={primaryButtonClass}>
              {depositSaving ? 'Guardando…' : 'Agregar'}
            </button>
          </div>
        ) : categories.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            Necesitas al menos una categoría de Ahorro para convertir a Bs.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-xs text-zinc-500">Tienes {balanceUsd.toFixed(2)} USD disponibles.</p>
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                onWheel={(e) => e.currentTarget.blur()}
                min={0}
                placeholder="Sacas (USD)"
                value={convertUsd}
                onChange={(e) => {
                  setConvertUsd(e.target.value)
                  setConvertSuccess(false)
                }}
                className={`${inputClass} flex-1`}
              />
              <input
                type="number"
                step="any"
                onWheel={(e) => e.currentTarget.blur()}
                min={0}
                placeholder="Son (Bs)"
                value={convertBs}
                onChange={(e) => {
                  setConvertBs(e.target.value)
                  setConvertSuccess(false)
                }}
                className={`${inputClass} flex-1`}
              />
            </div>
            <select
              value={convertCategoryId}
              onChange={(e) => setConvertCategoryId(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none [color-scheme:light] focus:border-brand dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark] dark:focus:border-brand"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id} className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={convertDate}
              onChange={(e) => {
                setConvertDate(e.target.value)
                setConvertSuccess(false)
              }}
              className={`${inputClass} [color-scheme:light] dark:[color-scheme:dark]`}
            />
            {convertError && (
              <p className="text-sm text-red-600" role="alert">
                {convertError}
              </p>
            )}
            {convertSuccess && !convertError && (
              <p className="text-sm text-green-700 dark:text-green-400">Convertido.</p>
            )}
            <button onClick={handleConvert} disabled={convertSaving} className={primaryButtonClass}>
              {convertSaving ? 'Guardando…' : 'Convertir'}
            </button>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-zinc-500">Historial</h2>
        {groups.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Todavía no hay movimientos acá.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-4">
            {groups.map((group) => (
              <div key={group.date}>
                <p className="text-xs font-medium text-zinc-500">{group.date}</p>
                <div className="mt-1 flex flex-col gap-2">
                  {group.items.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                    >
                      <p className="text-sm">{m.description || (m.amount_usd >= 0 ? 'Depósito' : 'Conversión')}</p>
                      <div className="text-right">
                        <p
                          className={`text-sm font-medium ${
                            m.amount_usd >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {m.amount_usd >= 0 ? '+' : ''}
                          {m.amount_usd.toFixed(2)} USD
                        </p>
                        {m.bs_amount !== null && (
                          <p className="text-xs text-zinc-500">+{formatBs(m.bs_amount)} Bs</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
