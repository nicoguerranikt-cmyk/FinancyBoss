-- ============================================================================
-- FinancyBoss — QR de cobro y comprobante de pago (deudas vinculadas)
-- ============================================================================
-- Primera vez en el proyecto que se sube un archivo (hasta ahora todo era
-- filas en tablas). Alcance acordado con el usuario: SOLO deudas vinculadas
-- (shared_debts, entre dos cuentas reales) — el deudor ya es un usuario de
-- la app, así que puede ver el QR del acreedor y adjuntar su comprobante
-- todo adentro de FinancyBoss. Las deudas locales no tienen a nadie del otro
-- lado dentro de la app, así que quedan afuera de esto.
--
-- Un solo bucket privado ("payment-media", no público): las imágenes nunca
-- se sirven por una URL fija, siempre por signed URL generada del lado del
-- servidor después de validar el pedido contra shared_debts/
-- shared_debt_payments (mismas reglas de siempre, ver
-- app/(app)/shared-debts/actions.ts). Las políticas de storage.objects de
-- abajo son las que de verdad deciden quién puede leer/escribir cada
-- archivo — la signed URL sola no alcanza si la política no lo permite.
--
-- Convención de paths (fijos, sin nombre de archivo variable — un re-upload
-- pisa el anterior con upsert, así no quedan archivos huérfanos). Siempre 3
-- partes: las políticas de más abajo usan storage.foldername(name)[2] para
-- saber de quién/qué pago es un archivo, y foldername() excluye el último
-- tramo del path (lo asume el nombre de archivo) — con un path de 2 partes
-- ese [2] no existe y ninguna política matchea nunca.
--   qr/{user_id}/qr           → QR de cobro del usuario (Más → Perfil)
--   receipts/{payment_id}/receipt → comprobante de un pago propuesto puntual
-- ============================================================================

alter table public.profiles
  add column if not exists payment_qr_path text;

comment on column public.profiles.payment_qr_path is
  'Path (no URL) del QR de cobro en el bucket privado payment-media, carpeta qr/. Null si no subió uno. Se muestra al deudor de una deuda vinculada activa, vía signed URL generada al pedirla.';

alter table public.shared_debt_payments
  add column if not exists receipt_path text;

comment on column public.shared_debt_payments.receipt_path is
  'Path (no URL) del comprobante de este pago en el bucket privado payment-media, carpeta receipts/. Null si el deudor no adjuntó uno — nunca es obligatorio.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-media', 'payment-media', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- ============================================================================
-- Políticas sobre storage.objects (mismo criterio que el resto del
-- proyecto: nada de confiar en la app, todo revalidado acá con SQL)
-- ============================================================================

-- QR: el dueño puede subir/reemplazar/borrar el suyo.
create policy "payment_media_qr_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-media'
    and (storage.foldername(name))[1] = 'qr'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "payment_media_qr_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'payment-media'
    and (storage.foldername(name))[1] = 'qr'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "payment_media_qr_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payment-media'
    and (storage.foldername(name))[1] = 'qr'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- QR: lo puede leer el dueño, o cualquier usuario que tenga (o haya tenido)
-- una deuda vinculada con él como deudor — no cualquiera en la app.
create policy "payment_media_qr_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-media'
    and (storage.foldername(name))[1] = 'qr'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or exists (
        select 1 from public.shared_debts sd
        where sd.creditor_user_id::text = (storage.foldername(name))[2]
          and sd.debtor_user_id = auth.uid()
          and sd.status <> 'rejected'
      )
    )
  );

-- Comprobante: solo el deudor de ESE pago puede subirlo (el pago tiene que
-- existir y esa deuda tiene que ser suya como deudor).
create policy "payment_media_receipt_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-media'
    and (storage.foldername(name))[1] = 'receipts'
    and exists (
      select 1 from public.shared_debt_payments sp
      join public.shared_debts sd on sd.id = sp.shared_debt_id
      where sp.id::text = (storage.foldername(name))[2]
        and sd.debtor_user_id = auth.uid()
    )
  );

create policy "payment_media_receipt_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'payment-media'
    and (storage.foldername(name))[1] = 'receipts'
    and exists (
      select 1 from public.shared_debt_payments sp
      join public.shared_debts sd on sd.id = sp.shared_debt_id
      where sp.id::text = (storage.foldername(name))[2]
        and sd.debtor_user_id = auth.uid()
    )
  );

-- Comprobante: lo puede leer cualquiera de las dos partes de esa deuda.
create policy "payment_media_receipt_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-media'
    and (storage.foldername(name))[1] = 'receipts'
    and exists (
      select 1 from public.shared_debt_payments sp
      join public.shared_debts sd on sd.id = sp.shared_debt_id
      where sp.id::text = (storage.foldername(name))[2]
        and (sd.debtor_user_id = auth.uid() or sd.creditor_user_id = auth.uid())
    )
  );
