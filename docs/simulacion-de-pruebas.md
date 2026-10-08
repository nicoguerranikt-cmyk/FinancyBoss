# Simulación de pruebas de FinancyBoss

Una guía para probar la app de punta a punta con **montos fijos y resultados conocidos**. Cada paso dice qué hacer y qué número debe aparecer. Si un número no coincide, anota el paso y la pantalla: ahí está el bug.

Los números de esta guía los comprueba el test [`lib/simulacion.test.ts`](../lib/simulacion.test.ts) (`npm test`): salen del mismo código que usa la app, no de cálculos a mano.

> Formato de los montos: la app muestra `1.288` si es entero y `1.288,50` si tiene centavos. Los centavos nunca se redondean.

## El modelo, en 4 líneas

- **Gasto = solo tus gastos fijos** (alquiler, servicios…). Su monto es la suma de ellos.
- **Los gastos del día a día no tienen presupuesto**: son categorías para registrar en qué gastas. No bajan el saldo de Gasto.
- **Cada gasto del día a día sale de Dinero libre o de una categoría de Ahorro** (lo eliges al registrarlo). Si el origen no alcanza, se rechaza.
- **"Puedes gastar hoy" = Dinero libre ÷ días que quedan del mes** (contando hoy).

---

## 0. Antes de empezar

- [ ] Las migraciones **0001 a 0042** están aplicadas en Supabase, **en orden** (sobre todo 0032 a 0042). La **0041** cambia el onboarding y agrega el registro de gastos del día a día; la **0042** borra el efecto dominó. Sin ellas la app da errores.
- [ ] Borraste todos los usuarios (Authentication → Users). Comprueba con: `select count(*) from auth.users;` → `0`.
- [ ] Tienes **dos correos** para dos cuentas: **A** (la principal) y **B** (para las deudas vinculadas y el ingreso insuficiente).
- [ ] La app corre (`npm run dev`) o está desplegada, apuntando a ese Supabase.
- [ ] Dos ventanas del navegador, una por cuenta (una en modo incógnito).

**Fecha:** los saldos de abajo no dependen del día. Lo único que depende es "Puedes gastar hoy". Los valores de esta guía suponen **8 de octubre** (quedan 24 días contando hoy). Si pruebas otro día, usa la fórmula:

> Puedes gastar hoy = Dinero libre ÷ días que quedan del mes (contando hoy)

---

## 1. Cuenta A — registro, login y onboarding

| # | Haz esto | Debe pasar |
|---|---|---|
| 1.1 | Abre la app sin sesión | Te manda a **Login** |
| 1.2 | Ve a **Registro** y crea la cuenta A con nombre, usuario (`cuenta_a`), email y contraseña | Entra, o pide confirmar el email (usa el link) |
| 1.3 | Cierra sesión e inicia sesión con una contraseña **incorrecta** | Mensaje "Email o contraseña incorrectos" (sin decir cuál falló) |
| 1.4 | Inicia sesión bien | Te lleva al **onboarding** |
| 1.5 | **Bienvenida** | Explica los pilares, el Dinero libre y que los gastos del día a día no tienen presupuesto (no habla del efecto dominó) |
| 1.6 | Ingreso **3000**, "repetir cada mes" **activado** | Puedes continuar. Se ven **7 barras** arriba |
| 1.7 | **Ahorro:** marca `Fondo de emergencia` y ponle monto **300** (desmarca las demás) | — |
| 1.8 | **Gastos fijos:** marca `Alquiler` con **800** (desmarca los demás) y pon **fecha de cobro = hoy** | Al poner el monto aparece "Fecha de cobro (opcional)". La línea dice: *Gastos fijos: 800 Bs al mes. Te quedan 1.900 Bs libres de tu ingreso* (3.000 − 300 de Ahorro − 800) |
| 1.9 | Prueba: sube el alquiler a **9000** | La línea se pone ámbar ("llevas asignados… más que tu ingreso") y **Continuar** se bloquea. Vuelve a **800** |
| 1.10 | Pulsa **Continuar** | Pasas a **Gastos del día a día** (otra pantalla). **No hay campo de monto ni de presupuesto** |
| 1.11 | Léela y marca `Comida` y `Transporte` | Explica que no llevan monto y que cada gasto sale de Dinero libre o de ahorros |
| 1.12 | **Inversión:** marca una categoría (`Acciones`) y ponle **200** | Resumen: te quedan **1.700 Bs** libres |
| 1.13 | Termina el onboarding | Llegas al Dashboard |

**Qué debe mostrar el Dashboard (paso 1.13):**

