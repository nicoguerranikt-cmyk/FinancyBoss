'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type PillarKey = 'ahorro' | 'gasto' | 'inversion'

export type OnboardingInput = {
  income: number
  autoRepeat: boolean
  // Migración 0030: ya no se pide un monto por pilar aparte — el monto de
  // cada pilar sale de sumar el de sus categorías (amount ausente o 0 = sin
  // monto fijo, queda como bolsa variable de ese pilar).
  categories: { pillar: PillarKey; name: string; amount?: number }[]
}

export async function completeOnboarding(
  input: OnboardingInput
): Promise<{ error?: string } | void> {
  // Validación en el servidor (nunca confiamos solo en el navegador).
  if (!(input.income > 0)) {
    return { error: 'El ingreso debe ser mayor a 0.' }
  }
  if (input.categories.some((c) => c.amount !== undefined && c.amount < 0)) {
    return { error: 'Los montos de las categorías no pueden ser negativos.' }
  }
  // "No se puede fabricar plata de la nada": la suma de los montos puede ser
  // menor que el ingreso (el resto queda como dinero libre), pero nunca más.
  const sum = input.categories.reduce((acc, c) => acc + (c.amount && c.amount > 0 ? c.amount : 0), 0)
  if (sum > input.income) {
    return { error: `Esos montos suman ${sum} Bs, más que tu ingreso de ${input.income} Bs.` }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  }

  // El nombre y el username los tomamos de los metadatos del usuario
  // (guardados en /registro, migración 0029) y se los pasamos a la función.
  // Así la función NO necesita leer auth.users.
  const name =
    (user.user_metadata?.name as string | undefined)?.trim() ||
    user.email ||
    'Usuario'
  const username = (user.user_metadata?.username as string | undefined)?.trim() || null

  // Llamamos a la función de Postgres que guarda todo en una transacción.
  const { error } = await supabase.rpc('complete_onboarding', {
    p_income: input.income,
    p_auto_repeat: input.autoRepeat,
    p_name: name,
    p_categories: input.categories,
    p_username: username,
  })

  if (error) {
    // Log detallado en la terminal del server para diagnosticar.
    console.error('[completeOnboarding] RPC error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      categoriesEnviadas: input.categories,
    })
    return { error: 'No pudimos guardar tu configuración. Prueba de nuevo.' }
  }

  // Limpiamos el cache y entramos al dashboard.
  revalidatePath('/', 'layout')
  redirect('/')
}
