// Reparto mensual real por categoría (manual.md — ver migración
// 0015_reparto_mensual_por_categoria.sql). Puro, sin imports de Supabase,
// igual que lib/dashboard.ts: se reusa tal cual desde el
// cliente (para mostrar la propuesta editable antes de confirmar) y desde
// el server (lib/monthlyAllocation.server.ts, para generar los montos por
// defecto cuando no hay overrides).
//
// Migración 0023: ya no existen categorías con %. Cualquier categoría (de
// cualquier pilar) recibe su monto tal cual, en Bs (`fixedAmount`) — en
// Gasto puede además auto-descontarse solo en una fecha (auto_repeat, ver
// migración 0018/0019), en Ahorro/Inversión es solo el monto que recibe
// cada mes. Si la suma de todos los montos superara el presupuesto del
// pilar, se escala todo proporcionalmente para que nunca se reparta más
// plata de la que hay. Lo que sobra (o todo, si nadie tiene monto) va a la
// categoría "general" del pilar.

import { EPSILON, distributeCents } from './money'

export type AllocationCategory = {
  id: string
  fixedAmount: number | null
  isGeneral: boolean
}

export type AllocationRow = { categoryId: string; amount: number; isGeneral: boolean }

export function computeMonthlyAllocation(
  pillarBudget: number,
  categories: AllocationCategory[]
): AllocationRow[] {
  const general = categories.find((c) => c.isGeneral)
  const fixed = categories.filter((c) => !c.isGeneral && c.fixedAmount !== null)

  const raw = fixed.map((c) => ({ categoryId: c.id, amount: c.fixedAmount as number }))
  const rawSum = raw.reduce((sum, r) => sum + r.amount, 0)

  const scaleFactor = rawSum > pillarBudget + EPSILON && rawSum > 0 ? pillarBudget / rawSum : 1
  const rows: AllocationRow[] = raw.map((r) => ({
    categoryId: r.categoryId,
    amount: r.amount * scaleFactor,
    isGeneral: false,
  }))

  if (general) {
    const assigned = rows.reduce((sum, r) => sum + r.amount, 0)
    rows.push({ categoryId: general.id, amount: Math.max(0, pillarBudget - assigned), isGeneral: true })
  }

  // Al escalar, cada monto puede tener fracciones de centavo: se redondean a
  // centavos conservando el total exacto (lib/money.ts), sin perder ninguno.
  const cents = distributeCents(rows.map((r) => r.amount))
  return rows.map((r, i) => ({ ...r, amount: cents[i] }))
}
