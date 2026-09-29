-- ============================================================================
-- FinancyBoss — Categorías de Ahorro/Inversión: monto fijo en vez de %
-- ============================================================================
-- Igual que ya pasó con los pilares (migración 0020) y con Gasto (migración
-- 0019): las subcategorías de Ahorro e Inversión dejan de repartirse por %
-- del pilar y pasan a un monto fijo en Bs. Se reutiliza la misma columna que
-- ya usaba Gasto (`fixed_amount`) y el mismo motor de reparto —
-- lib/monthlyAllocation.ts ya soportaba montos fijos genéricamente, sin
-- importar el pilar, así que no hace falta una columna ni una tabla nueva.
--
-- auto_repeat/fixed_start_date/fixed_interval_*/fixed_reserve_ahead siguen
-- siendo exclusivos de Gasto (un gasto fijo se auto-descuenta solo en una
-- fecha; un aporte a Ahorro/Inversión no) — la app sigue validando eso del
-- lado del server (ver app/(app)/mi-dinero/actions.ts updateCategory).
--
-- Con esto `percentage` queda sin ningún uso en toda la app: se borra de
-- verdad, no se deja comentada (ver memoria "no dejar código obsoleto").
-- ============================================================================

-- Backfill: cada categoría de Ahorro/Inversión con % ya asignado pasa a un
-- monto fijo equivalente contra el monto actual de SU pilar. La categoría
-- general nunca tuvo % propio, así que queda afuera (its fixed_amount sigue
-- null — sigue siendo "lo que sobra", ahora en Bs en vez de %).
update public.categories c
set fixed_amount = round(p.monthly_amount * c.percentage / 100, 2)
from public.pillars p
where p.id = c.pillar_id
  and c.percentage is not null
  and c.fixed_amount is null
  and not c.is_general;

alter table public.categories
  drop column percentage;

comment on column public.categories.fixed_amount is
  'Monto fijo en Bs que recibe esta categoría del reparto mensual de su pilar (Ahorro/Gasto/Inversión). En Gasto además puede auto-descontarse solo en una fecha (ver auto_repeat y las columnas fixed_*); en Ahorro/Inversión es solo el monto que recibe cada mes, sin frecuencia propia.';
