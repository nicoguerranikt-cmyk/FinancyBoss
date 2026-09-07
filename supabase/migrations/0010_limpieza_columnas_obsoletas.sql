-- ============================================================================
-- FinancyBoss — Limpieza: borra columnas/tablas obsoletas en vez de dejarlas
-- comentadas como "OBSOLETO, no se borra"
-- ============================================================================
-- Ninguna de estas queda usada por el código de la app (confirmado con
-- grep). Se borran en vez de mantenerse marcadas: código/esquema que no se
-- usa no debe quedar dando vueltas.
--
-- - debt_payments: era la fuente "plata líquida general" de Deudas, que se
--   sacó del todo (ver 0006_deudas_sin_plata_general.sql).
-- - debts.interest_rate/paid_months/total_months: del modelo viejo de
--   amortización (monto+plazo+interés), reemplazado por Deudas v2.
-- - categories.backup_priority: de la cadena de respaldo preconfigurada del
--   Efecto Dominó v1, reemplazada por el dominó v2 (manual.md §4).
-- ============================================================================

drop table if exists public.debt_payments;

alter table public.debts
  drop column if exists interest_rate,
  drop column if exists paid_months,
  drop column if exists total_months;

alter table public.categories
  drop column if exists backup_priority;
