// Solo rutas internas: tiene que empezar con "/" y no con "//" ni "/\" (esas
// dos son formas de meter una URL externa ahí — "open redirect" — que un
// navegador puede interpretar como protocol-relative a otro host).
// Lo usan el login y la confirmación de email (/auth/confirm).
export function safeNextPath(value: FormDataEntryValue | null): string {
  const path = typeof value === 'string' ? value : ''
  if (path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\')) {
    return path
  }
  return '/'
}
