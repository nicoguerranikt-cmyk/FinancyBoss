'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type PillarKey = 'ahorro' | 'gasto' | 'inversion'

export type OnboardingInput = {
  income: number
  autoRepeat: boolean
  pillars: { ahorro: number; gasto: number; inversion: number }
  categories: { pillar: PillarKey; name: string }[]
}

export async function completeOnboarding(
  input: OnboardingInput
): Promise<{ error?: string } | void> {
  // Validación en el servidor (nunca confiamos solo en el navegador).
  if (!(input.income > 0)) {
    return { error: 'El ingreso debe ser mayor a 0.' }
  }
  const sum =
    input.pillars.ahorro + input.pillars.gasto + input.pillars.inversion
  if (Math.round(sum) !== 100) {
    return { error: 'Los porcentajes de los pilares deben sumar 100%.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }
  }

  // El nombre lo tomamos de los metadatos del usuario (guardados en el registro)
  // y se lo pasamos a la función. Así la función NO necesita leer auth.users.
  const name =
    (user.user_metadata?.name as string | undefined)?.trim() ||
    user.email ||
    'Usuario'

  // Llamamos a la función de Postgres que guarda todo en una transacción.
  const { error } = await supabase.rpc('complete_onboarding', {
    p_income: input.income,
    p_auto_repeat: input.autoRepeat,
    p_name: name,
    p_ahorro_pct: input.pillars.ahorro,
    p_gasto_pct: input.pillars.gasto,
    p_inversion_pct: input.pillars.inversion,
    p_categories: input.categories,
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
    return { error: 'No pudimos guardar tu configuración. Probá de nuevo.' }
  }

  // Limpiamos el cache y entramos al dashboard.
  revalidatePath('/', 'layout')
  redirect('/')
}
