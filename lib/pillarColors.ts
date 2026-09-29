// Paleta categórica por pilar — validada para daltonismo, orden fijo
// azul/naranja/aqua = Ahorro/Gasto/Inversión, nunca reordenada según el
// valor (ver comentario original en app/(app)/estadisticas/ChartBars.tsx).
// Único lugar donde vive esta paleta: cualquier pantalla que necesite
// identificar un pilar por color importa de acá, para que sea siempre el
// mismo color en toda la app.

import type { PillarName } from './dashboard'

export const PILLAR_COLOR: Record<PillarName, string> = {
  ahorro: 'bg-[#2a78d6] dark:bg-[#3987e5]',
  gasto: 'bg-[#eb6834] dark:bg-[#d95926]',
  inversion: 'bg-[#1baf7a] dark:bg-[#199e70]',
}

export const PILLAR_STROKE: Record<PillarName, string> = {
  ahorro: 'stroke-[#2a78d6] dark:stroke-[#3987e5] fill-[#2a78d6] dark:fill-[#3987e5]',
  gasto: 'stroke-[#eb6834] dark:stroke-[#d95926] fill-[#eb6834] dark:fill-[#d95926]',
  inversion: 'stroke-[#1baf7a] dark:stroke-[#199e70] fill-[#1baf7a] dark:fill-[#199e70]',
}

// Fondo tenue (10% de opacidad) para tarjetas — mismo color base que
// PILLAR_COLOR, para que la tarjeta entera "respire" el color del pilar sin
// perder contraste del texto.
export const PILLAR_TINT: Record<PillarName, string> = {
  ahorro: 'bg-[#2a78d6]/10 dark:bg-[#3987e5]/15',
  gasto: 'bg-[#eb6834]/10 dark:bg-[#d95926]/15',
  inversion: 'bg-[#1baf7a]/10 dark:bg-[#199e70]/15',
}

// Borde izquierdo de acento — se usa junto con PILLAR_TINT en tarjetas.
export const PILLAR_BORDER: Record<PillarName, string> = {
  ahorro: 'border-[#2a78d6] dark:border-[#3987e5]',
  gasto: 'border-[#eb6834] dark:border-[#d95926]',
  inversion: 'border-[#1baf7a] dark:border-[#199e70]',
}

// Texto en el color del pilar (para montos/números destacados dentro de la
// tarjeta tintada, donde el texto por defecto quedaría muy plano).
export const PILLAR_TEXT: Record<PillarName, string> = {
  ahorro: 'text-[#2a78d6] dark:text-[#3987e5]',
  gasto: 'text-[#eb6834] dark:text-[#d95926]',
  inversion: 'text-[#1baf7a] dark:text-[#199e70]',
}
