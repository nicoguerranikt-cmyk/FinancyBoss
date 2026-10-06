# Simulación de pruebas de FinancyBoss

Una guía para probar la app de punta a punta con **montos fijos y resultados conocidos**. Cada paso dice qué hacer y qué número debe aparecer. Si un número no coincide, anota el paso y la pantalla: ahí está el bug.

Los números de esta guía los comprueba el test [`lib/simulacion.test.ts`](../lib/simulacion.test.ts) (`npm test`): salen del mismo código que usa la app, no de cálculos a mano.

> Formato de los montos: la app muestra `1.288` si es entero y `1.288,50` si tiene centavos. Los centavos nunca se redondean.

---

## 0. Antes de empezar

- [ ] Las migraciones **0001 a 0038** están aplicadas en Supabase (sobre todo 0032 a 0038).
- [ ] Borraste todos los usuarios (Authentication → Users). Comprueba con: `select count(*) from auth.users;` → `0`.
- [ ] Tienes **dos correos** para dos cuentas: **A** (la principal) y **B** (para las deudas vinculadas y el ingreso insuficiente).
- [ ] La app corre (`npm run dev`) o está desplegada, apuntando a ese Supabase.
- [ ] Dos ventanas del navegador, una por cuenta (una en modo incógnito).

**Fecha:** todos los saldos de abajo son independientes del día, salvo "Puedes gastar hoy", que es:

> Puedes gastar hoy = saldo de Gasto ÷ días que quedan del mes (contando hoy)

---

## 1. Cuenta A — registro, login y onboarding

| # | Haz esto | Debe pasar |
|---|---|---|
| 1.1 | Abre la app sin sesión | Te manda a **Login** |
| 1.2 | Ve a **Registro** y crea la cuenta A con nombre, usuario (`cuenta_a`), email y contraseña | Entra, o pide confirmar el email (usa el link) |
| 1.3 | Cierra sesión e inicia sesión con una contraseña **incorrecta** | Mensaje "Email o contraseña incorrectos" (sin decir cuál falló) |
| 1.4 | Inicia sesión bien | Te lleva al **onboarding** |
| 1.5 | Ingreso **3000**, "repetir cada mes" **activado** | Puedes continuar |
| 1.6 | **Ahorro:** categoría `Fondo de emergencia` con monto **300** | — |
| 1.7 | **Gasto:** `Alquiler` **800**, `Mercado` **500,50**, `Transporte` **sin monto** | Escribe `500,50` (con centavos): no se redondea |
| 1.8 | **Inversión:** `Acciones` **200** | Resumen: total asignado **1.800,50**, libre **1.199,50** |
| 1.9 | Termina el onboarding | Llegas al Dashboard |

**Qué debe mostrar el Dashboard (paso 1.9):**

| Dato | Valor |
|---|---|
| Ahorro | 300 |
| Gasto | 1.300,50 |
| Inversión | 200 |
| Dinero libre | 1.199,50 |

**Mi Dinero:** Fondo 300 · Alquiler 800 · Mercado 500,50 · Acciones 200.
**Más → Configuración:** el selector de **Zona horaria** muestra la de tu dispositivo.

---

## 2. Cuenta A — movimientos del mes

Haz los pasos **en orden**. Cada fila dice cómo queda la cuenta después.

| # | Acción | Ahorro | Gasto | Inversión | Dinero libre |
|---|---|---|---|---|---|
| 2.0 | (punto de partida) | 300 | 1.300,50 | 200 | 1.199,50 |
| 2.1 | **Gasto** de **12,50** en Mercado | 300 | **1.288** | 200 | 1.199,50 |
| 2.2 | **Ingreso extra** de **100** en Ahorro → Fondo | **400** | 1.288 | 200 | 1.199,50 |
| 2.3 | **Asignar 200 de Dinero libre** a Inversión → Acciones | 400 | 1.288 | **400** | **999,50** |
| 2.4 | **Ahorro en USD:** depositar **50 USD**; convertir **20 USD = 140 Bs** a Fondo | **540** | 1.288 | 400 | 999,50 |
| 2.5 | **Aumentar el presupuesto de Alquiler en 50**, tomándolo de Ahorro → Fondo | **490** | **1.338** | 400 | 999,50 |

Comprobaciones extra:

- [ ] 2.1: el gasto de `12,50` aparece como **12,50**, no como 13. Mercado queda en **488**.
- [ ] 2.4: el saldo en USD es **30 USD**.
- [ ] 2.5: Alquiler muestra asignado **850**.
- [ ] 2.3, 2.4 y 2.5 (traslados): en **Estadísticas** el "Ingreso total" **no sube** por ellos.

---

## 3. Cuenta A — gasto fijo, deudas y cobros

