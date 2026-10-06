// Formato de moneda compartido: bolivianos (Bs). Los centavos se muestran tal
// cual son: "1.234" si el monto es entero y "1.234,50" si tiene centavos —
// nunca se redondea a entero, porque es plata y la base guarda 2 decimales
// (numeric(12,2)). Un monto que sale de una división (ej. el presupuesto
// diario) se muestra a su precisión de centavos.
export function formatBs(n: number): string {
  // Pasar a centavos enteros solo quita el ruido de punto flotante
  // (ej. 0.1 + 0.2); no pierde ningún centavo real.
  const cents = Math.round(n * 100)
  const decimals = cents % 100 === 0 ? 0 : 2
  const value = cents === 0 ? 0 : cents / 100 // evita mostrar "-0"
  return new Intl.NumberFormat('es-BO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}
