import { describe, expect, it } from 'vitest'
import { distributeCents } from '@/lib/money'

const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100)

describe('distributeCents — no se pierden ni se inventan centavos', () => {
  it('tres partes de 1/3 de 100 suman exactamente 100,00', () => {
    const parts = [100 / 3, 100 / 3, 100 / 3]
    const out = distributeCents(parts)
    expect(sum(out)).toBe(10000)
    expect([...out].sort()).toEqual([33.33, 33.33, 33.34])
  })

  it('montos que ya son centavos exactos no cambian', () => {
    expect(distributeCents([150, 350.5, 100.25])).toEqual([150, 350.5, 100.25])
  })

  it('el ejemplo del reajuste: 1200 repartido a la mitad suma 600,00', () => {
    const out = distributeCents([300 * 0.5, 700 * 0.5, 200 * 0.5])
    expect(out).toEqual([150, 350, 100])
  })

  it('ingreso 1000 con pilares 1000/700/300 (factor 1000/2000): suma exactamente 1000,00', () => {
    const factor = 1000 / 2000
    const out = distributeCents([1000 * factor, 700 * factor, 300 * factor])
    expect(sum(out)).toBe(100000)
  })

  it('con fracciones de centavo la suma sigue siendo la del total', () => {
    const factor = 1000 / 1700
    const out = distributeCents([300 * factor, 700 * factor, 700 * factor])
    expect(sum(out)).toBe(100000)
  })

  it('lista vacía o un solo monto', () => {
    expect(distributeCents([])).toEqual([])
    expect(distributeCents([12.5])).toEqual([12.5])
  })
})
