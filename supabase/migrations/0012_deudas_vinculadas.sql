-- ============================================================================
-- FinancyBoss — Deudas vinculadas entre usuarios
-- ============================================================================
-- Primera vez en el proyecto donde una fila la ven y la tocan DOS usuarios
-- distintos (hasta ahora, toda tabla asume "una fila, un dueño"). El modelo
-- (confirmado con el usuario):
--   1. A invita a B por email, en cualquier dirección.
--   2. B acepta o rechaza. Antes de aceptar, no afecta el presupuesto de
--      ninguno de los dos.
--   3. Aceptada, es UN SOLO registro compartido (un saldo): A la ve como
--      Deuda, B la ve como Deudor.
--   4. Un pago es de dos pasos: el deudor propone (desde su propio pilar),
--      el acreedor confirma (eligiendo su propio pilar de destino). Recién
--      ahí se descuenta/acredita en ambos lados.
--
-- Antes de correr esto, verificar el supuesto de seguridad en el que se
-- apoyan las 2 funciones de más abajo (comportamiento estándar de Supabase,
-- pero vale la pena confirmarlo):
--   select rolname, rolbypassrls from pg_roles where rolname = 'postgres';
-- Tiene que dar rolbypassrls = true. Si da false, las funciones security
-- definer de acá abajo NO van a poder saltarse el RLS de auth.users ni
-- escribir transactions a nombre de otro usuario, y hay que revisar el
-- diseño antes de seguir.
-- ============================================================================

create table if not exists public.shared_debts (
  id                 uuid primary key default gen_random_uuid(),
  debtor_user_id     uuid not null references auth.users(id) on delete cascade,
  creditor_user_id   uuid not null references auth.users(id) on delete cascade,
  created_by         uuid not null references auth.users(id) on delete cascade,
  name               text not null,
  description        text,
  total_amount       numeric(12,2) not null check (total_amount > 0),
  remaining_amount   numeric(12,2) not null check (remaining_amount >= 0),
  status             text not null default 'pending'
                       check (status in ('pending', 'active', 'rejected', 'paid', 'archived')),
  created_at         timestamptz not null default now(),
  responded_at       timestamptz,
  check (debtor_user_id <> creditor_user_id),
  check (created_by = debtor_user_id or created_by = creditor_user_id),
  check (remaining_amount <= total_amount)
);

comment on table public.shared_debts is
  'Deuda vinculada entre dos usuarios reales de FinancyBoss: UN SOLO registro compartido — el deudor la ve como "Deuda", el acreedor como "Deudor". status pending = invitación sin responder (no afecta presupuesto de nadie); active = aceptada; rejected = el invitado la rechazó; paid = remaining_amount llegó a 0; archived = archivada por cualquiera de las dos partes.';

create index if not exists shared_debts_debtor_idx on public.shared_debts (debtor_user_id, status);
create index if not exists shared_debts_creditor_idx on public.shared_debts (creditor_user_id, status);

create table if not exists public.shared_debt_payments (
  id                     uuid primary key default gen_random_uuid(),
  shared_debt_id         uuid not null references public.shared_debts(id) on delete cascade,
  proposer_user_id       uuid not null references auth.users(id) on delete cascade,
  amount                 numeric(12,2) not null check (amount > 0),
  proposer_pillar_id     uuid not null references public.pillars(id) on delete cascade,
  proposer_category_id   uuid references public.categories(id) on delete set null,
  status                 text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  confirmer_pillar_id    uuid references public.pillars(id) on delete set null,
  confirmer_category_id  uuid references public.categories(id) on delete set null,
  created_at             timestamptz not null default now(),
  resolved_at            timestamptz
);

comment on table public.shared_debt_payments is
  'Propuesta de pago de una deuda vinculada. proposer_user_id siempre es el debtor_user_id de la deuda (lo fuerza la policy de insert). Confirmar (confirm_shared_payment) escribe las 2 transacciones reales; rechazar no toca nada.';

