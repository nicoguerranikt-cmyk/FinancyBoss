// Formato de moneda compartido: bolivianos (Bs), sin decimales.
export function formatBs(n: number): string {
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(n)
}
