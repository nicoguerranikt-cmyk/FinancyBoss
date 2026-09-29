// Ahorro con propósito (migración 0022): aporte mensual sugerido para
// llegar a una meta de ahorro en la fecha elegida. Se calcula al vuelo,
// nunca se guarda (mismo criterio que el % informativo de un gasto fijo,
// ver migración 0019) — es una sugerencia para que el usuario decida cuánto
// asignarle a la categoría, no mueve plata ni cambia ningún % solo.

// Parseo manual de "YYYY-MM-DD" (sin pasar por Date): mismo criterio que
// lib/dashboard.ts para evitar sorpresas de huso horario en una simple
// resta de meses.
export function monthsUntil(targetDateIso: string, todayIso: string): number {
  const [ty, tm, td] = targetDateIso.split('-').map(Number)
  const [ny, nm, nd] = todayIso.split('-').map(Number)
  let months = (ty - ny) * 12 + (tm - nm)
  // Si el día del mes de la meta ya pasó este mes, no resta un mes completo
  // — mejor sugerir de más (aportar antes) que de menos.
  if (td < nd) months -= 1
  return Math.max(1, months)
}

export function suggestedMonthlyContribution(
  goalAmount: number,
  accumulated: number,
  targetDateIso: string,
  todayIso: string
): number {
  const remaining = Math.max(0, goalAmount - accumulated)
  if (remaining === 0) return 0
  return remaining / monthsUntil(targetDateIso, todayIso)
}
