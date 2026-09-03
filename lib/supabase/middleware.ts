// Lógica del "portero" de sesión, que corre en proxy.ts (Next.js 16).
//
// Hace dos trabajos en cada request:
//   1. Refresca el token de sesión de Supabase y lo re-escribe en las cookies,
//      para que el login sea PERMANENTE (no se caiga solo). Esto cumple la
//      regla del manual: "Sesión permanente hasta cierre manual".
//   2. Protege las rutas: si no hay usuario logueado y la ruta no es pública,
//      redirige a /login.
//
// Nota de seguridad: usamos supabase.auth.getUser() (no getSession()). getUser()
// valida el token contra el servidor de Supabase; getSession() solo lee la
// cookie y se puede falsificar. En el servidor siempre getUser().

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Rutas que un usuario NO logueado puede ver (login, registro, confirmación de email).
const PUBLIC_PREFIXES = ['/login', '/registro', '/auth']

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function updateSession(request: NextRequest) {
  // Respuesta base: deja pasar el request tal cual.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Cuando Supabase renueva el token, escribimos las cookies nuevas
          // tanto en el request (para este ciclo) como en la respuesta (para
          // que lleguen al navegador).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANTE: no metas código entre createServerClient y getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // Sin usuario y ruta protegida -> a login.
  if (!user && !isPublic(path)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const redirectResponse = NextResponse.redirect(url)
    // Preservamos las cookies que Supabase pudo haber refrescado.
    supabaseResponse.cookies.getAll().forEach((cookie) =>
      redirectResponse.cookies.set(cookie)
    )
    return redirectResponse
  }

  // Ya logueado pero entrando a login/registro -> al dashboard (home por ahora).
  if (user && (path.startsWith('/login') || path.startsWith('/registro'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) =>
      redirectResponse.cookies.set(cookie)
    )
    return redirectResponse
  }

  // Caso normal: devolvemos la respuesta con las cookies actualizadas.
  // No la reemplaces por otra sin copiar estas cookies, o la sesión se rompe.
  return supabaseResponse
}
