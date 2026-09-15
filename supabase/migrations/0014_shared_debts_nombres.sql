-- ============================================================================
-- FinancyBoss — Guarda el nombre de cada parte en la deuda vinculada
-- ============================================================================
-- Bug encontrado probando: page.tsx intentaba resolver el nombre de la
-- CONTRAPARTE consultando "profiles" directamente — pero profiles.RLS es
-- "auth.uid() = id" (cada uno solo lee su propio perfil), así que esa
-- consulta siempre devolvía 0 filas y todo caía en el fallback "esa
-- persona". Solución: guardar el nombre de las dos partes en la fila de
-- shared_debts al crearla (ya se conocen en ese momento — el propio, y el
-- de la contraparte que ya devolvió find_user_by_email) — así después no
-- hace falta ninguna consulta cruzada para mostrarlo.
--
-- Nullable (no backfill): las 2 filas de prueba que ya existen se van a
-- ver con el nombre genérico de siempre hasta que se recreen; todo lo
-- nuevo va a guardar el nombre real desde acá en adelante.
-- ============================================================================

alter table public.shared_debts
  add column if not exists debtor_name text,
  add column if not exists creditor_name text;

comment on column public.shared_debts.debtor_name is
  'Nombre del deudor al momento de crear la invitación (snapshot, no se re-sincroniza si esa persona cambia su nombre después — mismo criterio de "mejor esfuerzo" que el resto del proyecto).';
comment on column public.shared_debts.creditor_name is
  'Nombre del acreedor al momento de crear la invitación. Ver comentario de debtor_name.';
