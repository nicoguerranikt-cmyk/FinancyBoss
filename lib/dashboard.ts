// Lógica del Dashboard (manual.md v2.0, secciones 3.4, 4.1, 4.2, 5). Sin
// imports de Supabase a propósito: recibe filas ya leídas y devuelve
// números, así se puede revisar/probar aislado de la base de datos.

export type PillarName = 'ahorro' | 'gasto' | 'inversion'

export type PillarRow = { id: string; name: PillarName; monthly_amount: number }
// date es opcional: computeDashboard no la usa, pero actions.ts la necesita
// para separar "transacciones de antes de hoy" de "hasta hoy" (Caso 1).
// is_allocation: un depósito del reparto mensual (ver lib/monthlyAllocation.server.ts) ya está contado
// en `budget` más abajo, así que se excluye de "movimientos" para no sumarlo
// dos veces. Un gasto fijo (categories.fixed_amount) NO tiene este mismo
// trato: su transacción se genera sola, en su fecha (ver el bloque
// "gastos fijos" en app/(app)/page.tsx), y de ahí en más es un movimiento
// normal — no se reserva por adelantado (decisión del usuario: el
// presupuesto disponible no baja hasta que de verdad toca esa cuota).
export type TransactionRow = {
  pillar_id: string
  category_id: string | null
  amount: number
  date?: string
  // Obligatorio a propósito: si una consulta se olvida de traerlo, el reparto
  // del mes se contaría como plata nueva y el saldo quedaría inflado.
  is_allocation: boolean
}

// Zona horaria por defecto: la de Bolivia (UTC-4, sin horario de verano). Es
// la que tienen los usuarios existentes; cada usuario guarda la suya en
// profiles.timezone (migración 0035) y todas las funciones de abajo la
// reciben. Nunca se usa current_date de Postgres ni new Date() a secas: el
// servidor de Supabase corre en UTC y "hoy" tiene que ser el del usuario.
export const DEFAULT_TIME_ZONE = 'America/La_Paz'

// ¿Es un nombre de zona horaria IANA que este runtime entiende? (ej.
// "America/La_Paz"). Se usa para validar lo que llega del navegador/perfil.
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone })
    return true
  } catch {
    return false
  }
}

// La zona guardada en el perfil si es válida; si falta o es inválida, la de
// Bolivia — así una fila rara nunca rompe una pantalla.
export function resolveTimeZone(timeZone: string | null | undefined): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE
}

// "Hoy" en la zona del usuario. `now` solo se pasa en los tests.
export function todayIn(
  timeZone: string = DEFAULT_TIME_ZONE,
  now: Date = new Date()
): { year: number; month: number; day: number; iso: string } {
  // 'en-CA' da directo el formato YYYY-MM-DD.
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day, iso }
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate()
}

// Igual que todayIn(), pero para convertir un Date cualquiera (ej.
// profiles.created_at) a año/mes/día en la zona del usuario.
export function dateIn(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE
): { year: number; month: number; day: number } {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone }).format(date)
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

// Diferencia (en ms) entre la hora local de la zona y UTC en un instante dado.
// Cambia durante el año en zonas con horario de verano.
function zoneOffsetMs(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const localAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return localAsUtc - Math.floor(instant.getTime() / 1000) * 1000
}

// Instante UTC en que empieza el día 1 de un mes (00:00 hora local de la zona).
function startOfMonthUtc(year: number, month: number, timeZone: string): Date {
  const localMidnightAsUtc = Date.UTC(year, month - 1, 1)
  // La diferencia con UTC puede ser otra justo en ese instante (cambio de
  // horario de verano): se recalcula una vez con el instante ya corregido.
  const first = localMidnightAsUtc - zoneOffsetMs(timeZone, new Date(localMidnightAsUtc))
  return new Date(localMidnightAsUtc - zoneOffsetMs(timeZone, new Date(first)))
}

// Rango [primer día, último día] de un mes dado (hora boliviana), para
// filtrar transactions.date en la consulta a Supabase.
export function monthRangeFor(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = daysInMonth(year, month)
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
  }
}

export function monthRangeIn(timeZone: string = DEFAULT_TIME_ZONE): { start: string; end: string } {
  const { year, month } = todayIn(timeZone)
  return monthRangeFor(year, month)
}

// Igual que monthRangeFor, pero como instantes UTC — para filtrar columnas
// timestamptz (domino_events.created_at), donde comparar strings de fecha no
// sirve. El inicio del mes es la medianoche LOCAL de la zona (en Bolivia son
// las 04:00 UTC; en zonas con horario de verano cambia según la fecha).
export function monthRangeUtcInstantFor(
  year: number,
  month: number,
  timeZone: string = DEFAULT_TIME_ZONE
): { startUtc: string; endUtc: string } {
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  return {
    startUtc: startOfMonthUtc(year, month, timeZone).toISOString(),
    endUtc: startOfMonthUtc(nextYear, nextMonth, timeZone).toISOString(),
  }
}

export function monthRangeUtcInstant(timeZone: string = DEFAULT_TIME_ZONE): { startUtc: string; endUtc: string } {
  const { year, month } = todayIn(timeZone)
  return monthRangeUtcInstantFor(year, month, timeZone)
}

export type PillarSummary = { id: string; pillar: PillarName; budget: number; carriedOver: number; saldo: number }
export type DashboardData = {
  pillars: PillarSummary[]
  dailyBudget: number
  isDeficit: boolean
  daysRemaining: number
  // Ingreso menos lo que suman los 3 pilares (migración 0020: pilares con
  // monto fijo, no %) — plata sin destino específico. Nunca negativo: si el
  // ingreso de un mes no alcanza para los montos ya configurados, queda en
  // 0 (no se "fabrica" plata) y es al usuario a quien le toca ajustar sus
  // montos, no algo que la app resuelva sola.
  freeMoney: number
}