create index if not exists shared_debt_payments_debt_idx on public.shared_debt_payments (shared_debt_id, status);
create index if not exists shared_debt_payments_proposer_idx on public.shared_debt_payments (proposer_user_id, status);

-- Un pago confirmado de deuda vinculada queda marcado acá. No se reusa
-- debt_id/debtor_id (esas FKs apuntan a las tablas LOCALES debts/debtors,
-- no a shared_debts).
alter table public.transactions
  add column if not exists shared_debt_id uuid references public.shared_debts(id) on delete set null;

comment on column public.transactions.shared_debt_id is
  'Seteado cuando esta transacción viene de un pago confirmado de una deuda vinculada (shared_debts), vía confirm_shared_payment(). NULL en transacciones normales y en pagos de deudas/deudores locales (esos usan debt_id/debtor_id).';

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.shared_debts enable row level security;
alter table public.shared_debt_payments enable row level security;

create policy "shared_debts_select" on public.shared_debts
  for select using (auth.uid() = debtor_user_id or auth.uid() = creditor_user_id);

create policy "shared_debts_insert" on public.shared_debts
  for insert with check (
    auth.uid() = created_by
    and (auth.uid() = debtor_user_id or auth.uid() = creditor_user_id)
    and status = 'pending'
    and remaining_amount = total_amount
  );

create policy "shared_debts_update" on public.shared_debts
  for update
  using (auth.uid() = debtor_user_id or auth.uid() = creditor_user_id)
  with check (auth.uid() = debtor_user_id or auth.uid() = creditor_user_id);

-- Sin policy de DELETE: una fila compartida entre dos personas no se borra
-- unilateralmente.

-- El UPDATE de arriba es intencionalmente amplio (cualquiera de las 2
-- partes puede actualizar la fila) — este trigger es el que de verdad
-- decide qué cambios son válidos: nadie puede cambiar quién es el deudor/
-- acreedor/monto una vez creada la fila; remaining_amount solo se mueve
-- desde adentro de confirm_shared_payment (marcado con la bandera de sesión
-- financyboss.internal_write, que no es accesible desde afuera de esa
-- función); aceptar/rechazar el pending inicial solo lo puede hacer la
-- persona invitada (no quien creó la invitación); pasar a "paid" también
-- queda reservado a confirm_shared_payment.
create or replace function public.shared_debts_guard()
returns trigger
language plpgsql
as $$
declare
  v_invitee uuid;
begin
  if new.debtor_user_id <> old.debtor_user_id
     or new.creditor_user_id <> old.creditor_user_id
     or new.total_amount <> old.total_amount
     or new.created_by <> old.created_by then
    raise exception 'No se pueden modificar las partes ni el monto de una deuda vinculada.';
  end if;

  if new.remaining_amount <> old.remaining_amount
     and coalesce(current_setting('financyboss.internal_write', true), '') <> 'on' then
    raise exception 'El saldo de una deuda vinculada solo se actualiza al confirmar un pago.';
  end if;

  if new.status <> old.status then
    v_invitee := case when old.created_by = old.debtor_user_id then old.creditor_user_id else old.debtor_user_id end;

    if old.status = 'pending' and new.status in ('active', 'rejected') then
      if auth.uid() <> v_invitee then
        raise exception 'Solo la persona invitada puede aceptar o rechazar esta deuda vinculada.';
      end if;
    elsif old.status = 'active' and new.status = 'paid' then
      if coalesce(current_setting('financyboss.internal_write', true), '') <> 'on' then
        raise exception 'Una deuda vinculada se marca pagada automáticamente al confirmar el último pago.';
      end if;
    elsif old.status = 'paid' and new.status = 'archived' then
      null; -- cualquiera de las dos partes puede archivar una ya pagada
    else
      raise exception 'Transición de estado inválida (% -> %).', old.status, new.status;
    end if;
  end if;

  if new.status in ('active', 'rejected') and old.status = 'pending' then
    new.responded_at := now();
  end if;

  return new;
