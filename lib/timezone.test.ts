import { describe, expect, it } from 'vitest'
import {
  dateIn,
  isValidTimeZone,
  monthRangeIn,
  todayIn,
} from '@/lib/dashboard'

describe('todayIn — "hoy" según la zona del usuario', () => {
  // 01:30 UTC del 1 de noviembre.
  const instant = new Date('2026-11-01T01:30:00Z')

  it('en Bolivia (UTC-4) todavía es 31 de octubre a las 21:30', () => {
    expect(todayIn('America/La_Paz', instant)).toEqual({ year: 2026, month: 10, day: 31, iso: '2026-10-31' })
  })

  it('en Japón (UTC+9) ya es 1 de noviembre', () => {
    expect(todayIn('Asia/Tokyo', instant).iso).toBe('2026-11-01')
  })

  it('la zona por defecto es la de Bolivia', () => {
    expect(todayIn(undefined, instant).iso).toBe('2026-10-31')
  })
})

describe('dateIn — convertir un instante a la fecha del usuario', () => {
  it('un registro creado a las 02:00 UTC es del día anterior en Bolivia', () => {
    expect(dateIn(new Date('2026-03-15T02:00:00Z'), 'America/La_Paz')).toEqual({ year: 2026, month: 3, day: 14 })
  })
})

describe('monthRangeIn y validación de zonas', () => {
  it('devuelve el primer y último día del mes actual', () => {
    const { start, end } = monthRangeIn('America/La_Paz')
    expect(start).toMatch(/^\d{4}-\d{2}-01$/)
    expect(end).toMatch(/^\d{4}-\d{2}-(28|29|30|31)$/)
  })

  it('reconoce nombres IANA y rechaza basura', () => {
    expect(isValidTimeZone('America/La_Paz')).toBe(true)
    expect(isValidTimeZone('Europe/Madrid')).toBe(true)
    expect(isValidTimeZone('Marte/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
  })
})
