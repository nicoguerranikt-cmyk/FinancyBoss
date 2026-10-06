'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { todayIn, type PillarName } from '@/lib/dashboard'
import { getUserTimeZone } from '@/lib/userTimezone.server'
import { EPSILON } from '@/lib/domino'
import { isFixedExpenseScheduled, lastFixedExpenseOccurrence } from '@/lib/fixedExpense'
import { validateRecurrenceSchedule, type RecurrenceUnit } from '@/lib/recurrence'

const PILLAR_NAMES: PillarName[] = ['ahorro', 'gasto', 'inversion']

// Distribución de pilares (migración 0020): cada pilar tiene un monto fijo
// en Bs, no un %. La única regla es que los 3 montos no sumen más que el
// ingreso base — "no se puede fabricar plata de la nada". Pueden sumar
// MENOS: lo que sobra es dinero libre (ver lib/dashboard.ts computeDashboard,
// campo freeMoney). No hay RPC/transacción acá: son 3 filas fijas de un
// solo usuario, cada update es atómico por sí solo — el peor caso de una
// falla parcial es que el usuario reintente, no vale la pena una migración
// nueva para esto.
export async function updatePillarAmounts(input: {
  ahorro: number
  gasto: number
  inversion: number
}): Promise<{ error?: string }> {
  for (const key of PILLAR_NAMES) {
    if (!(input[key] >= 0)) {
      return { error: 'Los montos no pueden ser negativos.' }
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('base_income')
    .eq('id', user.id)
    .single()
  const baseIncome = profile?.base_income ?? 0
  const total = input.ahorro + input.gasto + input.inversion
  if (total > baseIncome + EPSILON) {
    return { error: `Esos montos suman ${total} Bs, más que tu ingreso de ${baseIncome} Bs.` }
  }

  // No confiamos en ids que vengan del cliente para esto: resolvemos
  // nosotros mismos qué fila es cada pilar del usuario logueado.
  const { data: pillars } = await supabase
    .from('pillars')
    .select('id, name')
    .eq('user_id', user.id)
  const idByName = Object.fromEntries(
    (pillars ?? []).map((p) => [p.name, p.id])
  ) as Record<PillarName, string | undefined>
  if (!idByName.ahorro || !idByName.gasto || !idByName.inversion) {
    return { error: 'No pudimos encontrar tus 3 pilares. Recarga la página.' }
  }

  for (const key of PILLAR_NAMES) {
    const { error } = await supabase
      .from('pillars')
      .update({ monthly_amount: input[key] })
      .eq('id', idByName[key])
      .eq('user_id', user.id)
    if (error) {
      console.error('[updatePillarAmounts] update error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        pillar: key,
      })
      return { error: 'No pudimos guardar los montos. Prueba de nuevo.' }
    }
  }

  revalidatePath('/mi-dinero')
  revalidatePath('/mi-dinero/[pillarId]', 'page')
  revalidatePath('/') // el Dashboard usa monthly_amount para calcular el budget de cada pilar
  return {}
}

export async function createCategory(input: {
  pillarId: string
  name: string
  // Opcional: crea la categoría ya con su monto (Ahorro/Inversión) o como
  // gasto fijo (pantalla "Gastos fijos"), en vez de nacer sin monto y tener
  // que asignárselo después desde su Configuración. Migración 0023: aplica
  // a cualquier pilar, no solo Gasto.
  fixedAmount?: number
}): Promise<{ error?: string }> {
  const name = input.name.trim()
  if (!name) {
    return { error: 'Ingresa un nombre para la categoría.' }
  }
  if (name.length > 60) {
    return { error: 'El nombre es demasiado largo.' }
  }
  if (input.fixedAmount !== undefined && !(input.fixedAmount >= 0)) {
    return { error: 'El monto debe ser mayor o igual a 0.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  }

  const { data: pillar } = await supabase
    .from('pillars')
    .select('id')
    .eq('id', input.pillarId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!pillar) {
    return { error: 'Pilar inválido.' }
  }

  const { error } = await supabase.from('categories').insert({
    user_id: user.id,
    pillar_id: input.pillarId,
    name,
    fixed_amount: input.fixedAmount ?? null,
    auto_repeat: false,
  })
  if (error) {
    console.error('[createCategory] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos crear la categoría. Prueba de nuevo.' }
  }

  revalidatePath('/mi-dinero')
  revalidatePath('/mi-dinero/[pillarId]', 'page')
  if (input.fixedAmount !== undefined) {
    revalidatePath('/') // fixed_amount se resta del saldo del pilar y del presupuesto diario
  }
  return {}
}

export type UpdateCategoryInput = {
  categoryId: string
  name?: string
  fixedAmount?: number | null
  autoRepeat?: boolean
  // Requerido cuando autoRepeat se manda en true — reemplaza el viejo "una
  // vez al mes, el día 1" por una fecha real + cada cuántos días/meses
  // (mismo mecanismo que el plan de pago automático de Deudas). reserveAhead
  // es la elección "¿se reserva del presupuesto desde ya, o recién cuando
  // llega la fecha?" (ver migración 0018 y lib/fixedExpense.ts).
  fixedSchedule?: {
    startDate: string
    intervalUnit: RecurrenceUnit
    intervalCount: number
    reserveAhead: boolean
  }
  // Ahorro con propósito (migración 0022): meta + fecha van juntas, igual
  // que fixedSchedule arriba — null borra la meta (los dos campos a la vez,
  // nunca uno solo).
  savingsGoal?: { amount: number; targetDate: string } | null
}

// Una sola acción para nombre/monto/gasto fijo: el cliente arma el patch con
// solo los campos que cambiaron en la fila, en vez de varias llamadas
// separadas.
export async function updateCategory(input: UpdateCategoryInput): Promise<{ error?: string }> {
  const patch: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) return { error: 'Ingresa un nombre para la categoría.' }
    if (name.length > 60) return { error: 'El nombre es demasiado largo.' }
    patch.name = name
  }

  const touchesFixed = input.fixedAmount !== undefined || input.autoRepeat !== undefined

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  }

  if (touchesFixed) {
    if (input.fixedAmount !== undefined && input.fixedAmount !== null && !(input.fixedAmount >= 0)) {
      return { error: 'El monto debe ser mayor o igual a 0.' }
    }

    // Doble consulta (categoría → pilar) en vez de un embedded select, para
    // seguir el mismo patrón que resolveDeficit en app/(app)/actions.ts.
    const { data: category } = await supabase
      .from('categories')
      .select('id, pillar_id, is_general')
      .eq('id', input.categoryId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!category) {
      return { error: 'Categoría inválida.' }
    }
    if (category.is_general) {
      return { error: 'La categoría general no tiene un monto propio — recibe automáticamente lo que sobra.' }
    }

    const { data: pillar } = await supabase
      .from('pillars')
      .select('name')
      .eq('id', category.pillar_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!pillar) {
      return { error: 'Categoría inválida.' }
    }
    // Migración 0023: el monto fijo aplica a cualquier pilar (antes solo a
    // Gasto). Auto-descontarse solo en una fecha sigue siendo exclusivo de
    // Gasto — un aporte a Ahorro/Inversión no tiene ese concepto.
    if (input.autoRepeat && pillar.name !== 'gasto') {
      return { error: 'Descontar automáticamente solo aplica a categorías del pilar Gasto.' }
    }

    if (input.fixedAmount !== undefined) patch.fixed_amount = input.fixedAmount
    // Sin monto fijo, "descontar automáticamente" no tiene sentido: se
    // apaga solo y se borra la fecha/frecuencia configurada.
    if (input.fixedAmount === null) {
      patch.auto_repeat = false
      patch.fixed_start_date = null
      patch.fixed_interval_unit = null
      patch.fixed_interval_count = null
    } else if (input.autoRepeat !== undefined) {
      patch.auto_repeat = input.autoRepeat
      if (input.autoRepeat) {
        if (!input.fixedSchedule) {
          return { error: 'Elige la fecha y la frecuencia del gasto fijo.' }
        }
        const scheduleError = validateRecurrenceSchedule(input.fixedSchedule)
        if (scheduleError) return { error: scheduleError }
        patch.fixed_start_date = input.fixedSchedule.startDate
        patch.fixed_interval_unit = input.fixedSchedule.intervalUnit
        patch.fixed_interval_count = input.fixedSchedule.intervalCount
        patch.fixed_reserve_ahead = input.fixedSchedule.reserveAhead
      } else {
        patch.fixed_start_date = null
        patch.fixed_interval_unit = null
        patch.fixed_interval_count = null
      }
    }
  }

  if (input.savingsGoal !== undefined) {
    if (input.savingsGoal !== null && !(input.savingsGoal.amount > 0)) {
      return { error: 'La meta de ahorro debe ser mayor a 0.' }
    }
    if (input.savingsGoal !== null && !input.savingsGoal.targetDate) {
      return { error: 'Elige una fecha para tu meta de ahorro.' }
    }

    const { data: category } = await supabase
      .from('categories')
      .select('id, pillar_id')
      .eq('id', input.categoryId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!category) return { error: 'Categoría inválida.' }

    const { data: pillar } = await supabase
      .from('pillars')
      .select('name')
      .eq('id', category.pillar_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!pillar || pillar.name !== 'ahorro') {
      return { error: 'La meta de ahorro solo aplica a categorías del pilar Ahorro.' }
    }

    patch.goal_amount = input.savingsGoal?.amount ?? null
    patch.goal_target_date = input.savingsGoal?.targetDate ?? null
  }

  if (Object.keys(patch).length === 0) {
    return {}
  }

  const { error } = await supabase
    .from('categories')
    .update(patch)
    .eq('id', input.categoryId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
  if (error) {
    console.error('[updateCategory] update error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos guardar los cambios. Prueba de nuevo.' }
  }

  revalidatePath('/mi-dinero')
  revalidatePath('/mi-dinero/[pillarId]', 'page')
  revalidatePath('/mi-dinero/[pillarId]/[categoryId]', 'page')
  if (input.fixedAmount !== undefined) {
    revalidatePath('/') // fixed_amount se resta del saldo del pilar y del presupuesto diario
  }
  return {}
}

export async function deleteCategory(input: { categoryId: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  }

  // La categoría "general" de un pilar nunca se borra: es el balde de
  // respaldo del reparto mensual (ver migración 0015). Revalidado acá aunque
  // el cliente ya oculte el botón.
  const { data: category } = await supabase
    .from('categories')
    .select('is_general')
    .eq('id', input.categoryId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!category) return { error: 'Categoría inválida.' }
  if (category.is_general) {
    return { error: 'La categoría general de un pilar no se puede borrar.' }
  }

  const { error } = await supabase
    .from('categories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', input.categoryId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
  if (error) {
    console.error('[deleteCategory] soft-delete error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos eliminar la categoría. Prueba de nuevo.' }
  }

  revalidatePath('/mi-dinero')
  revalidatePath('/mi-dinero/[pillarId]', 'page')
  revalidatePath('/mi-dinero/[pillarId]/[categoryId]', 'page')
  revalidatePath('/') // desaparece del selector de QuickAddForm y, si tenía fixed_amount, cambia el presupuesto
  return {}
}

// Ahorro con propósito (migración 0022) e Inversión: registrar plata que el
// usuario ya tenía (ahorrada o invertida) antes de usar la app, para que
// cuente en el acumulado — sin esto, el "Monto (Bs)" de Configuración (el
// aporte MENSUAL del reparto) queda como la única cifra, y no hay dónde
// cargar lo que ya existía. Es un ingreso extra común y corriente (mismo
// tipo que QuickAddForm) con una descripción fija para poder identificarlo
// en el historial — no una tabla ni un mecanismo nuevo.
async function registerPastAmount(input: {
  categoryId: string
  amount: number
  date?: string
  pillarName: 'ahorro' | 'inversion'
  description: string
}): Promise<{ error?: string }> {
  if (!(input.amount > 0)) {
    return { error: 'Ingresa un monto mayor a 0.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  }

  const { data: category } = await supabase
    .from('categories')
    .select('id, pillar_id')
    .eq('id', input.categoryId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!category) return { error: 'Categoría inválida.' }

  const { data: pillar } = await supabase
    .from('pillars')
    .select('name')
    .eq('id', category.pillar_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!pillar || pillar.name !== input.pillarName) {
    return { error: `Esto solo aplica a categorías del pilar ${input.pillarName === 'ahorro' ? 'Ahorro' : 'Inversión'}.` }
  }

  const { error } = await supabase.from('transactions').insert({
    user_id: user.id,
    pillar_id: category.pillar_id,
    category_id: category.id,
    amount: input.amount,
    type: 'extra_income',
    description: input.description,
    // Plata que ya tenías al empezar: sube el acumulado pero NO es un ingreso
    // del mes (Estadísticas lo deja afuera, migración 0037).
    kind: 'opening_balance',
    ...(input.date ? { date: input.date } : {}),
  })
  if (error) {
    console.error('[registerPastAmount] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos registrarlo. Prueba de nuevo.' }
  }

  revalidatePath('/mi-dinero')
  revalidatePath('/mi-dinero/[pillarId]', 'page')
  revalidatePath('/mi-dinero/[pillarId]/[categoryId]', 'page')
  revalidatePath('/')
  return {}
}

export async function registerPastSavings(input: { categoryId: string; amount: number; date?: string }) {
  return registerPastAmount({ ...input, pillarName: 'ahorro', description: 'Ahorro previo' })
}

export async function registerPastInvestment(input: { categoryId: string; amount: number; date?: string }) {
  return registerPastAmount({ ...input, pillarName: 'inversion', description: 'Inversión previa' })
}

// Retorno de inversión: la ganancia de una inversión puntual puede ir a 3
// lados (pedido del usuario) — nunca se "inventa" un mecanismo nuevo de
// plata, reusa lo que ya existe:
//   - 'free_money': cae en dinero libre (free_money_transactions), como
//     cualquier otro ingreso sin destino específico.
//   - 'reinvest': ingreso extra a la MISMA categoría de Inversión — aumenta
//     el capital acumulado de esa inversión puntual.
//   - 'ahorro': ingreso extra a una categoría de Ahorro que el usuario
//     elige (ej. si se armó una categoría "Ganancias" ahí).
export async function registerInvestmentReturn(input: {
  sourceCategoryId: string
  amount: number
  description?: string
  date?: string
  destination: { type: 'free_money' } | { type: 'reinvest' } | { type: 'ahorro'; categoryId: string }
}): Promise<{ error?: string }> {
  if (!(input.amount > 0)) {
    return { error: 'Ingresa un monto mayor a 0.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  }

  const { data: sourceCategory } = await supabase
    .from('categories')
    .select('id, pillar_id, name')
    .eq('id', input.sourceCategoryId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!sourceCategory) return { error: 'Categoría inválida.' }

  const { data: pillar } = await supabase
    .from('pillars')
    .select('name')
    .eq('id', sourceCategory.pillar_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!pillar || pillar.name !== 'inversion') {
    return { error: 'Esto solo aplica a categorías del pilar Inversión.' }
  }

  const description = input.description?.trim() || `Retorno de ${sourceCategory.name}`

  if (input.destination.type === 'free_money') {
    const { error } = await supabase.from('free_money_transactions').insert({
      user_id: user.id,
      amount: input.amount,
      description,
      ...(input.date ? { date: input.date } : {}),
    })
    if (error) {
      console.error('[registerInvestmentReturn] free money insert error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        input,
      })
      return { error: 'No pudimos registrar el retorno. Prueba de nuevo.' }
    }
  } else {
    let destCategoryId: string
    let destPillarId: string

    if (input.destination.type === 'reinvest') {
      destCategoryId = sourceCategory.id
      destPillarId = sourceCategory.pillar_id
    } else {
      // Nunca confiamos en el id que llega del cliente sin revalidar: la
      // categoría destino tiene que ser una categoría de Ahorro real del
      // usuario.
      const { data: destCategory } = await supabase
        .from('categories')
        .select('id, pillar_id')
        .eq('id', input.destination.categoryId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle()
      if (!destCategory) return { error: 'Categoría de destino inválida.' }

      const { data: destPillar } = await supabase
        .from('pillars')
        .select('name')
        .eq('id', destCategory.pillar_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!destPillar || destPillar.name !== 'ahorro') {
        return { error: 'Elige una categoría de Ahorro como destino.' }
      }
      destCategoryId = destCategory.id
      destPillarId = destCategory.pillar_id
    }

    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      pillar_id: destPillarId,
      category_id: destCategoryId,
      amount: input.amount,
      type: 'extra_income',
      description,
      ...(input.date ? { date: input.date } : {}),
    })
    if (error) {
      console.error('[registerInvestmentReturn] transaction insert error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        input,
      })
      return { error: 'No pudimos registrar el retorno. Prueba de nuevo.' }
    }
  }

  revalidatePath('/mi-dinero')
  revalidatePath('/mi-dinero/[pillarId]', 'page')
  revalidatePath('/mi-dinero/[pillarId]/[categoryId]', 'page')
  revalidatePath('/mi-dinero/libre')
  revalidatePath('/')
  return {}
}

// Confirma la cuota de este mes de un gasto fijo con descuento automático
// (manual §4.2/§5.5): es un RECORDATORIO, igual que el plan de pago
// automático de Deudas (ver confirmAutoPayment en app/(app)/deudas/actions.ts)
// — nunca se descuenta solo por haber llegado la fecha. Recién acá, cuando
// el usuario toca "Ya lo pagué", se registra el gasto de verdad. Se fecha en
// la fecha real del vencimiento (no "hoy"), para que el historial quede
// prolijo aunque el usuario confirme unos días después.
export async function confirmFixedExpense(input: { categoryId: string }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { data: category } = await supabase
    .from('categories')
    .select(
      'id, pillar_id, fixed_amount, auto_repeat, fixed_start_date, fixed_interval_unit, fixed_interval_count'
    )
    .eq('id', input.categoryId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!category) return { error: 'Categoría inválida.' }

  const { data: pillar } = await supabase
    .from('pillars')
    .select('name')
    .eq('id', category.pillar_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!pillar || pillar.name !== 'gasto') {
    return { error: 'Esto solo aplica a categorías del pilar Gasto.' }
  }

  // No confiamos en que el cliente solo muestre el botón cuando corresponde.
  if (!category.auto_repeat || !isFixedExpenseScheduled(category) || category.fixed_amount === null) {
    return { error: 'Esta categoría no tiene un plan automático.' }
  }
  const timeZone = await getUserTimeZone(supabase, user.id)
  const dueDate = lastFixedExpenseOccurrence(category, todayIn(timeZone))
  if (!dueDate) return { error: 'Todavía no te toca confirmar este gasto.' }

  // Solo un gasto (amount < 0) cuenta como "ya pagado": un reparto o ingreso
  // extra posterior al vencimiento no. Se usa limit(1) y no maybeSingle():
  // con más de una fila que coincida, maybeSingle() da error y existing
  // quedaría vacío, dejando pasar un pago duplicado.
  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('category_id', category.id)
    .eq('user_id', user.id)
    .lt('amount', 0)
    .gte('date', dueDate)
    .limit(1)
  if (existing && existing.length > 0) return { error: 'Ya confirmaste este gasto.' }

  const { error } = await supabase.from('transactions').insert({
    user_id: user.id,
    pillar_id: category.pillar_id,
    category_id: category.id,
    amount: -(category.fixed_amount as number),
    type: 'expense',
    description: null,
    date: dueDate,
  })
  if (error) {
    console.error('[confirmFixedExpense] insert error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: 'No pudimos registrar el pago. Prueba de nuevo.' }
  }

  revalidatePath('/mi-dinero')
  revalidatePath('/mi-dinero/[pillarId]', 'page')
  revalidatePath('/mi-dinero/[pillarId]/fijos', 'page')
  revalidatePath('/mi-dinero/[pillarId]/[categoryId]', 'page')
  revalidatePath('/')
  return {}
}

// Aumentar el presupuesto de un gasto fijo por este mes puntual (sin tocar
// su monto fijo permanente, que sigue igual el mes que viene). Existe
// porque "ingreso extra" ya NO puede apuntar a Gasto (Gasto solo registra
// gastos) — esta es la única vía para meterle más presupuesto a una
// categoría de Gasto, y por eso vive acá, acotada a gastos fijos
// puntuales, en vez de ser un destino más en el formulario genérico.
//
// La plata tiene que salir de algún lado real, elegido a propósito por el
// usuario — nunca se fabrica sola (migración 0031):
//   - "disponible": reutiliza allocate_free_money_to_category (migración
//     0028), que ya acepta cualquier categoría como destino, Gasto incluido.
//   - "ahorro": fund_fixed_expense_from_savings (migración 0031), debita esa
//     categoría de Ahorro puntual y valida que tenga saldo suficiente.
export async function bumpFixedExpenseThisMonth(input: {
  categoryId: string
  amount: number
  source: 'disponible' | 'ahorro'
  // Requerido cuando source es "ahorro": de qué categoría de Ahorro sale la plata.
  sourceCategoryId?: string
}): Promise<{ error?: string }> {
  if (!(input.amount > 0)) {
    return { error: 'Ingresa un monto mayor a 0.' }
  }
  if (input.source === 'ahorro' && !input.sourceCategoryId) {
    return { error: 'Elige de qué ahorro sale la plata.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }

  const { data: category } = await supabase
    .from('categories')
    .select('id, pillar_id, fixed_amount')
    .eq('id', input.categoryId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!category) return { error: 'Categoría inválida.' }
  if (category.fixed_amount === null) {
    return { error: 'Esto solo aplica a gastos fijos.' }
  }

  const { data: pillar } = await supabase
    .from('pillars')
    .select('name')
    .eq('id', category.pillar_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!pillar || pillar.name !== 'gasto') {
    return { error: 'Esto solo aplica a categorías del pilar Gasto.' }
  }

  const { error } =
    input.source === 'disponible'
      ? await supabase.rpc('allocate_free_money_to_category', {
          p_amount: input.amount,
          p_category_id: input.categoryId,
          p_description: 'Aumento puntual de este mes (desde Dinero libre)',
          p_date: null,
        })
      : await supabase.rpc('fund_fixed_expense_from_savings', {
          p_gasto_category_id: input.categoryId,
          p_ahorro_category_id: input.sourceCategoryId,
          p_amount: input.amount,
          p_description: null,
        })
  if (error) {
    console.error('[bumpFixedExpenseThisMonth] rpc error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      input,
    })
    return { error: error.message || 'No pudimos registrar el aumento. Prueba de nuevo.' }
  }

  revalidatePath('/mi-dinero')
  revalidatePath('/mi-dinero/[pillarId]', 'page')
  revalidatePath('/mi-dinero/[pillarId]/[categoryId]', 'page')
  revalidatePath('/mi-dinero/libre')
  revalidatePath('/')
  return {}
}
