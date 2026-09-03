// Efecto Dominó v2 (manual.md sección 4). Igual que lib/dashboard.ts: puro,
// sin imports de Supabase salvo formatBs para armar los mensajes.
//
// El sistema YA NO reparte plata automáticamente entre categorías (manual
// §4.0): o el número es consecuencia matemática de plata que el usuario ya
// tenía (Caso 1, nada que registrar), o el usuario declara explícitamente el
// origen (Caso 2, una fila en domino_events). Ya no existe el concepto de
// "categoría con presupuesto propio que se excede" ni una cadena de respaldo
// preconfigurada (backup_priority quedó obsoleto) — todo se dispara por el
// pozo discrecional del PILAR Gasto en su conjunto.

import { formatBs } from './format'

export const EPSILON = 0.005

export type DominoEventRow = {
  source_category_id: string | null
  affected_category_id: string | null
  debt_id: string | null
  amount: number
}

// Ajuste con signo por pilar, a partir de las filas de domino_events del
// mes: positivo = débito al pilar afectado (Ahorro/Inversión elegido por el
// usuario), negativo = acredita de vuelta al pilar Gasto (la plata que el
// usuario declaró cubierta ya no debe seguir apretando los días que quedan).
// Si la fila tiene debt_id (se declaró un préstamo), la plata vino de afuera
// del sistema de pilares: no hay débito a ningún pilar, pero el crédito a
// Gasto sigue aplicando igual.
export function computeDominoPillarAdjustments(
  events: DominoEventRow[],
  categoryPillarById: Record<string, string>,
  ahorroPillarId: string,
  gastoPillarId: string
): Record<string, number> {
  const adjustments: Record<string, number> = {}
  const add = (pillarId: string, amount: number) => {
    adjustments[pillarId] = (adjustments[pillarId] ?? 0) + amount
  }

  for (const e of events) {
    add(gastoPillarId, -e.amount)

    if (e.debt_id) continue

    // Caso 1 ("Cubrir con Ahorro") no exige subcategoría puntual — a
    // diferencia de Caso 2, que siempre manda un affected_category_id
    // concreto (manual §4.3: "el usuario elige QUÉ subcategoría").
    const affectedPillarId = e.affected_category_id
      ? categoryPillarById[e.affected_category_id]
      : ahorroPillarId
    if (affectedPillarId) add(affectedPillarId, e.amount)
  }

  return adjustments
}

export function buildCaso1Message(overspendToday: number, dailyBefore: number, dailyAfter: number): string {
  return `Te pasaste ${formatBs(overspendToday)} Bs hoy. Tu presupuesto diario baja de ${formatBs(dailyBefore)} a ${formatBs(dailyAfter)} Bs.`
}
