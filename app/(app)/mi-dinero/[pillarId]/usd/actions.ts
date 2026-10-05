'use server'

// Ahorro en USD (migración 0027, fase 1): un solo pozo en dólares, sin
// categorías propias. Depositar no toca nada de Bs. Convertir sí: resta del
// pozo en USD y suma un ingreso normal en Bs a la categoría de Ahorro que
// el usuario elija, con el tipo de cambio que él mismo declara en ese
// momento (nunca automático).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

function revalidateUsd(pillarId: string) {
  revalidatePath(`/mi-dinero/${pillarId}/usd`)
  revalidatePath(`/mi-dinero/${pillarId}`)
  revalidatePath('/mi-dinero')
}

export async function depositUsdSavings(input: {
  pillarId: string
  amountUsd: number
  description?: string
  date?: string
}): Promise<{ error?: string }> {
  if (!(input.amountUsd > 0)) {
    return { error: 'Ingresa un monto mayor a 0.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { error } = await supabase.from('usd_savings_transactions').insert({
    user_id: user.id,
    amount_usd: input.amountUsd,
    description: input.description?.trim() || null,
    ...(input.date ? { date: input.date } : {}),
  })
  if (error) {
    console.error('[depositUsdSavings] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos registrar el depósito. Prueba de nuevo.' }
  }

  revalidateUsd(input.pillarId)
  return {}
}

export async function convertUsdSavingsToBs(input: {
  pillarId: string
  amountUsd: number
  bsAmount: number
  categoryId: string
  description?: string
  date?: string
}): Promise<{ error?: string }> {
  if (!(input.amountUsd > 0)) return { error: 'Ingresa cuántos dólares conviertes.' }
  if (!(input.bsAmount > 0)) return { error: 'Ingresa a cuántos bolivianos equivalen.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  // Las dos filas (resta del pozo en USD + ingreso en Bs) se escriben
  // atómicamente adentro de convert_usd_savings_to_bs (migración 0027) —
  // las dos quedan o ninguna, nunca a medias.
  const { error } = await supabase.rpc('convert_usd_savings_to_bs', {
    p_amount_usd: input.amountUsd,
    p_bs_amount: input.bsAmount,
    p_category_id: input.categoryId,
    p_description: input.description?.trim() || `Conversión de ${input.amountUsd} USD`,
    p_date: input.date ?? null,
  })
  if (error) {
    console.error('[convertUsdSavingsToBs] rpc error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: error.message || 'No pudimos registrar la conversión. Prueba de nuevo.' }
  }

  revalidateUsd(input.pillarId)
  revalidatePath('/')
  return {}
}
