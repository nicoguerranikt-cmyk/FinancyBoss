-- ============================================================================
-- FinancyBoss — Deudas: archivar una deuda pagada
-- ============================================================================
-- Igual que debtors, una deuda pagada se puede archivar para sacarla de la
-- vista, sin perder el historial (transactions.debt_id sigue apuntando a
-- ella). Mismo criterio que debtors.status ('pending'|'paid'|'archived').
-- ============================================================================

alter table public.debts
  drop constraint if exists debts_status_check;
alter table public.debts
  add constraint debts_status_check check (status in ('active', 'paid', 'archived'));
