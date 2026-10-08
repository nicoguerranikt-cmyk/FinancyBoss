// Montos en Bs con precisión de centavos (la base guarda numeric(12,2)).
//
// Redondear cada parte por separado pierde (o inventa) centavos: tres partes
// de 33,333... → 33,33 + 33,33 + 33,33 = 99,99, y falta 1 centavo del total.
// distributeCents redondea cada parte a centavos pero conserva EXACTAMENTE el
// total (la suma de las partes originales, a centavos): los centavos que
// sobran o faltan se reparten entre las partes con mayor fracción (método del
// resto mayor). No se crea ni se pierde plata.
export function distributeCents(parts: number[]): number[] {
  const rawCents = parts.map((p) => p * 100)
  const floors = rawCents.map((c) => Math.floor(c + 1e-9))
  const targetCents = Math.round(rawCents.reduce((sum, c) => sum + c, 0))
  let remaining = targetCents - floors.reduce((sum, c) => sum + c, 0)

  // Las partes con la fracción más grande reciben el centavo extra primero.
  const order = rawCents
    .map((c, index) => ({ index, fraction: c - Math.floor(c + 1e-9) }))
    .sort((a, b) => b.fraction - a.fraction)

  const result = [...floors]
  for (let i = 0; remaining > 0 && order.length > 0; i = (i + 1) % order.length) {
    result[order[i].index] += 1
    remaining -= 1
  }
  return result.map((c) => c / 100)
}

// Tolerancia para comparar montos en Bs (medio centavo): evita rechazar un monto por ruido de punto flotante.
export const EPSILON = 0.005
