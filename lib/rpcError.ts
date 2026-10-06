// Errores de las funciones de Postgres (supabase.rpc). Cuando una función hace
// `raise exception 'texto'`, Postgres devuelve el código P0001 y el texto ya
// está escrito para el usuario ("El pago no puede ser mayor al saldo
// pendiente."): se muestra tal cual. Cualquier otro error (red, permisos, un
// fallo interno) trae un mensaje técnico que no debe verse en pantalla: se
// reemplaza por uno genérico.
export function userFacingRpcError(error: { code?: string; message?: string }, fallback: string): string {
  return error.code === 'P0001' && error.message ? error.message : fallback
}
