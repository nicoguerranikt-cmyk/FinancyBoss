import { describe, expect, it } from 'vitest'
import { safeNextPath } from '@/lib/safeNextPath'

describe('safeNextPath (H15)', () => {
  it('deja pasar rutas internas, con query y hash', () => {
    expect(safeNextPath('/')).toBe('/')
    expect(safeNextPath('/mi-dinero')).toBe('/mi-dinero')
    expect(safeNextPath('/mi-dinero?tab=1#x')).toBe('/mi-dinero?tab=1#x')
  })

  it('rechaza URLs externas y valores vacíos', () => {
    expect(safeNextPath('https://evil.com')).toBe('/')
    expect(safeNextPath('//evil.com')).toBe('/')
    expect(safeNextPath('evil.com')).toBe('/')
    expect(safeNextPath('')).toBe('/')
    expect(safeNextPath(null)).toBe('/')
  })

  it('rechaza las variantes que se vuelven externas al normalizar', () => {
    expect(safeNextPath('/\\evil.com')).toBe('/')
    expect(safeNextPath('/\t/evil.com')).toBe('/')
    expect(safeNextPath('/\n/evil.com')).toBe('/')
    expect(safeNextPath('/\r/evil.com')).toBe('/')
  })
})