| # | Acción | Debe pasar |
|---|---|---|
| 3.1 | En Alquiler, activa el **descuento automático** con primera cuota **hoy** | Aparece el aviso "Tienes 1 gasto fijo pendiente de confirmar" (aunque ya haya un reparto este mes) |
| 3.2 | Confirma con **"Ya lo pagué"** | Gasto baja a **538**. Alquiler: asignado 850, usado 800, restante **50** |
| 3.3 | Pulsa "Ya lo pagué" otra vez (o recarga y repite) | Rechaza: **ya está confirmado** |
| 3.4 | **Deudas:** crea `Préstamo` por **600**, sin plan | Se crea; ningún saldo cambia |
| 3.5 | Paga **250,50** desde **Ahorro → Fondo** | Ahorro **239,50** · deuda queda en **349,50** |
| 3.6 | Paga **100** más, igual | Ahorro **139,50** · deuda en **249,50** |
| 3.7 | Intenta pagar **300** | Error: el pago no puede ser mayor al saldo pendiente |
| 3.8 | Intenta pagar desde **Gasto → Alquiler** | Error: es un gasto fijo, elige otra categoría |
| 3.9 | **Deudores:** crea `Juan` con **200** | Se crea |
| 3.10 | Cobra **80**, a Ahorro → Fondo | Ahorro **219,50** · Juan queda en **120** |

> 3.5 y 3.10 prueban que una categoría de Ahorro con aporte mensual **sí** sirve como origen y destino.

Doble clic (H07):
- [ ] En 3.6, haz **doble clic rápido** en "Registrar pago": se registra **un solo** pago de 100 (la deuda queda en 249,50, no en 149,50).

---

## 4. Cuenta A — efecto dominó y déficit

Estado antes: Ahorro 219,50 · Gasto 538.

| # | Acción | Debe pasar |
|---|---|---|
| 4.1 | Gasto de **600** en Transporte (desde el registro rápido del Dashboard) | Gasto **−62**. Aparece el diálogo de déficit: de dónde salió esa plata |
| 4.2 | Elige **"De Ahorro"**, categoría **Fondo**, y confirma | Gasto **0** · Ahorro **157,50** · "Puedes gastar hoy" = 0 |
| 4.3 | Mira la categoría Fondo en Mi Dinero | Sigue en **219,50** (el dominó mueve el pilar, no la categoría; es lo esperado) |

> El botón "Cubrir con Ahorro" (aviso informativo de cuando te pasas del presupuesto *del día* pero el mes sigue positivo) es otro caso y no está en esta secuencia numérica.

**Estado final de la cuenta A (cierra la sección 4):**

| Ahorro | Gasto | Inversión | Dinero libre |
|---|---|---|---|
| **157,50** | **0** | **400** | **999,50** |

**Estadísticas del mes (cuenta A):**

- [ ] **Ingreso total: 3.180** (3.000 + bono 100 + cobro 80). Los traslados 200, 140 y 50 **no** cuentan.
- [ ] Alquiler, Mercado, Transporte y la deuda aparecen como gastos; el "−50" del traslado a Alquiler **no** aparece como gasto de Ahorro.
- [ ] El progreso de deudas muestra `Préstamo` con 350,50 pagados y 249,50 pendientes; deudores muestra `Juan` con 80 cobrados y 120 pendientes.

---

## 5. Cuenta B — ingreso insuficiente

Crea la cuenta B con las **mismas categorías** que la A (Fondo 300, Alquiler 800, Mercado 500,50, Transporte sin monto, Acciones 200), pero en el onboarding **desactiva "repetir cada mes"**.

| # | Acción | Debe pasar |
|---|---|---|
| 5.1 | Entra al Dashboard | Aviso "Confirma tu ingreso de este mes" |
| 5.2 | Confirma un ingreso de **1000** | Aviso: ingreso 1.000 no cubre 1.800,50 · **faltan 800,50 Bs** · *no se reparte nada a tus categorías* |
| 5.3 | Mira Mi Dinero antes de decidir | Las categorías están en **0** (no hay reparto) |
| 5.4 | Pulsa **"Reajustar automáticamente"** | El aviso desaparece |

**Después de 5.4:**

| Pilar | Debe mostrar |
|---|---|
| Ahorro | 166,62 (Fondo 166,62) |
| Gasto | **722,30** (Alquiler **444,32** + Mercado **277,98**) |
| Inversión | 111,08 (Acciones 111,08) |
| Suma | **1.000** exacto (sin centavos perdidos) |

Prueba de las dos pestañas (H06): en una cuenta nueva con "repetir cada mes" activado, termina el onboarding y abre el Dashboard **en dos pestañas casi a la vez**. En Mi Dinero, Fondo debe mostrar **300**, no 600.

---

## 6. Cuentas A y B — deuda vinculada, QR y comprobante

La cuenta A es **deudor** y la B es **acreedor**.

