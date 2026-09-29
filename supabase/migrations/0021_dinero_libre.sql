-- ============================================================================
-- FinancyBoss — Dinero libre: pantalla e historial propios
-- ============================================================================
-- "Dinero libre" (migración 0020) hasta acá era solo un número calculado
-- (ingreso - los 3 montos de pilares), sin pantalla ni historial propio.
-- Esta migración le da una tabla propia para que:
--   - Cada mes, al cerrar (lib/monthClose.ts closeOneMonth), lo que sobró
--     ese mes quede acreditado acá para siempre (mismo criterio que el
--     arrastre de saldo entre meses de los pilares: es aritmética sobre un
--     mes que ya terminó, se hace sola, sin pedir confirmación).
--   - El usuario pueda registrar a mano un gasto o ingreso puntual contra
--     esta plata sin destino (no pasa por ningún pilar/categoría) — eso SÍ
--     es una acción del usuario con su propio botón, no una automatización
--     silenciosa (ver memoria "no asumir movimientos de plata").
--
-- amount: positivo = entró plata (verde), negativo = salió (rojo). Mismo
-- criterio que transactions.amount.
--
-- credit_month/credit_year: solo se llenan en la fila automática que genera
-- el cierre de mes (una por mes, nunca duplicada — ver el índice único más
-- abajo). Las filas que carga el usuario a mano quedan con estos dos en null.
-- ============================================================================

create table if not exists public.free_money_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  amount       numeric(12,2) not null,
  description  text,
  date         date not null default current_date,
  credit_month integer check (credit_month between 1 and 12),
  credit_year  integer check (credit_year >= 2000),
  created_at   timestamptz not null default now()
);

-- A lo sumo un crédito automático de cierre de mes por usuario por mes
-- (protege contra el cierre de mes corriendo dos veces en simultáneo).
create unique index if not exists free_money_monthly_credit_unique
  on public.free_money_transactions (user_id, credit_year, credit_month)
  where credit_month is not null;

create index if not exists free_money_transactions_user_date_idx
  on public.free_money_transactions (user_id, date);

alter table public.free_money_transactions enable row level security;

drop policy if exists "free_money_transactions_owner_all" on public.free_money_transactions;
create policy "free_money_transactions_owner_all" on public.free_money_transactions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
