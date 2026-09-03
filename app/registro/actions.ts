'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type SignupState = { error?: string; message?: string } | undefined

export async function signup(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  // Validación simple del lado del servidor (más adelante podemos usar Zod).
  if (name.length < 2) {
    return { error: 'El nombre debe tener al menos 2 caracteres.' }
  }
  if (!email.includes('@')) {
    return { error: 'Ingresá un email válido.' }
  }
  if (password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Guardamos el nombre en los metadatos del usuario. El perfil (tabla
    // profiles) se creará en el onboarding, con el ingreso y los pilares.
    options: { data: { name } },
  })

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      return { error: 'Ya existe una cuenta con ese email.' }
    }
    return { error: 'No pudimos crear la cuenta. Probá de nuevo.' }
  }

  // Si Supabase tiene activada la confirmación por email, todavía no hay sesión.
  if (!data.session) {
    return {
      message:
        'Te enviamos un email para confirmar tu cuenta. Revisá tu bandeja y luego iniciá sesión.',
    }
  }

  // Confirmación desactivada: ya quedó logueado.
  revalidatePath('/', 'layout')
  redirect('/')
}
