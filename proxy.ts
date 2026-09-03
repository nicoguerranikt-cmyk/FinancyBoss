// proxy.ts — Next.js 16 renombró el antiguo "middleware.ts" a "proxy.ts"
// (y la función middleware() a proxy()). Corre en el servidor ANTES de cada
// página que coincida con el matcher de abajo.
//
// Acá solo delegamos en updateSession, que refresca la sesión y protege rutas.

import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Corre en todo, MENOS archivos estáticos e imágenes (para no frenar
  // el CSS/JS/imágenes con la lógica de sesión).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
