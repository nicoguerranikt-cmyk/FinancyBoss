-- ============================================================================
-- FinancyBoss — Deudores: cobros como ingreso extra rastreable
-- ============================================================================
-- La tabla `debtors` ya existe completa desde 0001 (incluye status
-- 'archived' para el caso "se borra un deudor con pagos parciales", manual
-- §11). Solo falta poder marcar qué transacción de ingreso extra es un
-- cobro de un deudor puntual (manual §7.3: "el pago se convierte en un
-- ingreso extra"), igual que ya se hizo con transactions.debt_id.
-- ============================================================================

alter table public.transactions
  add column if not exists debtor_id uuid references public.debtors(id) on delete set null;

comment on column public.transactions.debtor_id is
  'Seteado cuando esta transacción de ingreso extra es un cobro de un deudor puntual (manual §7.3). NULL en transacciones normales.';
