-- ============================================================================
-- FinancyBoss — Ahorro con propósito
-- ============================================================================
-- Una categoría del pilar Ahorro puede tener una meta: monto + fecha
-- objetivo. El aporte mensual sugerido para llegar a tiempo se calcula al
-- vuelo (ver lib/savingsGoal.ts) contra lo ya acumulado en esa categoría —
-- nunca se guarda, mismo criterio que el % informativo de un gasto fijo
-- (migración 0019). Es solo una sugerencia: no cambia el % ni el monto real
-- asignado a la categoría, el usuario decide si la sigue o no.
--
-- Ambas columnas van juntas: se validan/limpian en conjunto en la app (ver
-- app/(app)/mi-dinero/actions.ts updateCategory, campo savingsGoal) — igual
-- que fixed_start_date/fixed_interval_* para un gasto fijo.
-- ============================================================================

alter table public.categories
  add column if not exists goal_amount numeric(12,2) check (goal_amount is null or goal_amount >= 0),
  add column if not exists goal_target_date date;

comment on column public.categories.goal_amount is
  'Meta de ahorro en Bs (solo pilar Ahorro). Junto con goal_target_date define el aporte mensual sugerido, calculado al vuelo — nunca guardado.';
comment on column public.categories.goal_target_date is
  'Fecha objetivo para llegar a goal_amount. Null si la categoría no tiene meta.';
