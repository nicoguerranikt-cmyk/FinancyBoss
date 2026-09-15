-- ============================================================================
-- FinancyBoss — Nota opcional al rechazar un pago de deuda vinculada
-- ============================================================================
-- Cuando el acreedor rechaza un pago propuesto, puede dejar una nota libre
-- explicando por qué (o rechazar sin nota). El deudor la ve del otro lado.
-- No hace falta tocar RLS/triggers: la policy de update de
-- shared_debt_payments ya permite al acreedor tocar un pago pending, y el
-- trigger (shared_debt_payments_guard) no bloquea esta columna nueva.
-- ============================================================================

alter table public.shared_debt_payments
  add column if not exists rejection_note text;

comment on column public.shared_debt_payments.rejection_note is
  'Nota libre opcional que deja el acreedor al rechazar un pago propuesto. NULL si lo rechazó sin explicación.';
