-- ============================================================================
-- FinancyBoss — Cada mes cerrado guarda su propio ingreso (H08)
-- ============================================================================
-- Estadísticas calculaba el ingreso de CUALQUIER mes con el sueldo actual del
-- perfil: si el sueldo pasaba de 3.000 a 4.000, un mes pasado mostraba 4.000.
-- monthly_budgets ya congela, al cerrar el mes, el presupuesto, el arrastre y
-- lo gastado de cada pilar; faltaba congelar también el ingreso.
--
-- income_amount es el ingreso base con el que se cerró ese mes. Se repite en
-- las filas de los 3 pilares del mes (todas valen lo mismo).
--
-- Es NULLABLE a propósito: una fila insertada por una versión anterior de la
-- app (que todavía no manda el ingreso) no debe quedar con un 0 falso. La app
-- trata null como "sin dato" y usa el ingreso actual, igual que antes.
--
-- Meses ya cerrados: no se sabe cuánto ganaba el usuario entonces, así que se
-- rellenan con su ingreso actual (lo mismo que mostraba Estadísticas hasta
-- hoy). Desde ahora cada cierre guarda el valor exacto.
-- ============================================================================

alter table public.monthly_budgets
  add column if not exists income_amount numeric(12,2);

comment on column public.monthly_budgets.income_amount is
  'Ingreso base del usuario con el que se cerró este mes (se repite en las filas de los 3 pilares). Null = fila anterior a la migración 0036 sin dato; la app usa el ingreso actual. Estadísticas lo lee para que cambiar el sueldo no altere los meses pasados.';

update public.monthly_budgets mb
  set income_amount = p.base_income
  from public.profiles p
  where p.id = mb.user_id
    and mb.income_amount is null
    and mb.category_id is null;