// ¿El ingreso confirmado alcanza para los montos que ya suman los pilares?
// Es la ÚNICA fuente de este cálculo: la usan computeDashboard (presupuesto
// del mes) y el reparto a categorías (lib/monthlyAllocation.server.ts), así
// los dos siempre coinciden. Si no alcanza, `scaleFactor` (< 1) es la
// proporción en que se reducen los 3 pilares ese mes; la configuración de
// Mi Dinero nunca se modifica.
export function incomeCoverage(baseIncome: number, pillars: { monthly_amount: number }[]) {
  const committed = pillars.reduce((sum, p) => sum + p.monthly_amount, 0)
  const scaleFactor = committed > baseIncome && committed > 0 ? baseIncome / committed : 1
  const shortfall = Math.max(0, committed - baseIncome)
  return { committed, shortfall, scaleFactor, isShort: shortfall > 0.005 }
}

export function computeDashboard(input: {
  baseIncome: number
  pillars: PillarRow[]
  transactionsThisMonth: TransactionRow[]
  // Gastos fijos con "reservar desde ya" (categories.fixed_reserve_ahead,
  // migración 0018): monto prorrateado de este mes por pilar (ver
  // lib/fixedExpense.ts monthlyReserveAmount), calculado por quien llama a
  // esto. Sus transacciones (cuando se generen) se excluyen de
  // `movimientos` vía reservedCategoryIds, para no restarlas dos veces. Los
  // gastos fijos SIN "reservar desde ya" no pasan por acá: su transacción,
  // una vez generada en su fecha real, es un movimiento normal más.
  fixedReserveByPillarId?: Record<string, number>
  reservedCategoryIds?: string[]
  // Efecto dominó (manual §4.3): ajuste CON SIGNO por pilar, ya neto de todo
  // lo declarado este mes. Positivo = un pilar (Ahorro/Inversión) quedó
  // debitado por haber cubierto un déficit de Gasto. Negativo = a Gasto se
  // le acredita de vuelta esa misma plata (para que los días que quedan no
  // sigan apretados por un déficit que el usuario ya cubrió). Ver
  // lib/domino.ts — computeDominoPillarAdjustments.
  dominoPillarAdjustments?: Record<string, number>
  // Arrastre de saldo entre meses (manual §3.3): saldo que sobró/faltó en el
  // mes anterior de cada pilar. 0 si no viene (o si no hay mes anterior
  // cerrado todavía). Ver lib/monthClose.ts.
  carriedOverByPillarId?: Record<string, number>
  // "Hoy" en la zona del usuario (todayIn). Obligatorio a propósito: si una
  // llamada lo omitiera se usaría otra zona y el día/mes podría no coincidir
  // con el del resto de la app.
  today: { year: number; month: number; day: number }
}): DashboardData {
  const today = input.today
  const daysRemaining = daysInMonth(today.year, today.month) - today.day + 1
  const reservedCategoryIds = new Set(input.reservedCategoryIds ?? [])

  // Migración 0020: al configurar los montos en Mi Dinero ya se valida que
  // no sumen más que el ingreso base — pero el ingreso CONFIRMADO de un mes
  // puntual puede bajar por debajo de esos montos ya guardados (el usuario
  // no está obligado a re-ajustar sus pilares cada vez que gana menos). Acá
  // nunca se "fabrica" plata: si los 3 montos no entran en el ingreso de
  // este mes, se escalan los 3 proporcionalmente (mismo criterio que ya usa
  // computeMonthlyAllocation cuando las categorías de un pilar se pasan de
  // su presupuesto) — la configuración de Mi Dinero no se toca, solo se
  // ajusta el cálculo de este mes puntual.
  const { scaleFactor } = incomeCoverage(input.baseIncome, input.pillars)

  const pillarSummaries: PillarSummary[] = input.pillars.map((pillar) => {
    // Deudas v2 (manual §6): todo pago de deuda sale de un pilar/categoría
    // específico (transactions.debt_id), ya cubierto por `movimientos` más
    // abajo — no hay más una deducción "de ingreso total antes de repartir".
    //
    // Migración 0020: el presupuesto del pilar es un monto fijo que el
    // usuario decidió en Mi Dinero, no un % del ingreso — no se recalcula
    // solo si el ingreso cambia (salvo el escalado de shortfall de arriba).
    const budget = pillar.monthly_amount * scaleFactor

    const fixedReserve = input.fixedReserveByPillarId?.[pillar.id] ?? 0

    const movimientos = input.transactionsThisMonth
      .filter((t) => t.pillar_id === pillar.id && !t.is_allocation && !reservedCategoryIds.has(t.category_id ?? ''))
      .reduce((sum, t) => sum + t.amount, 0)

    const dominoAdjustment = input.dominoPillarAdjustments?.[pillar.id] ?? 0
    const carriedOver = input.carriedOverByPillarId?.[pillar.id] ?? 0

    return {
      id: pillar.id,
      pillar: pillar.name,
      budget,
      carriedOver,
      saldo: budget + carriedOver - fixedReserve + movimientos - dominoAdjustment,
    }
  })

  const saldoGasto = pillarSummaries.find((p) => p.pillar === 'gasto')?.saldo ?? 0
  const dailyBudget = daysRemaining > 0 ? Math.max(0, saldoGasto / daysRemaining) : 0

  const committed = input.pillars.reduce((sum, p) => sum + p.monthly_amount, 0)
  const freeMoney = Math.max(0, input.baseIncome - committed)

  return {
    pillars: pillarSummaries,
    dailyBudget,
    isDeficit: saldoGasto <= 0,
    daysRemaining,
    freeMoney,
  }
}
