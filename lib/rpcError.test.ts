import { describe, expect, it } from 'vitest'
import { userFacingRpcError } from '@/lib/rpcError'

describe('userFacingRpcError', () => {
  it('muestra el mensaje de un raise exception de la función (P0001)', () => {
    expect(userFacingRpcError({ code: 'P0001', message: 'Esta deuda ya está saldada.' }, 'Falló.')).toBe(
      'Esta deuda ya está saldada.'
    )
  })

  it('un error técnico (red, permisos) no se muestra: sale el genérico', () => {
    expect(userFacingRpcError({ code: '42501', message: 'permission denied for table debts' }, 'Falló.')).toBe('Falló.')
    expect(userFacingRpcError({ message: 'fetch failed' }, 'Falló.')).toBe('Falló.')
  })

  it('un P0001 sin texto usa el genérico', () => {
    expect(userFacingRpcError({ code: 'P0001', message: '' }, 'Falló.')).toBe('Falló.')
  })
})
