'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { todayIn } from '@/lib/dashboard'
import { ensureMonthlyAllocation } from '@/lib/monthlyAllocation.server'
import { userFacingRpcError } from '@/lib/rpcError'
import { getUserTimeZone } from '@/lib/userTimezone.server'

export type RegisterExtraIncomeInput = {
  pillarId: string
  categoryId: string | null
  amount: number // sin signo, > 0
  description?: string
}

// Ingreso extra (manual §3.2): el usuario elige a mano a qué pilar o categoría
// va. Nunca a Gasto: Gasto son solo los gastos fijos, que no reciben ingresos.
export async function registerExtraIncome(input: RegisterExtraIncomeInput): Promise<{ error?: string }> {
  // Validación en el servidor (nunca confiamos solo en el navegador).
  if (!(input.amount > 0)) {
    return { error: 'El monto debe ser mayor a 0.' }
  }
  if (!input.pillarId) {
    return { error: 'Elige un pilar.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  }

  // El pillarId/categoryId vienen del cliente: un server action es un
  // endpoint público, así que hay que confirmar que de verdad son del
  // usuario logueado (esto además queda reforzado por las políticas RLS de
  // pillars/categories, que ya filtran por dueño).
  const { data: pillar } = await supabase
    .from('pillars')
    .select('id, name')
    .eq('id', input.pillarId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!pillar) {
    return { error: 'Pilar inválido.' }
  }
  if (pillar.name === 'gasto') {
    return { error: 'Un ingreso extra no puede ir a Gasto. Elige Ahorro o Inversión.' }
  }

  if (input.categoryId) {
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('id', input.categoryId)
      .eq('user_id', user.id)
      .eq('pillar_id', input.pillarId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!category) {
      return { error: 'Categoría inválida.' }
    }
  }

  const timeZone = await getUserTimeZone(supabase, user.id)
  const { error } = await supabase.from('transactions').insert({
    user_id: user.id,
    pillar_id: input.pillarId,
    category_id: input.categoryId,
    amount: input.amount,
    type: 'extra_income',
    description: input.description?.trim() || null,
    // Fecha en la zona horaria del usuario, no la del servidor (ver lib/dashboard.ts).
    date: todayIn(timeZone).iso,
  })

  if (error) {
    console.error('[registerExtraIncome] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos guardar el movimiento. Prueba de nuevo.' }
  }

  revalidatePath('/')
  revalidatePath('/mi-dinero')
  return {}
}

export type RegisterDailyExpenseInput = {
  // Categoría de Gasto del día a día (sin monto); null = sin categoría.
  categoryId: string | null
  amount: number // sin signo, > 0
  description?: string
  // De dónde sale la plata: Dinero libre, o una categoría de Ahorro.
  source: 'libre' | 'ahorro'
  sourceCategoryId?: string | null
}

// Gasto del día a día (migración 0041): no tiene presupuesto propio ni baja el
// saldo de Gasto — la plata sale de Dinero libre o de una categoría de Ahorro,
// a elección del usuario en cada gasto. Si el origen no alcanza, se rechaza.
// Todo corre en una función de la base: el gasto en su categoría y la baja del
// origen se guardan juntos, y dos gastos simultáneos no usan el mismo saldo.
export async function registerDailyExpense(input: RegisterDailyExpenseInput): Promise<{ error?: string }> {
  if (!(input.amount > 0)) {
    return { error: 'El monto debe ser mayor a 0.' }
  }
  if (input.source !== 'libre' && input.source !== 'ahorro') {
    return { error: 'Elige de dónde sale la plata.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  }

  const timeZone = await getUserTimeZone(supabase, user.id)
  const { error } = await supabase.rpc('register_daily_expense', {
    p_category_id: input.categoryId,
    p_amount: input.amount,
    p_description: input.description?.trim() || null,
    p_source: input.source,
    p_source_category_id: input.source === 'ahorro' ? (input.sourceCategoryId ?? null) : null,
    p_date: todayIn(timeZone).iso,
  })
  if (error) {
    console.error('[registerDailyExpense] rpc error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: userFacingRpcError(error, 'No pudimos guardar el gasto. Prueba de nuevo.') }
  }

  revalidatePath('/')
  revalidatePath('/mi-dinero')
  revalidatePath('/mi-dinero/libre')
  revalidatePath('/mi-dinero/[pillarId]', 'page')
  revalidatePath('/mi-dinero/[pillarId]/[categoryId]', 'page')
  return {}
}

// "Reajustar automáticamente" del aviso de ingreso insuficiente (manual
// §2.1): el usuario pide, con un botón, que el reparto de este mes se genere
// con los pilares reducidos proporcionalmente al ingreso confirmado. Solo
// afecta este mes — los montos configurados en Mi Dinero no se tocan. Si el
// reparto ya existe, no hace nada (ensureMonthlyAllocation es idempotente).
export async function reduceAllocationToIncome(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  await ensureMonthlyAllocation(supabase, user.id, { reduceToIncome: true })

  revalidatePath('/')
  revalidatePath('/mi-dinero')
  revalidatePath('/mi-dinero/[pillarId]', 'page')
  revalidatePath('/mi-dinero/[pillarId]/[categoryId]', 'page')
  return {}
}
