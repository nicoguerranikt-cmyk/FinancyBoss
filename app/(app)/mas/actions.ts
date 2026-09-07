'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type UpdateProfileInput = {
  name: string
  baseIncome: number
  autoRepeatIncome: boolean
}

// manual.md §3.1: el ingreso base se puede ajustar cuando el usuario quiera,
// y el toggle de repetición vive en "Configuración" (sección 9).
export async function updateProfile(input: UpdateProfileInput): Promise<{ error?: string }> {
  const name = input.name.trim()
  if (!name) return { error: 'Ingresá tu nombre.' }
  if (name.length > 60) return { error: 'El nombre es demasiado largo.' }
  if (!(input.baseIncome > 0)) return { error: 'El ingreso debe ser mayor a 0.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { error } = await supabase
    .from('profiles')
    .update({ name, base_income: input.baseIncome, auto_repeat_income: input.autoRepeatIncome })
    .eq('id', user.id)
  if (error) {
    console.error('[updateProfile] update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos guardar los cambios. Probá de nuevo.' }
  }

  revalidatePath('/mas')
  revalidatePath('/') // el ingreso base cambia el presupuesto del Dashboard
  return {}
}
