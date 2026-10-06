import { describe, expect, it } from 'vitest'
import { summarizePillarMovements } from '@/lib/pillarTotals'

describe('summarizePillarMovements — eliminar una categoría no cambia el total (H20)', () => {
  const movements = [
    { category_id: 'a', amount: 500 },
    { category_id: 'a', amount: -100 },
    { category_id: 'b', amount: 300 },
    { category_id: null, amount: 50 },
  ]

  it('con ambas categorías activas, el total es la suma de todo', () => {
    const r = summarizePillarMovements(movements, new Set(['a', 'b']))
    expect(r.total).toBe(750)
    expect(r.categoriasEliminadas).toBe(0)
    expect(r.sinCategoria).toBe(50)
  })

  it('al eliminar la categoría "b" el total sigue siendo 750 y su plata aparece como eliminada', () => {
    const r = summarizePillarMovements(movements, new Set(['a']))
    expect(r.total).toBe(750)
    expect(r.categoriasEliminadas).toBe(300)
  })

  it('el saldo por categoría se conserva aunque esté eliminada', () => {
    const r = summarizePillarMovements(movements, new Set(['a']))
    expect(r.byCategoryId).toEqual({ a: 400, b: 300 })
  })

  it('sin movimientos todo es cero', () => {
    expect(summarizePillarMovements([], new Set())).toEqual({
      byCategoryId: {},
      sinCategoria: 0,
      categoriasEliminadas: 0,
      total: 0,
    })
  })
})
