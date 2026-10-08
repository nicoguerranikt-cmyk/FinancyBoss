-- ============================================================================
-- FinancyBoss — Borra lo que el nuevo modelo dejó sin uso
-- ============================================================================
-- Con los gastos del día a día sin presupuesto (migración 0041), dos cosas
-- perdieron su razón de ser:
--
--   1. Efecto dominó: servía para cuando el saldo de Gasto quedaba en negativo
--      (declarar de dónde salió la plata). Ahora cada gasto del día a día pide
--      su origen (Dinero libre o Ahorro) al registrarse, y Gasto son solo los
--      gastos fijos: el diálogo, los eventos y la tabla ya no se usan.
--
--   2. Reservar un gasto fijo "desde ya" (categories.fixed_reserve_ahead,
--      migración 0018): ajustaba el presupuesto diario de Gasto. Ese presupuesto
--      ahora sale de Dinero libre, así que la opción no tiene efecto.
--
-- Se borran de verdad (no se dejan comentadas): menos código y menos tablas
-- que mantener. Es seguro: ninguna función SQL ni consulta de la app los usa.
-- ============================================================================

drop table if exists public.domino_events;

alter table public.categories drop column if exists fixed_reserve_ahead;