| # | Quién | Acción | Debe pasar |
|---|---|---|---|
| 6.1 | A | Crea una deuda vinculada `Préstamo amigo` por **500** ("yo debo"), invitando a `cuenta_b` por su usuario | B ve la invitación |
| 6.2 | B | **Acepta** | Las dos ven 500 pendientes |
| 6.3 | B | En **Más → Perfil**, sube una imagen de **QR** | Se ve la imagen |
| 6.4 | A | Abre **"Proponer pago"** | Se ve el **QR de B** (antes no salía nunca) |
| 6.5 | A | Propone **100** desde **Ahorro → Fondo**, con una foto de **comprobante** | Queda "pendiente"; los saldos de A **no** cambian todavía |
| 6.6 | B | Abre el pago y pulsa **"Ver comprobante"** | Se ve la foto |
| 6.7 | B | **Confirma** el pago a Ahorro → Fondo | Ver abajo |
| 6.8 | A | Propone **50** más | Queda pendiente |
| 6.9 | B | **Rechaza** con la nota "Falta el comprobante" | A ve el pago rechazado con la nota; ningún saldo cambia |
| 6.10 | A | Propone **600** (más que el saldo) | Error claro |

**Después de 6.7:**

| | Ahorro | Deuda `Préstamo amigo` |
|---|---|---|
| Cuenta A | 157,50 − 100 = **57,50** | queda en **400** |
| Cuenta B | 166,62 + 100 = **266,62** | queda en **400** |

- [ ] Estadísticas de B: **Ingreso total 1.100** (1.000 + 100 recibidos) y la deuda vinculada aparece en "deudores".
- [ ] Estadísticas de A: la deuda vinculada aparece en "progreso de deudas" con 100 pagados.

Reintento sin duplicar (H18): en 6.5, desconecta la red justo al subir el comprobante. Debe decir que **el pago ya fue propuesto** y ofrecer **"Reintentar comprobante"**, sin crear un segundo pago.

---

## 7. Dinero libre y concurrencia

Con la cuenta A (Dinero libre **999,50**):

| # | Acción | Debe pasar |
|---|---|---|
| 7.1 | Abre dos pestañas de **Dinero libre**. En cada una, prepara **asignar 600** a una categoría | — |
| 7.2 | Pulsa "Asignar" en las dos casi al mismo tiempo | **Una** sale bien y la otra da error: *Solo tienes 399.50 Bs de Dinero libre disponibles.* |
| 7.3 | Mira Dinero libre | **399,50** (no −200,50) |

---

## 8. Otras pantallas

- [ ] **Centavos:** registra un gasto de `0,40`: se ve **0,40** y no `0`.
- [ ] **Teclado del celular:** en el registro rápido aparece el teclado con coma/punto.
- [ ] **Animación de navegación:** pulsar el tab en el que ya estás **no** muestra la moneda. Ctrl+clic en un enlace abre otra pestaña **sin** moneda. Navegar a otra pantalla sí la muestra y termina sola.
- [ ] **Eliminar una categoría con saldo** (ej. Transporte en la cuenta A): el total del pilar **no cambia** y aparece una fila "Categorías eliminadas".
- [ ] **Zona horaria (Más):** cambia a otra zona y guarda; vuelve a la tuya. No se mueve ningún movimiento ya guardado.
- [ ] **Errores de red:** con la red cortada, un formulario muestra el error y no se queda en "Guardando…".

---

## 9. Cierre de mes (cuenta A, al final)

El cierre ocurre la primera vez que abres la app el mes siguiente. Para probarlo ahora, **retrocede la fecha de creación** de la cuenta A al mes pasado, en el SQL Editor (cambia el email por el de la cuenta A):

```sql
update public.profiles
   set created_at = date_trunc('month', now()) - interval '10 days'
 where id = (select id from auth.users where email = 'CORREO_DE_LA_CUENTA_A');
```

Recarga el Dashboard. Debe cerrar el mes anterior (sin movimientos) y quedar:

| | Valor |
|---|---|
| Ahorro | 157,50 + 300 de arrastre = **457,50** |
| Gasto | 0 + 1.300,50 de arrastre = **1.300,50** |
| Inversión | 400 + 200 de arrastre = **600** |
| Dinero libre | 999,50 + 1.199,50 del sobrante = **2.199** |

Comprueba en SQL que el cierre guardó el ingreso:

```sql
select year, month, income_amount, budgeted_amount
  from public.monthly_budgets
 where user_id = (select id from auth.users where email = 'CORREO_DE_LA_CUENTA_A')
   and category_id is null
 order by year, month;
```

- [ ] Hay **3 filas** (una por pilar) con `income_amount = 3000`.
- [ ] En **Más** cambia el ingreso a **4000** y guarda. Estadísticas del mes anterior sigue mostrando **3.000** (no 4.000).

---

## Cómo reportar un fallo

Dime: el **número de paso**, lo que **esperabas** y lo que **viste** (con la captura si puedes). Si la app mostró un error, copia el texto exacto.