| Dato | Valor |
|---|---|
| Ahorro | 300 |
| Gasto | 800 |
| Inversión | 200 |
| Dinero libre | 1.700 |
| **Puedes gastar hoy** | **70,83** (1.700 ÷ 24) |
| Aviso | "Tienes **1 gasto fijo pendiente** de confirmar" (la fecha de cobro del Alquiler es hoy) |

**Mi Dinero:** Fondo 300 · Gasto → "Gastos fijos": Alquiler 800 (pendiente) · "Gastos del día a día": Comida y Transporte, sin presupuesto · Acciones 200.
**Más → Configuración:** el selector de **Zona horaria** muestra la de tu dispositivo.

---

## 2. Cuenta A — movimientos del mes

Haz los pasos **en orden**. Cada fila dice cómo queda la cuenta después.

| # | Acción | Ahorro | Gasto | Inversión | Dinero libre | Puedes gastar hoy |
|---|---|---|---|---|---|---|
| 2.0 | (punto de partida) | 300 | 800 | 200 | 1.700 | 70,83 |
| 2.1 | **Gasto** de **12,50** en **Comida**, sale de **Dinero libre** | 300 | 800 | 200 | **1.687,50** | 70,31 |
| 2.2 | **Ingreso extra** de **100** en Ahorro → Fondo | **400** | 800 | 200 | 1.687,50 | 70,31 |
| 2.3 | **Asignar 200 de Dinero libre** a Inversión → Acciones | 400 | 800 | **400** | **1.487,50** | 61,98 |
| 2.4 | **Ahorro en USD:** depositar **50 USD**; convertir **20 USD = 140 Bs** a Fondo | **540** | 800 | 400 | 1.487,50 | 61,98 |
| 2.5 | **Aumentar el presupuesto de Alquiler en 50**, tomándolo de Ahorro → Fondo | **490** | **850** | 400 | 1.487,50 | 61,98 |
| 2.6 | **Gasto** de **30** en **Transporte**, que sale de **Ahorro → Fondo** | **460** | 850 | 400 | 1.487,50 | 61,98 |

Comprobaciones:

- [ ] 2.1: el gasto aparece como **12,50**, no como 13. **El saldo de Gasto no se mueve** (sigue en 800): es un gasto del día a día.
- [ ] 2.1: en Mi Dinero → Gasto → "Gastos del día a día" aparece **gastado 12,50**, y Comida muestra −12,50 (no tiene presupuesto).
- [ ] 2.1: el formulario de gasto pide la **categoría** (opcional) y **"Sale de"**, y debajo dice *Te quedan 1.700 Bs de Dinero libre*.
- [ ] 2.4: el saldo en USD es **30 USD**.
- [ ] 2.5: Alquiler muestra asignado **850**.
- [ ] 2.6: **"Puedes gastar hoy" no cambia**: salió de Ahorro, no de Dinero libre. Ahorro baja 30.
- [ ] 2.3, 2.4 y 2.5 (traslados): en **Estadísticas** el "Ingreso total" **no sube** por ellos.

---

## 3. Cuenta A — gasto fijo, deudas y cobros

| # | Acción | Debe pasar |
|---|---|---|
| 3.1 | Mira el Dashboard | El aviso "Tienes 1 gasto fijo pendiente de confirmar" **sigue ahí**, aunque ya hubo reparto, ingresos y aumentos después. Un reparto o ingreso posterior no cuenta como pago |
| 3.2 | Entra al Alquiler y confirma con **"Ya lo pagué"** | Gasto baja a **50**. Alquiler: asignado 850, usado 800, restante **50**. El aviso desaparece |
| 3.3 | Pulsa "Ya lo pagué" otra vez (o recarga y repite) | Rechaza: **ya está confirmado** |
| 3.4 | **Deudas:** crea `Préstamo` por **600**, sin plan | Se crea; ningún saldo cambia |
| 3.5 | Paga **250,50** desde **Ahorro → Fondo** | Ahorro **209,50** · deuda queda en **349,50** |
| 3.6 | Paga **100** más, igual | Ahorro **109,50** · deuda en **249,50** |
| 3.7 | Intenta pagar **300** | Error: el pago no puede ser mayor al saldo pendiente |
| 3.8 | Intenta pagar desde **Gasto → Alquiler** | Error: es un gasto fijo, elige otra categoría |
| 3.9 | **Deudores:** crea `Juan` con **200** | Se crea |
| 3.10 | Cobra **80**, a Ahorro → Fondo | Ahorro **189,50** · Juan queda en **120** |

