// Cliente de Supabase para el NAVEGADOR (Client Components).
//
// Se usa en componentes que corren en el navegador del usuario, marcados con
// "use client" (formularios de login, botones que registran un gasto, etc.).
//
// Usa las variables NEXT_PUBLIC_* del .env.local. El prefijo NEXT_PUBLIC_
// significa que Next.js las expone al navegador; la anon key está pensada
// justamente para eso: es pública y segura, porque el RLS de la base de datos
// es lo que realmente protege los datos de cada usuario.

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
