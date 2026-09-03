// Cliente de Supabase para el SERVIDOR (Server Components, Route Handlers,
// Server Actions).
//
// Se usa en el código que corre en el servidor, no en el navegador. Necesita
// leer y escribir las cookies de sesión para saber qué usuario está logueado.
//
// Importante (Next.js 15+/16): cookies() es ASÍNCRONO, por eso esta función es
// async y hay que llamarla con await:  const supabase = await createClient()

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll puede fallar si se llama desde un Server Component (que no
            // puede escribir cookies). Es seguro ignorarlo cuando el refresco de
            // sesión lo maneja el middleware. Lo agregaremos al armar la auth.
          }
        },
      },
    }
  )
}