> 3.5 y 3.10 prueban que una categoría de Ahorro con aporte mensual **sí** sirve como origen y destino.

Doble clic:
- [ ] En 3.6, haz **doble clic rápido** en "Registrar pago": se registra **un solo** pago de 100 (la deuda queda en 249,50, no en 149,50).

**Estado final de la cuenta A (cierra la sección 3):**

| Ahorro | Gasto | Inversión | Dinero libre | Puedes gastar hoy |
|---|---|---|---|---|
| **189,50** | **50** | **400** | **1.487,50** | **61,98** |

**Estadísticas del mes (cuenta A):**

- [ ] **Ingreso total: 3.180** (3.000 + bono 100 + cobro 80). Los traslados 200, 140 y 50 **no** cuentan.
- [ ] Los **gastos reales** suman **1.193**: Comida 12,50 + Transporte 30 + Alquiler 800 + deuda 350,50. El lado de Ahorro del gasto de Transporte **no** se cuenta otra vez.
- [ ] El progreso de deudas muestra `Préstamo` con 350,50 pagados y 249,50 pendientes; deudores muestra `Juan` con 80 cobrados y 120 pendientes.
- [ ] **No hay sección "Efecto dominó"** en Estadísticas.

---

## 4. Cuenta A — el origen tiene que alcanzar

Con Dinero libre en **1.487,50** y Fondo en **189,50**:

| # | Acción | Debe pasar |
|---|---|---|
| 4.1 | Gasto de **2000** en Comida, sale de **Dinero libre** | Error: *Solo tienes 1487.50 Bs de Dinero libre disponibles.* **No se guarda nada**: Dinero libre sigue en 1.487,50 |
| 4.2 | Gasto de **500** en Comida, sale de **Ahorro → Fondo** | Error: *Esa categoría de Ahorro solo tiene 189.50 Bs disponibles.* Nada cambia |
| 4.3 | Gasto de **50**, sale de **Ahorro** sin elegir categoría | Pide elegir una categoría de Ahorro |
| 4.4 | Abre el registro de **Ingreso extra** | **Gasto no aparece** como pilar elegible (solo Ahorro, Inversión y Dinero libre) |

---

## 5. Cuenta B — ingreso insuficiente

Crea la cuenta B con **lo mismo** que la A (Fondo 300, Alquiler 800 con fecha de cobro, Comida y Transporte del día a día, Acciones 200), pero en el onboarding **desactiva "repetir cada mes"**.

| # | Acción | Debe pasar |
|---|---|---|
| 5.1 | Entra al Dashboard | Aviso "Confirma tu ingreso de este mes" |
| 5.2 | Confirma un ingreso de **1000** | Aviso: ingreso 1.000 no cubre 1.300 · **faltan 300 Bs** · *no se reparte nada a tus categorías* |
| 5.3 | Mira Mi Dinero antes de decidir | Las categorías están en **0** (no hay reparto) |
| 5.4 | Pulsa **"Reajustar automáticamente"** | El aviso desaparece |

**Después de 5.4:**

| Pilar | Debe mostrar |
|---|---|
| Ahorro | 230,77 (Fondo 230,77) |
| Gasto | **615,38** (el Alquiler se reduce a **615,38**) |
| Inversión | 153,85 (Acciones 153,85) |
| Suma | **1.000** exacto (sin centavos perdidos) |
| Dinero libre | **0** → "Puedes gastar hoy" = 0 con el aviso *Ya no te queda Dinero libre este mes* |

Prueba de las dos pestañas: en una cuenta nueva con "repetir cada mes" activado, termina el onboarding y abre el Dashboard **en dos pestañas casi a la vez**. En Mi Dinero, Fondo debe mostrar **300**, no 600.

---

## 6. Cuentas A y B — deuda vinculada, QR y comprobante

La cuenta A es **deudor** y la B es **acreedor**.

| # | Quién | Acción | Debe pasar |
|---|---|---|---|
| 6.1 | A | Crea una deuda vinculada `Préstamo amigo` por **500** ("yo debo"), invitando a `cuenta_b` por su usuario | B ve la invitación |
| 6.2 | B | **Acepta** | Las dos ven 500 pendientes |
| 6.3 | B | En **Más → Perfil**, sube una imagen de **QR** | Se ve la imagen |
| 6.4 | A | Abre **"Proponer pago"** | Se ve el **QR de B** |
| 6.5 | A | Propone **100** desde **Ahorro → Fondo**, con una foto de **comprobante** | Queda "pendiente"; los saldos de A **no** cambian todavía |
| 6.6 | B | Abre el pago y pulsa **"Ver comprobante"** | Se ve la foto |
| 6.7 | B | **Confirma** el pago a Ahorro → Fondo | Ver abajo |
| 6.8 | A | Propone **50** más | Queda pendiente |
| 6.9 | B | **Rechaza** con la nota "Falta el comprobante" | A ve el pago rechazado con la nota; ningún saldo cambia |
| 6.10 | A | Propone **600** (más que el saldo) | Error claro |

