import { describe, expect, it } from 'vitest'
import { formatBs } from '@/lib/format'

describe('formatBs — los centavos salen como son (H17)', () => {
  it('un monto entero se muestra sin decimales', () => {
    expect(formatBs(1000)).toBe('1.000')
    expect(formatBs(0)).toBe('0')
  })

  it('un monto con centavos los muestra completos, sin redondear a entero', () => {
    expect(formatBs(12.5)).toBe('12,50')
    expect(formatBs(0.4)).toBe('0,40')
    expect(formatBs(1234.56)).toBe('1.234,56')
  })

  it('no confunde 0,40 con 0 ni 99,99 con 100', () => {
    expect(formatBs(0.4)).not.toBe('0')
    expect(formatBs(99.99)).not.toBe('100')
  })

  it('quita el ruido de punto flotante pero no pierde centavos', () => {
    expect(formatBs(0.1 + 0.2)).toBe('0,30')
    expect(formatBs(1.005 * 100)).toBe('100,50')
  })

  it('negativos con centavos y nunca "-0"', () => {
    expect(formatBs(-200.25)).toBe('-200,25')
    expect(formatBs(-0.001)).toBe('0')
  })
})
