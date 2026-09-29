-- ============================================================================
-- FinancyBoss — Deudas: frecuencia flexible del plan de pago automático
-- ============================================================================
-- Antes el plan automático solo entendía "una vez al mes, en tal día" (mes +
-- año + día sueltos). El usuario pidió poder elegir cualquier frecuencia
-- ("cada 5 días", "cada 2 meses", etc.) y elegir la fecha de inicio con un
-- calendario real en vez de tipear mes/año a mano.
--
-- Se reemplazan auto_pay_start_year/month/day por una sola fecha real
-- (auto_pay_start_date) + una frecuencia (auto_pay_interval_unit +
-- auto_pay_interval_count): "cada N días" o "cada N meses" desde esa fecha.
-- Ver lib/debts.ts (lastDueOccurrence) para cómo se calcula el próximo
-- vencimiento a partir de estos 3 campos.
--
-- monthly_payment se renombra a auto_pay_amount: ya no es necesariamente
-- "mensual", el nombre viejo quedaría confuso con la frecuencia flexible.
-- ============================================================================

alter table public.debts rename column monthly_payment to auto_pay_amount;

alter table public.debts
  add column if not exists auto_pay_start_date date,
  add column if not exists auto_pay_interval_unit text
    check (auto_pay_interval_unit is null or auto_pay_interval_unit in ('day', 'month')),
  add column if not exists auto_pay_interval_count integer
    check (auto_pay_interval_count is null or auto_pay_interval_count > 0);

-- Backfill: los planes que ya existían eran todos "cada 1 mes" en el día
-- guardado (o el 1° del mes si no se había elegido día).
update public.debts
set
  auto_pay_start_date = make_date(auto_pay_start_year, auto_pay_start_month, coalesce(auto_pay_start_day, 1)),
  auto_pay_interval_unit = 'month',
  auto_pay_interval_count = 1
where auto_pay_start_year is not null and auto_pay_start_month is not null;

alter table public.debts
  drop column auto_pay_start_year,
  drop column auto_pay_start_month,
  drop column auto_pay_start_day;

comment on column public.debts.auto_pay_amount is
  'Monto de cada cuota del plan de pago automático. Es un RECORDATORIO, nunca se descuenta solo — ver lib/debts.ts isAutoPayDue() y app/(app)/deudas/actions.ts confirmAutoPayment.';
comment on column public.debts.auto_pay_start_date is
  'Fecha de la primera cuota del plan automático. Las siguientes se calculan sumando auto_pay_interval_count auto_pay_interval_unit repetidamente (ver lib/debts.ts).';
comment on column public.debts.auto_pay_interval_unit is
  '''day'' o ''month'': la unidad de la frecuencia (junto con auto_pay_interval_count, ej. cada 5 "day" o cada 2 "month").';
comment on column public.debts.auto_pay_interval_count is
  'Cuántas unidades (auto_pay_interval_unit) pasan entre una cuota y la siguiente. Ej. 1 + ''month'' = mensual, 15 + ''day'' = cada 15 días.';