**Después de 6.7:**

| | Ahorro | Deuda `Préstamo amigo` |
|---|---|---|
| Cuenta A | 189,50 − 100 = **89,50** | queda en **400** |
| Cuenta B | 230,77 + 100 = **330,77** | queda en **400** |

- [ ] Estadísticas de B: **Ingreso total 1.100** (1.000 + 100 recibidos) y la deuda vinculada aparece en "deudores".
- [ ] Estadísticas de A: la deuda vinculada aparece en "progreso de deudas" con 100 pagados.

Reintento sin duplicar: en 6.5, desconecta la red justo al subir el comprobante. Debe decir que **el pago ya fue propuesto** y ofrecer **"Reintentar comprobante"**, sin crear un segundo pago.

> Si hiciste la sección 6, el estado de la cuenta A cambió (Ahorro 89,50). Para la sección 7 usa los números de abajo, que **no dependen de Ahorro**.

---

## 7. Cuenta A — cierre de mes

El cierre ocurre la primera vez que abres la app el mes siguiente. Para probarlo ahora, **retrocede la fecha de creación** de la cuenta A al mes pasado, en el SQL Editor (cambia el email por el de la cuenta A):

```sql
update public.profiles
   set created_at = date_trunc('month', now()) - interval '10 days'
 where id = (select id from auth.users where email = 'CORREO_DE_LA_CUENTA_A');
```

Recarga el Dashboard. Debe cerrar el mes anterior (sin movimientos). Lo que cambia es el **Dinero libre** (el sobrante del mes pasado: 1.700) y los **arrastres**:

| | Valor |
|---|---|
| Gasto | 50 + 800 de arrastre = **850** (en la cuenta A sin la sección 6: ver abajo) |
| Inversión | 400 + 200 de arrastre = **600** |
| Dinero libre | 1.487,50 + 1.700 del sobrante = **3.187,50** |
| Puedes gastar hoy | 3.187,50 ÷ 24 = **132,81** |

> Con la sección 6 hecha, Ahorro es 89,50 + 300 de arrastre = **389,50**. Sin ella: 189,50 + 300 = **489,50**.

> El saldo de Gasto de un mes cerrado: el mes pasado, sin movimientos, dejó 800 de sobrante; ese 800 se suma a este mes. De ahí el 850 (50 + 800).

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

## 8. Concurrencia (cuenta A, después del cierre)

Con Dinero libre en **3.187,50**:

| # | Acción | Debe pasar |
|---|---|---|
| 8.1 | Abre dos pestañas de **Dinero libre**. En cada una, prepara **asignar 2000** a una categoría | — |
| 8.2 | Pulsa "Asignar" en las dos casi al mismo tiempo | **Una** sale bien y la otra da error: *Solo tienes 1187.50 Bs de Dinero libre disponibles.* |
| 8.3 | Mira Dinero libre | **1.187,50** (no −812,50) |

---

## 9. Otras pantallas

- [ ] **Centavos:** registra un gasto de `0,40`: se ve **0,40** y no `0`.
- [ ] **Teclado del celular:** en el registro rápido aparece el teclado con coma/punto.
- [ ] **Animación de navegación:** pulsar el tab en el que ya estás **no** muestra la moneda. Ctrl+clic en un enlace abre otra pestaña **sin** moneda. Navegar a otra pantalla sí la muestra y termina sola.
- [ ] **Eliminar una categoría con saldo** (ej. Comida, que tiene gastos): el total no cambia y aparece una fila "Categorías eliminadas".
- [ ] **Zona horaria (Más):** cambia a otra zona y guarda; vuelve a la tuya. No se mueve ningún movimiento ya guardado.
- [ ] **Errores de red:** con la red cortada, un formulario muestra el error y no se queda en "Guardando…".
- [ ] **Configuración de un gasto fijo:** en la categoría Alquiler ya **no** aparece "Reservar del presupuesto desde ya": solo la fecha, la frecuencia y el texto *Cuando llegue la fecha te avisamos y tú confirmas*.

---

## Cómo reportar un fallo

Dime: el **número de paso**, lo que **esperabas** y lo que **viste** (con la captura si puedes). Si la app mostró un error, copia el texto exacto.
