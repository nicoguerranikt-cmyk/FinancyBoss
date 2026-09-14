-- ============================================================================
-- FinancyBoss — Recordatorio de ingreso mensual (manual.md §3.1)
-- ============================================================================
-- "Si [auto_repeat_income] está desactivado, el sistema solicita ingresarlo
-- manualmente al inicio de cada mes." Para saber si ya se confirmó el
-- ingreso ESTE mes, alcanza con guardar el año/mes de la última vez que el
-- usuario guardó su ingreso — no hace falta una tabla de historial nueva
-- (mismo criterio de "mejor esfuerzo con la config vigente" que ya se
-- acepta en el resto del proyecto, ver lib/monthClose.ts).
-- ============================================================================

alter table public.profiles
  add column if not exists income_confirmed_year integer,
  add column if not exists income_confirmed_month integer
    check (income_confirmed_month is null or income_confirmed_month between 1 and 12);

comment on column public.profiles.income_confirmed_year is
  'Año en que el usuario confirmó/guardó por última vez su ingreso mensual (app/(app)/mas/actions.ts updateProfile). Si auto_repeat_income es false y esto no coincide con el mes actual, el Dashboard pide confirmarlo.';
comment on column public.profiles.income_confirmed_month is
  'Mes (1-12) correspondiente a income_confirmed_year.';