end;
$$;

create trigger shared_debts_guard_trigger
  before update on public.shared_debts
  for each row execute function public.shared_debts_guard();

create policy "shared_debt_payments_select" on public.shared_debt_payments
  for select using (exists (
    select 1 from public.shared_debts sd
    where sd.id = shared_debt_id and (sd.debtor_user_id = auth.uid() or sd.creditor_user_id = auth.uid())
  ));

create policy "shared_debt_payments_insert" on public.shared_debt_payments
  for insert with check (
    auth.uid() = proposer_user_id
    and status = 'pending'
    and confirmer_pillar_id is null
    and confirmer_category_id is null
    and resolved_at is null
    and exists (
      select 1 from public.shared_debts sd
      where sd.id = shared_debt_id and sd.status = 'active' and sd.debtor_user_id = auth.uid()
    )
  );

-- Solo el acreedor puede tocar un pago pending, y solo para rechazarlo
-- (confirmarlo pasa exclusivamente por confirm_shared_payment).
create policy "shared_debt_payments_update" on public.shared_debt_payments
  for update
  using (
    status = 'pending'
    and exists (select 1 from public.shared_debts sd where sd.id = shared_debt_id and sd.creditor_user_id = auth.uid())
  )
  with check (status = 'rejected');

create or replace function public.shared_debt_payments_guard()
returns trigger
language plpgsql
as $$
begin
  if new.shared_debt_id <> old.shared_debt_id
     or new.proposer_user_id <> old.proposer_user_id
     or new.amount <> old.amount
     or new.proposer_pillar_id <> old.proposer_pillar_id
     or new.proposer_category_id is distinct from old.proposer_category_id then
    raise exception 'No se pueden modificar los datos originales de una propuesta de pago.';
  end if;

  if new.status = 'confirmed' and coalesce(current_setting('financyboss.internal_write', true), '') <> 'on' then
    raise exception 'Un pago solo se confirma a través de confirm_shared_payment.';
  end if;

  if new.status <> old.status and new.resolved_at is null then
    new.resolved_at := now();
  end if;

  return new;
end;
$$;

create trigger shared_debt_payments_guard_trigger
  before update on public.shared_debt_payments
  for each row execute function public.shared_debt_payments_guard();

grant select, insert, update on public.shared_debts to authenticated;
grant select, insert, update on public.shared_debt_payments to authenticated;
-- Sin DELETE en ninguna de las dos: mismo criterio que domino_events —
-- historial, no se borra.

-- ============================================================================
-- Funciones security definer (primera vez en el proyecto)
-- ============================================================================

