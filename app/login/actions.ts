'use server'

// Server Actions de sesión. "use server" hace que TODO este archivo corra solo
// en el servidor: el navegador nunca ve esta lógica ni la contraseña en claro.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Forma del estado que useActionState muestra en el formulario.
export type AuthState = { error?: string } | undefined

// Solo rutas internas: tiene que empezar con "/" y no con "//" ni "/\" (esas
// dos son formas de meter una URL externa ahí — "open redirect" — que un
// navegador puede interpretar como protocol-relative a otro host).
function safeNextPath(value: FormDataEntryValue | null): string {
  const path = typeof value === 'string' ? value : ''
  if (path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\')) {
    return path
  }
  return '/'
}

export async function login(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = safeNextPath(formData.get('next'))

  if (!email || !password) {
    return { error: 'Completa tu email y contraseña.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // No damos pistas de si el email existe o no (buena práctica de seguridad).
    return { error: 'Email o contraseña incorrectos.' }
  }

  // Limpia el cache de la app para que cargue con la sesión nueva.
  revalidatePath('/', 'layout')
  redirect(next)
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
