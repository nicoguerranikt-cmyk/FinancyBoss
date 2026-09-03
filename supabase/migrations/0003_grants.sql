-- ============================================================================
-- FinancyBoss — Grants para el rol authenticated (Fase 1 MVP)
-- ============================================================================
-- Por qué existe este archivo: al crear el proyecto en Supabase se desactivó
-- "Automatically expose new tables". Esa opción es la que hace que Supabase
-- corra un GRANT automático sobre cada tabla nueva para los roles anon /
-- authenticated. Al estar desactivada, las 8 tablas de 0001_initial_schema.sql
-- quedaron con RLS activado pero SIN grants: el rol "authenticated" no tiene
-- ni siquiera permiso para intentar un SELECT/INSERT/UPDATE, así que Postgres
-- corta la consulta ANTES de llegar a evaluar las políticas de RLS
-- (error 42501 "permission denied for table ...").
--
-- RLS decide QUÉ FILAS puede tocar cada usuario (las suyas, vía auth.uid()).
-- GRANT decide si el ROL puede tocar la tabla EN ABSOLUTO. Hacen falta los dos.
--
-- Los permisos de abajo son los mínimos que necesita el rol "authenticated"
-- según lo que la app efectivamente hace (o va a hacer, según el modelo
-- financiero) en cada tabla — no un GRANT ALL parejo para las 8.
--
-- Es re-ejecutable: GRANT no falla si el permiso ya existe.
-- ============================================================================

-- El rol necesita poder "entrar" al schema public antes de tocar cualquier
-- tabla. Supabase suele dejar esto ya otorgado por defecto, pero lo repetimos
-- acá para que esta migración no dependa de esa suposición.
grant usage on schema public to authenticated;

-- ----------------------------------------------------------------------------
-- profiles — SELECT, INSERT, UPDATE
-- ----------------------------------------------------------------------------
-- La página de onboarding lee el perfil para saber si el usuario ya pasó por
-- ahí (app/page.tsx, app/onboarding/page.tsx). complete_onboarding() hace un
-- upsert (insert ... on conflict do update). No hay DELETE: el perfil se borra
-- en cascada cuando se borra la cuenta en auth.users, y eso lo hace un rol
-- administrativo, no "authenticated".
grant select, insert, update on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- pillars — SELECT, INSERT, UPDATE
-- ----------------------------------------------------------------------------
-- complete_onboarding() hace upsert de los 3 pilares fijos (ahorro/gasto/
-- inversion) por usuario. No hay DELETE: un usuario siempre tiene exactamente
-- esos 3 pilares, nunca se borra uno suelto.
grant select, insert, update on public.pillars to authenticated;

-- ----------------------------------------------------------------------------
-- categories — SELECT, INSERT, UPDATE (sin DELETE)
-- ----------------------------------------------------------------------------
-- complete_onboarding() inserta las subcategorías elegidas y hace un SELECT
-- para no duplicar si se reintenta el onboarding. El propio comentario del
-- schema (0001, línea ~55) es explícito: "La app NUNCA hace DELETE real acá",
-- usa borrado suave con deleted_at (eso es un UPDATE). Por eso no incluye DELETE.
grant select, insert, update on public.categories to authenticated;

-- ----------------------------------------------------------------------------
-- transactions — SELECT, INSERT, UPDATE, DELETE
-- ----------------------------------------------------------------------------
-- Todavía no está cableado en el frontend (fase de onboarding), pero por
-- diseño el usuario registra, edita y puede eliminar un gasto o ingreso
-- extra cargado por error. Es la única de las tablas "de movimiento" sin
-- ninguna nota de "no se borra de verdad", así que lleva DELETE real.
grant select, insert, update, delete on public.transactions to authenticated;

-- ----------------------------------------------------------------------------
-- debts — SELECT, INSERT, UPDATE, DELETE
-- ----------------------------------------------------------------------------
-- El usuario carga sus deudas, actualiza paid_months/remaining_amount/status
-- a medida que paga, y puede eliminar una deuda cargada por error o ya
-- saldada. Sin restricción de borrado documentada en el schema.
grant select, insert, update, delete on public.debts to authenticated;

-- ----------------------------------------------------------------------------
-- debtors — SELECT, INSERT, UPDATE, DELETE
-- ----------------------------------------------------------------------------
-- El comentario del schema (0001, línea ~113) dice que un deudor con pagos
-- parciales se ARCHIVA (UPDATE de status a 'archived') en vez de borrarse,
-- para no perder el historial. Eso implica que el borrado real (DELETE) sí
-- existe como camino normal para deudores SIN pagos parciales todavía.
grant select, insert, update, delete on public.debtors to authenticated;

-- ----------------------------------------------------------------------------
-- monthly_budgets — SELECT, INSERT, UPDATE (sin DELETE)
-- ----------------------------------------------------------------------------
-- Una fila por categoría (o "saldo libre" del pilar) por mes, recalculada a
-- medida que hay transacciones (spent_amount, carried_over). Se crea y se
-- actualiza, pero no hay ningún flujo del modelo que borre un mes ya
-- transcurrido: el historial de presupuestos se conserva.
grant select, insert, update on public.monthly_budgets to authenticated;

-- ----------------------------------------------------------------------------
-- domino_events — SELECT, INSERT (sin UPDATE, sin DELETE)
-- ----------------------------------------------------------------------------
-- Es un log de auditoría: cada vez que el efecto dominó mueve plata entre
-- categorías queda una fila. La app solo necesita crearlas y leerlas, nunca
-- modificarlas. El propio comentario del schema dice que si se borra la
-- transacción que originó el evento, el evento se va con ella "on delete
-- cascade" — ese borrado en cascada lo dispara Postgres internamente al
-- borrar la fila en transactions, y NO requiere que "authenticated" tenga
-- permiso de DELETE sobre domino_events.
grant select, insert on public.domino_events to authenticated;

-- ----------------------------------------------------------------------------
-- Secuencias
-- ----------------------------------------------------------------------------
-- No hace falta ningún GRANT USAGE sobre secuencias: las 8 tablas generan su
-- id con gen_random_uuid() (default de columna), no con serial/bigserial/
-- identity. No hay ninguna secuencia asociada a estas tablas.

-- ============================================================================
-- FIN de los grants.
-- ============================================================================
