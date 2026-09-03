-- ============================================================================
-- FinancyBoss — Gastos fijos + ajustes para Efecto Dominó v2
-- ============================================================================
-- Acompaña la reescritura del modelo de dominó (manual.md v2.0, sección 4):
-- el sistema ya no reparte plata automáticamente entre categorías. Los
-- gastos fijos son plata comprometida por configuración (no por si ya se
-- registró la transacción), y las resoluciones de déficit (Ahorro/Inversión/
-- préstamo) necesitan poder apuntar a una deuda nueva.
-- ============================================================================

alter table public.categories
  add column if not exists fixed_amount numeric(12,2)
    check (fixed_amount is null or fixed_amount >= 0),
  add column if not exists auto_repeat boolean not null default false;

comment on column public.categories.fixed_amount is
  'Si no es null, esta subcategoría de Gasto es un gasto fijo: ese monto se descuenta del presupuesto diario por configuración, no por transacción registrada (manual.md §4.2/§5.2).';
comment on column public.categories.auto_repeat is
  'Si es true, el gasto fijo se genera solo al inicio de cada mes (perezoso, en la primera carga del Dashboard del mes). Si es false, el usuario lo registra a mano cuando lo paga.';
comment on column public.categories.backup_priority is
  'OBSOLETO desde el modelo de dominó v2 (manual.md v2.0): ya no existe la cadena de respaldo preconfigurado. Columna sin uso, se deja sin borrar por prudencia.';

alter table public.domino_events
  add column if not exists debt_id uuid references public.debts(id) on delete set null;

comment on column public.domino_events.debt_id is
  'Seteado cuando el usuario declaró que un déficit se cubrió con un préstamo nuevo ("alguien me lo prestó", manual.md §4.3 Caso 2). affected_category_id queda null en ese caso: la plata vino de afuera del sistema de pilares.';

-- No hace falta tocar RLS ni GRANT: las políticas de categories/domino_events
-- ya son "for all using/with check (auth.uid() = user_id)" (agnósticas a
-- columnas), y los GRANT de 0003_grants.sql ya son a nivel tabla.
