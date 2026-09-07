-- ============================================================================
-- FinancyBoss — Deudas: se saca la fuente "plata líquida general"
-- ============================================================================
-- Al probarlo, un pago con esa fuente bajaba proporcionalmente los 3
-- pilares (Ahorro/Gasto/Inversión), lo cual no tenía sentido para el
-- usuario: todo pago de deuda debe salir de un pilar/categoría específico
-- (transactions.debt_id), nunca de un "pool general". auto_pay_pillar_id
-- pasa a ser requerido en la app cuando hay plan automático configurado
-- (ya no significa "plata general" cuando es null).
-- ============================================================================

comment on table public.debt_payments is
  'OBSOLETO: se sacó la fuente "plata líquida general" (todo pago de deuda sale de un pilar/categoría específico, ver transactions.debt_id). Tabla sin uso, se deja sin borrar por prudencia.';

comment on column public.debts.auto_pay_pillar_id is
  'Pilar de origen del plan de pago automático — requerido por la app cuando hay plan configurado (monthly_payment no es null). Ya no existe la opción "plata líquida general".';