-- Busca un usuario de FinancyBoss por email exacto. La app no tiene service
-- role key, así que esta es la única forma de resolver "email -> user_id"
-- sin exponer auth.users. Devuelve 0 filas tanto si el email no existe como
-- si existe en auth.users pero nunca terminó el onboarding (sin fila en
-- profiles) — mismo resultado a propósito, para no filtrar cuál de los dos
-- pasó. No es enumerable en masa: coincidencia exacta únicamente, requiere
-- estar autenticado.
create or replace function public.find_user_by_email(p_email text)
returns table (user_id uuid, name text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_email text := nullif(trim(lower(p_email)), '');
  v_target uuid;
begin
  if v_caller is null then
    raise exception 'No autenticado.';
  end if;
  if v_email is null then
    raise exception 'Ingresá un email.';
  end if;

  select u.id into v_target from auth.users u where lower(u.email) = v_email limit 1;
  if v_target is null then
    return; -- 0 filas: no hay cuenta con ese email
  end if;

  if v_target = v_caller then
    raise exception 'No podés vincular una deuda con vos mismo.';
  end if;

  return query select p.id, p.name from public.profiles p where p.id = v_target;
end;
$$;

revoke all on function public.find_user_by_email(text) from public;
grant execute on function public.find_user_by_email(text) to authenticated;

-- Confirma un pago propuesto: valida todo de nuevo del lado del servidor
-- (nunca confía en que la action ya validó), inserta las 2 transacciones
-- reales (gasto del deudor, ingreso extra del acreedor), descuenta
-- remaining_amount y cierra la deuda si llega a 0. Todo en una sola
-- función = atómico (una excepción deshace todo lo que llevaba hecho esta
-- llamada).
create or replace function public.confirm_shared_payment(
  p_payment_id uuid,
  p_confirmer_pillar_id uuid,
  p_confirmer_category_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_payment record;
  v_debt record;
  v_category record;
  v_new_remaining numeric(12,2);
  v_new_status text;
begin
  if v_caller is null then
    raise exception 'No autenticado.';
  end if;

  select * into v_payment from public.shared_debt_payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'Pago inválido.';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Este pago ya fue resuelto.';
  end if;

  select * into v_debt from public.shared_debts where id = v_payment.shared_debt_id for update;
  if v_debt.id is null or v_debt.status <> 'active' then
    raise exception 'Deuda vinculada inválida.';
  end if;
  if v_caller <> v_debt.creditor_user_id then
    raise exception 'Solo quien recibe el pago puede confirmarlo.';
  end if;
  if v_payment.amount > v_debt.remaining_amount + 0.005 then
    raise exception 'El pago supera el saldo pendiente de la deuda.';
  end if;

  -- Revalidación server-side del CONFIRMADOR — mismas reglas que
  -- lib/pillarSource.ts (nunca confiar solo en la validación de la action).
  if not exists (
    select 1 from public.pillars where id = p_confirmer_pillar_id and user_id = v_debt.creditor_user_id
  ) then
    raise exception 'Pilar inválido.';
  end if;
  if p_confirmer_category_id is not null then
    select * into v_category from public.categories
      where id = p_confirmer_category_id
        and user_id = v_debt.creditor_user_id
        and pillar_id = p_confirmer_pillar_id
        and deleted_at is null;
    if v_category.id is null then
      raise exception 'Categoría inválida.';
    end if;
    if v_category.fixed_amount is not null then
      raise exception 'Esa categoría es un gasto fijo — elegí otra o dejala sin categoría.';
    end if;
  end if;

  perform set_config('financyboss.internal_write', 'on', true); -- true = solo dura esta transacción

  v_new_remaining := round(greatest(v_debt.remaining_amount - v_payment.amount, 0)::numeric, 2);
  v_new_status := case when v_new_remaining <= 0.005 then 'paid' else 'active' end;
  if v_new_status = 'paid' then
    v_new_remaining := 0;
  end if;

  insert into public.transactions (user_id, pillar_id, category_id, shared_debt_id, amount, type, description, date)
  values (
    v_debt.debtor_user_id, v_payment.proposer_pillar_id, v_payment.proposer_category_id,
    v_debt.id, -v_payment.amount, 'expense', null, p_date
  );

  insert into public.transactions (user_id, pillar_id, category_id, shared_debt_id, amount, type, description, date)
  values (
    v_debt.creditor_user_id, p_confirmer_pillar_id, p_confirmer_category_id,
    v_debt.id, v_payment.amount, 'extra_income', null, p_date
  );

  update public.shared_debts set remaining_amount = v_new_remaining, status = v_new_status where id = v_debt.id;

  update public.shared_debt_payments
    set status = 'confirmed', confirmer_pillar_id = p_confirmer_pillar_id, confirmer_category_id = p_confirmer_category_id
    where id = v_payment.id;
end;
$$;

revoke all on function public.confirm_shared_payment(uuid, uuid, uuid, date) from public;
grant execute on function public.confirm_shared_payment(uuid, uuid, uuid, date) to authenticated;
