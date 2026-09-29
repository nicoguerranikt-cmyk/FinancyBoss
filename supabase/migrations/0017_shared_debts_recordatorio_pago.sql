-- ============================================================================
-- FinancyBoss — Deudas vinculadas: recordatorio de pago opcional
-- ============================================================================
-- Mismo recordatorio flexible que ya tienen las deudas propias (migración
-- 0016: fecha del primer pago + cada N días/meses), pero para shared_debts.
-- A propósito SIN columna de pilar: en una deuda vinculada, el deudor recién
-- elige de qué pilar sale la plata al "Proponer pago" (ver
-- app/(app)/shared-debts/actions.ts proposeSharedPayment) — el recordatorio
-- de acá solo avisa que toca proponer, nunca registra ni descuenta nada
-- solo (ver lib/debts.ts lastDueOccurrence).
--
-- Lo puede setear quien crea la invitación (deudor o acreedor): es un dato
-- del acuerdo entre los dos, no algo exclusivo de una de las partes. La
-- policy shared_debts_update ya deja actualizar la fila a cualquiera de las
-- dos, y el trigger shared_debts_guard (0012) no restringe estas columnas.
-- ============================================================================

alter table public.shared_debts
  add column if not exists auto_pay_amount numeric(12,2) check (auto_pay_amount is null or auto_pay_amount > 0),
  add column if not exists auto_pay_start_date date,
  add column if not exists auto_pay_interval_unit text
    check (auto_pay_interval_unit is null or auto_pay_interval_unit in ('day', 'month')),
  add column if not exists auto_pay_interval_count integer
    check (auto_pay_interval_count is null or auto_pay_interval_count > 0);

comment on column public.shared_debts.auto_pay_amount is
  'Cuota del recordatorio de pago (opcional). Es solo un aviso para el deudor ("te toca proponer el pago") — nunca genera una propuesta ni una transacción sola.';
comment on column public.shared_debts.auto_pay_start_date is
  'Fecha de la primera cuota del recordatorio. Las siguientes se calculan igual que en debts.auto_pay_start_date (ver lib/debts.ts).';
comment on column public.shared_debts.auto_pay_interval_unit is
  '''day'' o ''month'' — junto con auto_pay_interval_count define la frecuencia (ej. cada 15 "day", cada 2 "month").';
comment on column public.shared_debts.auto_pay_interval_count is
  'Cuántas unidades (auto_pay_interval_unit) pasan entre una cuota y la siguiente.';
