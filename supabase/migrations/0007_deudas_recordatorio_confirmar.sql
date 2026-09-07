-- ============================================================================
-- FinancyBoss — Deudas: el plan automático es un recordatorio, no un
-- descuento silencioso
-- ============================================================================
-- Antes, al llegar el mes de inicio, el sistema generaba solo la
-- transacción del pago (mismo patrón que los gastos fijos). Probándolo, se
-- vio que asumir que la cuota "ya se pagó" solo porque llegó la fecha es
-- peligroso en una app de plata real. Ahora el plan automático solo
-- recuerda ("Te toca pagar X Bs de [deuda]") y el usuario confirma con un
-- botón ("Ya la pagué") — recién ahí se registra el pago de verdad.
-- ============================================================================

alter table public.debts
  add column if not exists auto_pay_start_day integer
    check (auto_pay_start_day is null or auto_pay_start_day between 1 and 31);

comment on column public.debts.auto_pay_start_day is
  'Día del mes en que aparece el recordatorio de la cuota del plan automático. Opcional: si es null, el recordatorio aparece desde el 1° del mes de inicio. NUNCA se descuenta solo — ver lib/debts.ts isAutoPayDue() y app/(app)/deudas/actions.ts confirmAutoPayment.';
