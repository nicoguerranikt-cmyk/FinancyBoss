// Solo rutas internas ("open redirect"): se resuelve la ruta contra un origen
// ficticio y se acepta únicamente si sigue en ese mismo origen. Validar con
// prefijos del texto no alcanza: el parser de URL elimina tabulaciones y
// saltos de línea, y "/<tab>/evil.com" termina siendo "//evil.com" (otro host).
// Lo usan el login y la confirmación de email (/auth/confirm).
const FAKE_ORIGIN = 'http://internal.invalid'

export function safeNextPath(value: FormDataEntryValue | null): string {
  const path = typeof value === 'string' ? value : ''
  if (!path.startsWith('/')) return '/'
  try {
    const url = new URL(path, FAKE_ORIGIN)
    if (url.origin !== FAKE_ORIGIN) return '/'
    return url.pathname + url.search + url.hash
  } catch {
    return '/'
  }
}
