-- ============================================================================
-- FinancyBoss — Gasto fijo: frecuencia flexible + separación fijo/variable
-- ============================================================================
-- Antes, un gasto fijo (categories.fixed_amount + auto_repeat) siempre se
-- generaba "una vez al mes, el día 1" — sin poder elegir cuándo empieza ni
-- cada cuánto se repite. Mismo cambio que ya se hizo para Deudas (migración
-- 0016): se agrega una fecha de inicio real + "cada N días/meses", usando
-- la misma matemática genérica (ver lib/recurrence.ts, antes vivía adentro
-- de lib/debts.ts).
--
-- Separación fijo/variable (conversación con el usuario): a partir de acá,
-- en el pilar Gasto, una categoría solo puede tener % si también tiene
-- fixed_amount — el % es "cuánto del reparto mensual le corresponde a este
-- gasto fijo", no una forma de reservarle presupuesto a un gasto suelto del
-- día a día. Una categoría sin fixed_amount (gasto variable/cotidiano)
-- nunca tiene %: los gastos ahí salen directo del saldo general de Gasto.
-- Esto se valida en app/(app)/mi-dinero/actions.ts (updateCategory), no acá
-- — mismo criterio que la regla de "la categoría general no tiene %"
-- (chequeo de aplicación, no constraint de base, porque necesita saber a
-- qué pilar pertenece la categoría). Ahorro e Inversión NO cambian: sus
-- categorías siguen usando % libremente, ahí no existe el concepto de
-- "gasto fijo".
--
-- fixed_reserve_ahead (configurable por categoría, decisión del usuario):
-- el manual.md original (§4.2/§5.2, "Crítico") decía que un gasto fijo
-- SIEMPRE se reserva del presupuesto diario desde el día 1 del mes, aunque
-- todavía no se haya descontado de verdad. Al hacer la frecuencia flexible
-- surgió la duda de si eso sigue teniendo sentido para "cada 2 meses" o
-- "cada 15 días" — se resolvió dejándolo a elección del usuario por
-- categoría: true = se reserva por adelantado (prorrateado según la
-- frecuencia, ver lib/fixedExpense.ts monthlyReserveAmount), false = el
-- presupuesto no baja hasta que la fecha real llega y se genera la
-- transacción. Default true = mantiene el comportamiento viejo para los
-- gastos fijos que ya existían.
-- ============================================================================

alter table public.categories
  add column if not exists fixed_start_date date,
  add column if not exists fixed_interval_unit text
    check (fixed_interval_unit is null or fixed_interval_unit in ('day', 'month')),
  add column if not exists fixed_interval_count integer
    check (fixed_interval_count is null or fixed_interval_count > 0),
  add column if not exists fixed_reserve_ahead boolean not null default true;

-- Backfill: los gastos fijos que ya existían funcionaban todos como "cada 1
-- mes, generado el día 1, reservado desde el día 1" — se preserva ese
-- comportamiento tal cual (fixed_reserve_ahead ya nace en true arriba).
update public.categories
set
  fixed_start_date = date_trunc('month', current_date)::date,
  fixed_interval_unit = 'month',
  fixed_interval_count = 1
where fixed_amount is not null and auto_repeat = true;

comment on column public.categories.fixed_start_date is
  'Fecha de la primera vez que se descuenta este gasto fijo. Las siguientes se calculan sumando fixed_interval_count fixed_interval_unit repetidamente (ver lib/recurrence.ts). Solo tiene sentido si auto_repeat = true.';
comment on column public.categories.fixed_interval_unit is
  '''day'' o ''month'' — junto con fixed_interval_count define cada cuánto se descuenta (ej. cada 15 "day", cada 2 "month"). Reemplaza el viejo comportamiento fijo de "una vez al mes".';
comment on column public.categories.fixed_interval_count is
  'Cuántas unidades (fixed_interval_unit) pasan entre un descuento y el siguiente.';
comment on column public.categories.fixed_reserve_ahead is
  'true = este gasto fijo se reserva del presupuesto diario desde ya (prorrateado según la frecuencia), como si ya estuviera gastado. false = el presupuesto no baja hasta la fecha real del descuento. Ver lib/fixedExpense.ts y lib/dashboard.ts computeDashboard.';
