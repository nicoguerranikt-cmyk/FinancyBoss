'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type SignupState = { error?: string; message?: string } | undefined

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/

export async function signup(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  // El input se llama "handle" (no "username") a propósito: Chrome asocia el
  // literal "username" con un campo de login y mezcla el autocompletado con
  // el formulario de contraseñas guardadas.
  const usernameInput = String(formData.get('handle') ?? '').trim().toLowerCase()

  // Validación simple del lado del servidor (más adelante podemos usar Zod).
  if (name.length < 2) {
    return { error: 'El nombre debe tener al menos 2 caracteres.' }
  }
  if (!email.includes('@')) {
    return { error: 'Ingresa un email válido.' }
  }
  if (password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' }
  }
  if (usernameInput && !USERNAME_PATTERN.test(usernameInput)) {
    return { error: 'El nombre de usuario debe tener 3-20 caracteres: letras, números o guión bajo.' }
  }

  const supabase = await createClient()

  // Username es opcional, pero si lo eligió lo chequeamos ANTES de crear la
  // cuenta (migración 0029: is_username_taken es de lectura pública porque
  // acá todavía no hay sesión).
  if (usernameInput) {
    const { data: taken, error: checkError } = await supabase.rpc('is_username_taken', {
      p_username: usernameInput,
    })
    if (checkError) {
      console.error('[signup] is_username_taken error:', checkError)
      return { error: 'No pudimos validar el nombre de usuario. Prueba de nuevo.' }
    }
    if (taken) {
      return { error: 'Ese nombre de usuario ya está en uso. Prueba con otro.' }
    }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Guardamos nombre y username en los metadatos del usuario. El perfil
    // (tabla profiles) se crea recién en el onboarding (completeOnboarding
    // los lee de acá y se los pasa a complete_onboarding).
    options: { data: { name, username: usernameInput || null } },
  })

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      return { error: 'Ya existe una cuenta con ese email.' }
    }
    return { error: 'No pudimos crear la cuenta. Prueba de nuevo.' }
  }

  // Si Supabase tiene activada la confirmación por email, todavía no hay sesión.
  if (!data.session) {
    return {
      message:
        'Te enviamos un email para confirmar tu cuenta. Revisa tu bandeja y luego inicia sesión.',
    }
  }

  // Confirmación desactivada: ya quedó logueado.
  revalidatePath('/', 'layout')
  redirect('/')
}
