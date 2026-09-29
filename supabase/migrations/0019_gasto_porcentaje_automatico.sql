-- ============================================================================
-- FinancyBoss — Gasto: el % ya no se edita a mano, se calcula solo
-- ============================================================================
-- Encontrado en vivo con el usuario: categorías cotidianas (Comida,
-- Transporte) tenían un % guardado de cuando todavía no existía la regla
-- de la migración 0018 ("en Gasto, % solo si es gasto fijo") — se veían con
-- un % en la lista que ya no tenía sentido.
--
-- Se va un paso más allá: en Gasto, el % ya NUNCA se guarda ni se edita a
-- mano, ni siquiera en un gasto fijo. Un gasto fijo recibe su monto
-- (fixed_amount) tal cual en el reparto mensual — el % que se le muestra al
-- usuario ("este gasto representa el 25% de tu Gasto") es puramente
-- informativo, se calcula al vuelo contra el ingreso actual
-- (fixed_amount / presupuesto de Gasto del mes), nunca se guarda. Así queda
-- siempre al día solo, sin que el usuario tenga que recalcularlo cada vez
-- que cambia el ingreso o agrega otro gasto fijo (pedido explícito del
-- usuario). Ver lib/monthlyAllocation.ts y
-- app/(app)/mi-dinero/[pillarId]/page.tsx.
--
-- Ahorro e Inversión no cambian: ahí el % sigue siendo la única forma de
-- repartir, se sigue editando a mano como siempre.
-- ============================================================================

update public.categories
set percentage = null
where pillar_id in (select id from public.pillars where name = 'gasto');

comment on column public.categories.percentage is
  'Solo tiene sentido en Ahorro e Inversión (se edita a mano, define el reparto mensual de esa categoría). En Gasto ya NO se usa: un gasto fijo recibe su fixed_amount tal cual, y el % que se le muestra al usuario es calculado al vuelo, nunca guardado acá (ver lib/monthlyAllocation.ts).';
