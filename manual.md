# FinancyBoss — Manual Funcional
### Versión 2.0 | Fase 1 MVP

---

## Índice
1. Autenticación y Onboarding
2. Pilares y Subcategorías
3. Ingresos
4. Efecto Dominó
5. Presupuesto Diario Disponible
6. Deudas
7. Deudores
8. Estadísticas
9. Navegación principal
10. Esquema de base de datos
11. Casos límite y reglas generales

---

## 1. Autenticación y Onboarding

### 1.1 Autenticación

| Campo | Detalle |
|---|---|
| Registro | Nombre + email + contraseña |
| Login | Email + contraseña |
| Recuperación | Link de reset por email (automático) |
| Login social | No en MVP |
| Sesión | Permanente hasta cierre manual |

### 1.2 Onboarding

El onboarding es **obligatorio**. El usuario no puede acceder al dashboard hasta completarlo. Consta de 6 pantallas en orden fijo. **Migración 0030:** ya no hay una pantalla de "monto total por pilar" separada de las categorías — hay una pantalla por pilar, y el monto de cada pilar sale de sumar el de sus propias categorías (no se puede saltear ningún pilar sin pasar por su pantalla).

---

**Pantalla 0 — Bienvenida y concepto**

Explica en lenguaje simple cómo funciona FinancyBoss. Máximo 3 ideas clave:
- *"Tu plata se divide en 3 pilares: Ahorro, Gasto e Inversión."*
- *"Tú decides cuánta plata va a cada categoría dentro de cada pilar."*
- *"Cuando te excedas en algo, te decimos exactamente qué meta estás sacrificando."*

También adelanta, sin entrar en detalle, que más adelante se puede ahorrar en USD y mover el Dinero libre a cualquier categoría.

Botón: **"Empecemos"** — no se puede saltar pero se puede leer rápido.

---

**Pantalla 1 — Ingreso mensual**

Contexto mostrado al usuario: *"Este es el dinero con el que trabajaremos cada mes. Puedes ajustarlo cuando quieras."*

- Campo numérico: ingreso mensual base (mayor a $0 para continuar).
- Toggle: *"Repetir automáticamente cada mes"* — activado por default.
- Botón: **"Continuar"** (habilitado solo con valor > 0).

---

**Pantallas 2, 3 y 4 — Ahorro, Gasto e Inversión (una por pilar)**

Mismo formato en los 3 pilares, en este orden fijo. Por cada pilar:

- Lista de categorías sugeridas con checkbox para activar/desactivar (tabla abajo), más un campo para agregar las propias.
- Cada categoría activada tiene un campo de **monto opcional en Bs**: con monto, se descuenta directo del ingreso cada mes (`categories.fixed_amount`); sin monto, queda como categoría variable — ahí se va anotando lo que se gaste/ahorre sin un monto mensual fijo (mismo concepto que ya existía para "Gastos fijos" de Gasto, migración 0023 lo generalizó a los 3 pilares).
- El monto del pilar (`pillars.monthly_amount`) **no se pide aparte**: se calcula sumando el monto de todas sus categorías.
- Indicador en vivo: cuánto lleva ese pilar y cuánto queda libre en total (ingreso − suma de TODAS las categorías de los 3 pilares, se vayan completando o no).
- Botón **"Continuar"** (bloqueado solo si la suma total ya supera el ingreso — "no se puede fabricar plata de la nada"; sumar menos es válido y normal).
- Botón **"Atrás"** vuelve al pilar anterior (o a Ingreso mensual desde Ahorro) sin perder lo ya cargado.

Subcategorías sugeridas por pilar:

| Ahorro | Gasto | Inversión |
|---|---|---|
| Fondo de emergencia | Comida | Proyecto personal |
| Viajes | Transporte | Educación |
| Meta específica | Vivienda | Otro |
| Imprevistos | Gastos diarios | |

---

**Pantalla 5 — Dinero libre**

Después de Inversión (el último pilar), antes de terminar: explica que todo lo que no se asignó a ninguna categoría de los 3 pilares pasa directo a Dinero libre (§3.5) — plata sin destino específico, para gastar en lo que quieras.

- Muestra el monto que quedó libre con lo que el usuario cargó, repartido en las mismas 4 vistas que la pantalla real (`/mi-dinero/libre`): por mes / por quincena / por semana / por día, según lo que queda del mes en curso.
- Aclara que esto se va a ver siempre actualizado desde "Mi Dinero → Dinero libre", y que desde ahí se puede registrar un gasto, anotar un ingreso extra, o asignar parte de esa plata a una categoría más adelante (migración 0028, §3.5).
- Botón: **"Ir al dashboard"** para finalizar — recién acá se llama a `complete_onboarding`.

---

**Post-onboarding — primer acceso al dashboard**

Al entrar por primera vez aparece un único tooltip en el botón de registrar gasto:
*"Desde acá registrás cada gasto. Probalo ahora."*
No hay tour completo de la app.

---

## 2. Pilares y Subcategorías

### 2.1 Pilares

- Existen exactamente 3 pilares fijos: **Ahorro, Gasto, Inversión**.
- No se pueden borrar, renombrar ni reordenar.
- Cada pilar tiene un **monto fijo en Bs** definido por el usuario (migración 0020 — ya no es un % del ingreso). El usuario lo edita desde Mi Dinero; no se recalcula solo si el ingreso cambia.
- Los 3 montos **no pueden sumar más que el ingreso** ("no se puede fabricar plata de la nada"). Pueden sumar menos: la diferencia es **dinero libre**, sin destino asignado (ver `computeDashboard`, campo `freeMoney`).
- Si el ingreso confirmado de un mes baja por debajo de lo que ya suman los 3 pilares, **la app avisa cuánto falta** (aviso en el Dashboard) y **no genera el reparto a categorías** hasta que el usuario decida, con un botón:
  - **Reajustar automáticamente:** el reparto de ese mes se genera con los 3 pilares reducidos proporcionalmente al ingreso (ej. ingreso 600 y pilares que suman 1.200 → todo a la mitad).
  - **Ajustar yo en Mi Dinero:** el usuario edita sus montos; cuando entran en el ingreso, el reparto se genera normal.
  - Nunca se mueve plata sin que el usuario lo pida. La configuración de Mi Dinero no se toca con el reajuste: solo afecta ese mes. Mientras no decide, el presupuesto del Dashboard ya usa los montos reducidos (misma regla, `incomeCoverage` en `lib/dashboard.ts`), así que nunca muestra más plata de la que hay.

### 2.2 Subcategorías

- Ilimitadas por pilar, creadas y nombradas libremente por el usuario.
- El MVP permite máximo **2 niveles**: Pilar → Subcategoría. Sin sub-subcategorías.
- **Migración 0023:** cada subcategoría tiene un **monto fijo en Bs** (`categories.fixed_amount`), no un % — mismo criterio que ya tenían los pilares (migración 0020) y los gastos fijos de Gasto (migración 0019). Se reutiliza la misma columna y el mismo motor de reparto (`lib/monthlyAllocation.ts`) para los 3 pilares por igual.
  - Ejemplo: Gasto = 2000 Bs/mes. Dentro de Gasto, "Mercado" = 500 Bs/mes (monto fijo, no %).
- Si la suma de los montos de las subcategorías de un pilar supera el monto del pilar, se escala todo proporcionalmente (nunca se reparte más plata de la que hay) — **no bloquea** al guardar, es la misma lógica de "gastos fijos que superan el presupuesto" que ya existía para Gasto.
- El saldo de un pilar sin asignar a subcategorías queda en la categoría **"general"** de ese pilar (recibe automáticamente lo que sobra).
- Auto-descontarse solo en una fecha (`auto_repeat` + frecuencia) sigue siendo exclusivo de categorías del pilar **Gasto** — un aporte a Ahorro/Inversión no tiene ese concepto, solo el monto mensual.

### 2.3 Cambios a mitad de mes

- Cualquier cambio de monto (pilar o subcategoría) aplica **desde ese momento hacia adelante**.
- Los gastos, ahorros o inversiones ya registrados **no se tocan retroactivamente**.
- El sistema recalcula el saldo disponible para el resto del mes con los nuevos montos.

### 2.4 Ahorro con propósito (migración 0022)

- Cualquier categoría del pilar Ahorro (incluida la general) puede tener una **meta**: un monto objetivo + una fecha para llegar a él (`categories.goal_amount` / `goal_target_date`).
- Con la meta puesta, la app calcula al vuelo un **aporte mensual sugerido** = (meta − acumulado) / meses que faltan (ver `lib/savingsGoal.ts`). Es solo informativo: **no se guarda, no cambia el monto de la categoría ni mueve plata sola** — el usuario decide si ajusta su monto a partir de esa sugerencia.
- La pantalla de la categoría muestra una barra de progreso (acumulado / meta) además del número sugerido.
- **Ahorro previo:** el usuario puede registrar plata que ya tenía ahorrada antes de usar la app (`registerPastSavings`, en `app/(app)/mi-dinero/actions.ts`) — es un ingreso extra común, con la descripción fija "Ahorro previo" para poder identificarlo en el historial. No es una tabla ni un mecanismo nuevo, sigue las mismas reglas de contabilidad que cualquier otro movimiento (queda trackeado, sube el acumulado de la categoría y el saldo del pilar Ahorro ese mes).

### 2.5 Retorno de inversión

- En cualquier categoría del pilar Inversión que no sea la general, hay un botón **"Registrar retorno"** para cargar la ganancia de esa inversión puntual, con fecha propia (no asume "hoy"). El usuario elige uno de 3 destinos (`registerInvestmentReturn`, en `app/(app)/mi-dinero/actions.ts`):
  1. **A Dinero libre** — ingreso a `free_money_transactions`, plata líquida sin destino.
  2. **Reinvertir acá** — ingreso extra a la MISMA categoría de Inversión: aumenta el capital acumulado de esa inversión.
  3. **A una categoría de Ahorro** — el usuario elige a cuál de sus categorías de Ahorro (por ejemplo, si se armó una propia como "Ganancias").
- No se creó ninguna tabla nueva: los 3 destinos reusan `free_money_transactions` y `transactions`, con las mismas reglas de contabilidad que cualquier otro movimiento — cada retorno queda trackeado y con su origen claro.

### 2.6 Ahorro en USD (fase 1, migración 0027)

Primer paso hacia multi-moneda, a propósito acotado: **no** es un pilar nuevo ni moneda por categoría — es un solo pozo en dólares que vive dentro de la pantalla de Ahorro (`/mi-dinero/[pillarId]/usd`, solo para ese pilar).

- **Agregar USD**: el usuario deposita dólares. No toca nada de Bs.
- **Convertir a Bs**: el usuario dice cuántos USD saca y a cuántos Bs equivalen **hoy** — el tipo de cambio es siempre manual, nunca automático (en Bolivia varía día a día y no hay una fuente única confiable). Elige a qué categoría de Ahorro va esa plata ya convertida.
- La conversión no puede superar lo que hay en el pozo ("no se puede fabricar plata de la nada", mismo criterio que el resto del proyecto).
- Las dos escrituras de una conversión (restar del pozo en USD, sumar el ingreso en Bs a la categoría) son **atómicas**: corren dentro de una función de Postgres (`convert_usd_savings_to_bs`), mismo criterio que `confirm_shared_payment` — quedan las dos filas o ninguna, nunca a medias.
- No afecta el resto de la app: pilares, presupuesto diario, efecto dominó, todo sigue igual.

### 2.7 Monto mensual vs. monto ya acumulado (Ahorro/Inversión)

Una confusión posible: `categories.fixed_amount` en una categoría de Ahorro/Inversión es el aporte que le llega **cada mes** del reparto del pilar — no el total que el usuario ya tenía ahorrado/invertido antes de usar la app. Son dos cosas distintas, con su propio lugar:

- **Monto mensual** (Configuración → "Monto mensual (Bs)"): cuánto se le suma cada mes.
- **Monto ya acumulado antes de la app**: se carga una sola vez con un botón en Consulta — "Registrar ahorro previo" (Ahorro) o "Registrar monto ya invertido" (Inversión), ambos por `registerPastSavings`/`registerPastInvestment` en `app/(app)/mi-dinero/actions.ts`. Es un ingreso extra común, con descripción fija ("Ahorro previo" / "Inversión previa") para identificarlo en el historial — no una tabla nueva, mismas reglas de contabilidad que cualquier otro movimiento.

La pantalla de Configuración aclara esta distinción con un texto debajo del campo de monto mensual, apuntando al botón correcto.

---

## 3. Ingresos

### 3.1 Ingreso base mensual

- El usuario define un ingreso base mensual durante el onboarding.
- **Toggle en configuración:** si está activado, el ingreso base se repite automáticamente cada mes. Si está desactivado, el sistema solicita ingresarlo manualmente al inicio de cada mes.
- Default: toggle activado.
- Desde la migración 0020 (pilares con monto fijo, no %), confirmar el ingreso de un mes es un solo paso — ya no hay una pantalla de "revisar cómo se reparte", porque los montos de pilares y categorías son fijos y no dependen de cuánto se confirme cada mes (ver §2.1 sobre qué pasa si el ingreso baja por debajo de lo que ya suman los pilares).

### 3.1.1 Zona horaria

- Cada usuario guarda **su zona horaria** (`profiles.timezone`, migración 0035; nombre IANA, ej. `America/La_Paz`). Los usuarios que ya existían quedan en `America/La_Paz`.
- Define qué es **"hoy"** y dónde **empieza y termina cada mes**: la fecha de cada movimiento, el cierre de mes, el presupuesto diario, los vencimientos de gastos fijos y deudas. En la app se calcula con `todayIn(zona)` (`lib/dashboard.ts`) y en la base con `user_today()`; nunca con `current_date` ni con una zona fija.
- Se **detecta una vez**, en el onboarding, con la zona del dispositivo, y se puede **cambiar en Más → Configuración** (también hay un botón "Usar la de mi dispositivo").
- No se sigue al dispositivo en cada uso a propósito: si el fin de mes se moviera al viajar, un movimiento podría caer en otro mes y los meses ya cerrados quedarían inconsistentes.
- Cambiar la zona **no mueve** los movimientos ya guardados ni reabre los meses cerrados: solo afecta lo que se registre o calcule de ahí en adelante.
- Soporta zonas con horario de verano: el inicio de cada mes se calcula a la medianoche local de esa fecha.
- Solo es la hora: la moneda sigue siendo Bs (ver §1).

### 3.2 Ingresos extra

- El usuario puede registrar ingresos extra en cualquier momento del mes (freelance, bonos, regalos, etc.).
- Al registrar un ingreso extra, el usuario **elige manualmente** a qué pilar o subcategoría va ese dinero.
- No se reparte solo: el usuario decide a dónde va.

### 3.3 Acumulación de saldos entre meses

- Los saldos no utilizados de **todos los pilares** (Ahorro, Gasto e Inversión) se acumulan al mes siguiente.
- ⚠️ *Nota de riesgo:* que Gasto acumule puede hacer crecer indefinidamente el presupuesto de gastos si el usuario es muy frugal. A monitorear con usuarios reales en Fase 1.

### 3.4 Distribución del ingreso

```
Ingreso total
  → Ahorro (monto fijo en Bs)
  → Gasto (monto fijo en Bs)
  → Inversión (monto fijo en Bs)
  → Dinero libre = lo que sobra (nunca negativo)
```

Los 3 montos los define el usuario en Mi Dinero (migración 0020) y no
pueden sumar más que el ingreso. Los pagos de deuda (sección 6) no se
descuentan de este cálculo: son un gasto normal contra el pilar/categoría
que el usuario elige al registrar el pago, igual que cualquier otro
movimiento.

### 3.5 Dinero libre

- Es el ingreso menos lo que suman los 3 pilares — plata sin destino
  asignado (ver `lib/dashboard.ts` `computeDashboard`, campo `freeMoney`).
- Nunca es negativo: si los pilares ya configurados no entran en el ingreso
  de un mes puntual, se escalan los 3 proporcionalmente para ese mes (ver
  §2.1) en vez de mostrar un dinero libre negativo.
- Tiene su propia pantalla (`/mi-dinero/libre`, tarjeta violeta — no usa la
  paleta de pilares, porque no es un pilar) e historial propio en la tabla
  `free_money_transactions` (migración 0021):
  - **Crédito automático de fin de mes**: al cerrar un mes (`lib/monthClose.ts`
    `closeOneMonth`), si ese mes sobró algo, queda acreditado para siempre —
    mismo criterio "aritmética sobre un mes que ya terminó, sin pedir
    confirmación" que ya usa el arrastre de saldo de los pilares. Si sobró 0,
    no genera fila.
  - **El total que se muestra es líquido disponible YA, no algo que recién
    aparece al cerrar el mes**: es lo ya acreditado (`free_money_transactions`,
    meses cerrados + movimientos a mano) **más** `freeMoney` del mes en curso
    todavía sin cerrar (mismo cálculo que `computeDashboard`). El Dashboard,
    Mi Dinero y `/mi-dinero/libre` suman ambas partes antes de mostrar el
    número — ningún lugar muestra solo lo acreditado, sería mostrar de menos
    (corregido: antes de esto, el total mostrado ignoraba el mes en curso y
    daba 0 Bs hasta que el mes cerraba, lo cual confundía al usuario).
  - **Movimiento manual**: el usuario puede cargar un gasto o ingreso puntual
    contra esta plata sin destino, con su propio botón "Registrar" — nunca es
    algo que la app haga sola (ver principio "no asumir movimientos de
    plata").
  - El historial se ve apilado por fecha, en rojo los gastos y en verde los
    ingresos (créditos automáticos + movimientos manuales).
  - La pantalla muestra el total disponible repartido de 4 formas (por mes /
    por quincena / por semana / por día, según lo que queda del mes en curso)
    — son 4 vistas del mismo total, no una configuración guardada.
  - **Pantalla final del onboarding**: después de configurar los 3 pilares,
    el onboarding muestra una vista previa de este mismo reparto (mes/
    quincena/semana/día) con lo que haya quedado libre, para que quede claro
    desde el principio que lo no asignado a ningún pilar no se pierde — pasa
    acá, y la app lo repite siempre actualizado en esta pantalla real.
  - El Dashboard muestra el total acumulado con un acceso directo a esta
    pantalla.
  - **Asignar a una categoría** (migración 0028): desde la propia pantalla, el
    usuario puede mandar parte de su Dinero libre a cualquier categoría
    (Ahorro, Gasto o Inversión) — por ejemplo, para fondear un gasto fijo
    nuevo o reforzar una meta de ahorro. Mismo patrón que convertir USD a Bs
    (migración 0027): las dos escrituras (restar del pozo, sumar el ingreso
    en la categoría) son atómicas (`allocate_free_money_to_category`), y no
    se puede asignar más de lo que el total disponible permite (acreditado +
    lo que sobra del mes en curso).
  - El acceso rápido del Dashboard (`QuickAddForm`) tiene "Dinero libre" como
    destino elegible, tanto en "Gasto" ("Sale de: Gasto / Dinero libre") como
    en "Ingreso extra" (junto a los 3 pilares) — un movimiento cargado ahí
    contra Dinero libre va directo a `free_money_transactions` (no a
    `transactions`), así que aparece en el mismo historial que
    `/mi-dinero/libre`, sin importar desde qué pantalla se cargó. No pasa por
    el efecto dominó (eso solo aplica a pilares/categorías reales).

---

## 4. Efecto Dominó

### 4.0 Principio fundamental: toda la plata está trackeada

FinancyBoss es contabilidad real, no un presupuesto aproximado. **La plata nunca aparece ni desaparece por arte de magia.** Si el usuario gasta dinero que no tenía disponible, ese dinero salió de algún lado concreto y el sistema debe registrar de dónde.

Corolario: el sistema **nunca mueve dinero entre categorías por su cuenta**. O el movimiento es consecuencia matemática de la plata que el usuario ya tenía, o el usuario declara explícitamente el origen.

### 4.1 Los tres niveles de dinero

```
Ingreso total
  − Ahorro (monto fijo en Bs)     ← comprometido, no se toca
  − Inversión (monto fijo en Bs)  ← comprometido, no se toca
  − Gastos fijos "reservados"     ← comprometido (ver sección 4.2)
= Plata discrecional del mes
  ÷ Días restantes
= Presupuesto diario disponible
```

### 4.2 Gastos fijos vs. gastos variables

Cada subcategoría del pilar Gasto es de uno de estos dos tipos:

| Tipo | Cómo se define | Efecto en el presupuesto diario |
|---|---|---|
| **Fijo** | Tiene un monto asignado (ej. Vivienda 800 Bs, Internet 100 Bs, Mercado 500 Bs) + una fecha de inicio y una frecuencia ("cada N días/meses"). Recibe ese monto tal cual en el reparto mensual | Configurable por categoría (ver abajo) |
| **Variable** | Sin monto fijo asignado (ej. Comida, Transporte, Ocio) — sale directo del saldo general de Gasto | Sale del pool discrecional que **sí alimenta** el presupuesto diario |

**Sin %, en ningún lado de Mi Dinero** (pedido del usuario): ni en los pilares, ni en las categorías, ni siquiera como dato informativo — todo se ve en Bs. La app internamente calcula proporciones (ej. para escalar montos si el ingreso no alcanza, ver §2.1), pero no las muestra en pantalla.

**Frecuencia flexible:** al activar "descontar automáticamente" en un gasto fijo, el usuario elige la fecha de la primera cuota (con un calendario real) y cada cuántos días o meses se repite — ya no es siempre "una vez al mes, el día 1". Si no está activo, el usuario lo registra manualmente cuando efectivamente lo paga.

**Reservar desde ya vs. recién cuando toca (configurable por categoría):** cada gasto fijo con descuento automático elige uno de estos dos comportamientos:
- **Reservar desde ya:** el presupuesto diario ya descuenta este gasto (prorrateado según su frecuencia) aunque la fecha real de la cuota todavía no haya llegado — es la plata comprometida que describe la sección 4.1. Evita enterarse tarde de que esa plata ya no es disponible.
- **Recién cuando toca:** el presupuesto diario se mantiene alto hasta el día exacto configurado, y ahí baja (al confirmarse el pago, no antes — ver el recordatorio de abajo).

**Es un recordatorio, nunca un descuento silencioso:** cuando llega la fecha de un gasto fijo con descuento automático, la app NO le mete solo la transacción — mismo criterio que el plan de pago automático de Deudas ("no asumir movimientos de plata"). El Dashboard avisa *"Tienes N gastos fijos pendientes de confirmar"* (link a Gastos fijos), la categoría se marca "Pendiente de confirmar" en la lista, y recién cuando el usuario entra y toca **"Ya lo pagué"** (`confirmFixedExpense`, `app/(app)/mi-dinero/actions.ts`) se registra el gasto de verdad, fechado en la fecha real del vencimiento. Tocar el botón dos veces, o recargar la página, no duplica el registro (mismo chequeo de idempotencia que `confirmAutoPayment` de Deudas: si ya hay una transacción en o después de esa fecha, no deja confirmar de nuevo).

**Nota de diseño:** esta distinción resuelve la ambigüedad de categorías como "Comida", que puede significar el mercado mensual (fijo, monto conocido) o salir a comer (variable). Se resuelven con nombres distintos: **Mercado** (fijo) y **Comida** (variable).

**Dos pantallas separadas:** dentro de Mi Dinero → Gasto, "Gastos fijos" y "Gastos variables" (nombre visible al usuario — la ruta interna sigue siendo `/cotidianos`, solo cambió el texto) tienen cada una su propio dashboard y su propio total acumulado, en vez de mezclarse en una sola lista larga. Una categoría se puede crear de dos formas: desde "Gastos variables" (nace variable, sin monto) o directo desde "Gastos fijos" con su monto puesto desde el arranque (sin tener que pasar primero por Configuración para "promoverla").

**Un gasto fijo que un mes puntual sale más caro** (ej. Internet, siempre 100 Bs, este mes te llegó 150 Bs): no se toca el monto fijo (que sigue siendo 100 Bs los meses siguientes) — en la pantalla de esa categoría hay un control **"Aumentar presupuesto este mes"** (`bumpFixedExpenseThisMonth`, en `app/(app)/mi-dinero/actions.ts`) que le suma esos 50 Bs de más solo a este mes. Es la única vía para meterle más presupuesto a una categoría de Gasto — no existe una alternativa genérica de "ingreso extra a Gasto" (ver §5.4).

**Migración 0031 — la plata tiene que salir de algún lado real:** esos 50 Bs de más no se fabrican solos, el usuario elige explícitamente la fuente:
- **Disponible general (Dinero libre)**: reutiliza `allocate_free_money_to_category` (migración 0028) — ya acepta Gasto como destino.
- **Un ahorro puntual**: el usuario elige qué categoría de Ahorro (se le muestra su saldo disponible); `fund_fixed_expense_from_savings` valida que tenga suficiente y debita esa categoría atómicamente junto con el crédito a Gasto — las dos escrituras quedan las dos o ninguna, mismo criterio que `confirm_shared_payment`/`convert_usd_savings_to_bs`.

**Modalidad y estado de un gasto fijo (pantalla de la categoría, pestaña Consulta):** no es una columna nueva — se deriva de `auto_repeat` (si ya tiene fecha/frecuencia configuradas):
- **Pago único mensual** (`auto_repeat = true`, ej. gimnasio, alquiler): estado **Programado** (todavía no llega la fecha este mes), **Pendiente de confirmar** (llegó la fecha, ver el recordatorio de arriba) o **Pagado**.
- **Consumo gradual** (`auto_repeat = false`, ej. mercado, que se gasta de a poco en el mes): estado **Disponible** o **Presupuesto agotado** (restante de este mes en 0 o menos).

En ambos casos se muestran 3 números de **este mes** (no el acumulado histórico de arriba, que es de todos los tiempos): **Asignado** (el monto fijo + lo que se haya aumentado este mes puntual), **Usado** (suma de los gastos reales registrados este mes) y **Restante** (la resta de los dos anteriores).

### 4.3 Comportamiento cuando el usuario se excede

**Caso 1 — Se pasa del límite diario pero hay margen en el mes:**

No se pregunta nada. La plata sigue siendo del mismo pozo discrecional del usuario, así que está trackeada. El sistema:
- Recalcula el presupuesto diario para los días restantes (reajuste proporcional automático).
- Muestra un aviso informativo: *"Te pasaste 200 Bs hoy. Tu presupuesto diario baja de 231 a 191 Bs."*
- Ofrece un botón opcional **"Cubrir con Ahorro"** por si el usuario prefiere mantener su ritmo diario en vez de apretarse el resto del mes. Es opcional, se puede ignorar.

**Caso 2 — El discrecional del mes llegó a cero y el usuario sigue gastando:**

Acá sí hay plata que no existía. El sistema **debe preguntar** de dónde salió:

> **Te faltan 200 Bs. ¿De dónde salieron?**
> - Del presupuesto de los próximos días *(reajusta el diario hacia abajo)*
> - De Ahorro → el usuario elige qué subcategoría
> - De Inversión → el usuario elige cuál
> - Alguien me lo prestó *(crea una deuda)*
> - Ingreso extra que no registré *(pide registrarlo)*

Antes de guardar la elección de Ahorro/Inversión, el servidor valida que ese pilar realmente tenga esa plata este mes (`computePillarSaldoThisMonth` en `app/(app)/actions.ts`, mismo cálculo que `computeDashboard` — no alcanza con sumar las transacciones de una categoría puntual, porque un `domino_events` anterior ya puede haber debitado el pilar entero sin dejar fila en `transactions`). Si no alcanza, se lo dice y no guarda nada — mismo criterio que el resto de los flujos de dinero de la app.

El usuario elige, el sistema descuenta del origen declarado, y queda registrado en `domino_events` con el origen real.

### 4.4 Reajuste proporcional (funciona en ambas direcciones)

- Si el usuario **gasta de más** un día → el presupuesto de los días restantes baja.
- Si el usuario **gasta de menos** o no gasta → el sobrante se redistribuye entre los días restantes y el presupuesto diario sube.

Esto es automático y no requiere intervención del usuario.

### 4.5 Cuándo se calcula y cuándo se notifica

- **Cálculo: tiempo real.** Apenas se registra cualquier movimiento, todos los saldos se actualizan al instante.
- **Aviso inmediato:** confirmación del movimiento y su impacto en el presupuesto diario (ver 4.3, caso 1).
- **Notificación formal: resumen diario nocturno.** Una vez por día el usuario recibe el resumen consolidado de lo que pasó.

---

## 5. Presupuesto Diario Disponible

### 5.1 Qué es
Un número concreto que el usuario ve en el dashboard todos los días: cuánto puede gastar hoy. Es el diferenciador que convierte la app de "la reviso una vez al mes" a "la abro todos los días".

### 5.2 Cómo se calcula

```
Pilar Gasto del mes (+ acumulado del mes anterior)
  − Gastos fijos "reservar desde ya" (prorrateado)   ← plata comprometida
  − Gastos ya registrados (fijos "recién cuando toca" + variables)
= Plata discrecional restante
  ÷ Días restantes del mes (incluyendo hoy)
= Presupuesto diario disponible hoy
```

**Importante:** solo los gastos fijos marcados "reservar desde ya" quedan afuera del cálculo diario desde el día 1 del mes (aunque su transacción real todavía no exista) — es la configuración por defecto y la recomendada, para no aparecer con más plata "disponible" de la real. Un gasto fijo marcado "recién cuando toca" sí entra al presupuesto diario como cualquier gasto, pero solo una vez que el usuario confirma su pago con "Ya lo pagué" (ver §4.2) — nunca antes de esa fecha, ni solo por haber llegado el día.

**Ejemplo concreto:**
- Pilar Gasto del mes: 2.000 Bs
- Ya gastaste 800 Bs en los primeros 10 días
- Te quedan 1.200 Bs para 20 días restantes
- **Presupuesto diario hoy: 60 Bs**

### 5.3 Comportamiento dinámico

- Si hoy gastás más de tu límite diario → mañana el límite baja (se distribuye el exceso entre los días restantes).
- Si hoy gastás menos → mañana el límite sube (el sobrante se reparte entre los días restantes).
- El número se recalcula automáticamente en tiempo real cada vez que se registra un gasto.

### 5.4 Qué incluye y qué no

- Se calcula **exclusivamente sobre el pilar Gasto**.
- Ahorro e Inversión no entran en el cálculo — son intocables para el gasto cotidiano.
- Los gastos fijos (arriendo, servicios) afectan el cálculo diario: desde ya si están marcados "reservar desde ya", o recién cuando se registra su transacción si no (ver 4.2/5.2).
- **Gasto nunca recibe un "ingreso extra"** (`QuickAddForm`, tab Dashboard): el pilar solo registra gastos, así que no aparece como destino elegible ahí — a diferencia de Ahorro, Inversión y Dinero libre, que sí pueden recibir ingresos. Si necesitás más presupuesto para un gasto fijo puntual, se configura directo en esa categoría (ver §4.2, "Aumentar presupuesto este mes"), no por acá.
  - **Única excepción**, acotada y guardada aparte (no aparece en el combo de pilares): dentro del Caso 2 del efecto dominó (§4.3), "Ingreso extra que no registré" — ahí la plata que cerró el déficit de verdad entró a Gasto, así que se registra directo contra Gasto sin pasar por el selector genérico.

### 5.5 Dónde se muestra
En el dashboard principal, como el número más prominente de la pantalla. El usuario no tiene que ir a buscarlo — es lo primero que ve al abrir la app.

---

## 6. Deudas

### 6.1 Estructura de una deuda

Una deuda es solo un registro: nombre + monto total. **Crear una deuda no
afecta el presupuesto de ningún pilar.** Lo único que reduce el presupuesto
es un PAGO registrado contra la deuda, en el momento en que se registra —
nunca automáticamente por el solo hecho de que la deuda exista.

| Campo | Detalle |
|---|---|
| Nombre | Ej. "Tarjeta Banco X", "Préstamo amigo" |
| Monto total | Número en Bs |

### 6.2 Registrar un pago

Dos formas de registrar un pago contra una deuda (no son excluyentes), y en
ambas el usuario elige **un pilar específico + una categoría opcional**
(nunca una categoría de gasto fijo) de dónde sale la plata — por defecto
Gasto, sin categoría:

- **Manual, en cualquier momento:** el usuario toca "Registrar pago", ingresa
  un monto y elige el pilar/categoría. Es un gasto normal contra ese
  pilar/categoría.
- **Plan automático (opcional, se configura una sola vez):** cuota fija +
  fecha del primer pago (elegida con un calendario real) + cada cuántos días
  o meses se repite (ej. cada 15 días, cada 2 meses) + el mismo
  pilar/categoría. Es un **recordatorio, no un descuento silencioso**: al
  llegar la fecha de una cuota, aparece un aviso ("Te toca pagar X Bs de
  [deuda]") con un botón "Ya la pagué". El pago recién se registra cuando el
  usuario toca ese botón — nunca se asume que ya se pagó solo porque llegó
  la fecha.

En ambos casos, un pago no puede ser mayor al saldo pendiente de la deuda. El
sistema muestra un error y no lo acepta (misma regla que con los Deudores,
§7.2).

### 6.3 Impacto en el presupuesto

Un pago de deuda es un gasto normal: baja el saldo del pilar/categoría
elegido, igual que cualquier otro movimiento. No existe ningún descuento
"antes de repartir entre pilares" — ver sección 3.4.

### 6.4 Cuando el pago no cabe en el presupuesto

- Si un pago deja esa categoría/pilar en negativo, se ve reflejado en el
  saldo del pilar como cualquier otro exceso — no hace falta declarar de
  dónde salió esa plata (ya se declaró al elegir el pilar/categoría del
  pago).

### 6.5 Cuando una deuda se termina de pagar

- Al llegar el monto pendiente a 0, la deuda se marca como **saldada
  automáticamente**.
- El sistema muestra una notificación positiva: *"¡Terminaste de pagar
  [nombre deuda]!"*
- El usuario también puede marcar una deuda como pagada manualmente ("dar
  por pagada"), sin que eso registre ningún pago.
- Una deuda ya pagada se puede **archivar** para sacarla de la vista, sin
  borrar su historial (igual que con Deudores, sección 7).
- Al empezar un mes nuevo, cualquier deuda que ya esté pagada se archiva
  sola (se sigue viendo el resto del mes en que se pagó; recién desaparece
  al mes siguiente).

### 6.6 Múltiples deudas simultáneas

- El usuario puede tener tantas deudas activas como quiera.
- Cada una se gestiona de forma independiente, con su propio progreso y (si
  tiene) su propio plan de pago automático.

---

## 7. Deudores

Módulo independiente del de Deudas. La lógica es inversa: acá el usuario registra a las personas que **le deben plata a él**.

### 7.1 Estructura de un deudor

| Campo | Detalle |
|---|---|
| Nombre | Nombre de la persona que debe |
| Monto total | Cuánto le prestó el usuario |
| Fecha de préstamo | Cuándo ocurrió |
| Fecha esperada de cobro | Opcional — activa alertas de recordatorio |
| Descripción | Nota libre opcional (ej. "Para el almuerzo del viernes") |

### 7.2 Pagos parciales

- Soportados. El `monto pendiente` se reduce con cada pago recibido.
- El registro no se cierra hasta que el saldo llegue a 0.
- El usuario puede registrar múltiples pagos parciales del mismo deudor.

### 7.3 Cuando el deudor paga

- El pago se convierte en un **ingreso extra**.
- El usuario elige manualmente a dónde va ese dinero: Ahorro, Gasto, Inversión o una subcategoría específica.
- Si el pago es parcial, el saldo pendiente del deudor se reduce automáticamente.
- Si el pago cubre el total pendiente, el deudor pasa a estado `paid` automáticamente.

### 7.4 Alertas de recordatorio

- Si llega la fecha esperada de cobro y el deudor sigue en estado `pending`, aparece un recordatorio en el resumen diario nocturno: *"[Nombre] te debe X Bs desde hace N días."*

### 7.5 Estados

| Estado | Cuándo |
|---|---|
| `pending` | Hay saldo pendiente mayor a 0 |
| `paid` | El saldo llegó a 0 (automático) |
| `archived` | El usuario lo archivó a mano (§11), o pasó solo al empezar el mes siguiente a que quedó `paid` — se conserva el historial de cobros, deja de aparecer en la lista |

### 7.6 Deudas vinculadas entre usuarios

Una deuda puede ser **local** (lo de arriba: solo existe en tu cuenta) o **vinculada**: un solo registro compartido entre dos usuarios reales de FinancyBoss (tabla `shared_debts`) — quien la creó como "yo debo" la ve en Deudas, la otra parte la ve en Deudores, y es la MISMA fila para los dos (un solo saldo, no dos copias que se puedan desincronizar).

**Cómo se vincula, 3 formas (todas terminan en el mismo lugar: una fila `shared_debts` activa):**

1. **Por email** (migración 0012): buscás a la otra persona por su email exacto (`find_user_by_email`) — ya sabés con quién es antes de crear la invitación.
2. **Por nombre de usuario** (migración 0024): igual que por email, pero buscando el `@usuario` que la otra persona haya elegido (`find_user_by_username`). El username es opcional y único por cuenta — se puede elegir en `/registro` (migración 0029, chequea disponibilidad antes de crear la cuenta vía `is_username_taken`) o después desde Perfil. Si al terminar el onboarding el elegido en el registro ya se lo llevó otra persona (carrera rarísima), el onboarding sigue sin username en vez de frenarse — se puede elegir otro después desde Perfil.
3. **Por link** (migración 0025): para cuando no sabés el email ni el username de la otra persona (o no querés buscarlo). Armás los datos de la deuda sin elegir contraparte, generás un link (`/invitacion/[token]`) y se lo mandás por fuera de la app. Quien lo abre ve una pantalla con los datos y un botón **"Aceptar"** — recién ahí, con esa confirmación explícita, se crea la fila real. Abrir el link solo (sin apretar Aceptar) no vincula nada — mismo principio que "no asumir movimientos de plata" aplicado acá a la creación del vínculo, no a plata en sí.

**Con las formas 1 y 2**, la deuda nace en estado `pending`: le queda una invitación por responder a la otra persona (Aceptar/Rechazar desde su propia lista de Deudas/Deudores) — no afecta el presupuesto de nadie hasta que la acepta.

**Con la forma 3 (link)**, no hay un `pending` intermedio: el clic en "Aceptar" de la pantalla del link YA es la confirmación explícita, así que la fila se crea directamente `active`.

**Una vez activa**, un pago es de dos pasos — igual sin importar cómo se vinculó: el deudor propone el pago (elige de qué pilar/categoría propio sale), el acreedor confirma (elige a qué pilar/categoría propio entra). Recién ahí se generan las dos transacciones reales, una en la cuenta de cada uno.

### 7.7 QR de cobro y comprobante de pago (migración 0026)

Primer uso de archivos en el proyecto (hasta acá todo era filas en tablas) — alcance: **solo deudas vinculadas**, porque el deudor ya es un usuario real de la app.

- **QR de cobro**: en Más → Perfil, cualquier usuario puede subir la foto de su QR para cobrar (banco, billetera). Cuando el deudor de una deuda vinculada abre "Proponer pago", ve ahí mismo el QR del acreedor (si subió uno) — no hace falta pedírselo por otro lado.
- **Comprobante**: al proponer el pago, el deudor puede adjuntar (opcional, nunca obligatorio) una foto del comprobante. El acreedor la ve con un botón "Ver comprobante" antes de confirmar.
- Bucket privado (`payment-media`, no público) — las imágenes nunca tienen una URL fija: siempre se piden por **signed URL** generada del lado del servidor, después de validar contra `shared_debts`/`shared_debt_payments` (mismo criterio de "revalidar todo en el servidor" del resto del proyecto). Las políticas de `storage.objects` son las que de verdad deciden quién puede leer/escribir cada archivo:
  - El QR de un usuario lo puede leer él mismo, o quien sea su deudor en una deuda vinculada **aceptada** (`active`) — una invitación pendiente no da acceso. Nadie más. El deudor obtiene la ruta del QR con `get_creditor_payment_qr_path` (migración 0032); no puede leer el perfil del acreedor.
  - Un comprobante lo pueden leer las dos partes de esa deuda puntual, y solo el deudor puede subirlo, **mientras el pago está pendiente**: una vez confirmado o rechazado queda congelado. Se vincula al pago con `attach_payment_receipt` (migración 0032), que falla si no actualiza exactamente una fila.
- Paths fijos (`qr/{user_id}`, `receipts/{payment_id}`) con upsert: un re-upload pisa el anterior, no quedan archivos sueltos acumulados.

---

## 8. Estadísticas

### 8.1 Estructura

- Una sola sección de Estadísticas con **selector de mes navegable**.
- El dashboard principal cubre la vista del día actual en tiempo real — no se duplica en Estadísticas.
- Sin estadísticas semanales en el MVP.
- **Un mes cerrado no cambia aunque cambie tu configuración.** Al cerrar el mes se guarda su foto (`monthly_budgets`): presupuesto, arrastre y gasto de cada pilar, y el **ingreso** con el que se cerró (`income_amount`, migración 0036). Si después cambias tu sueldo de 3.000 a 4.000, septiembre sigue mostrando 3.000. El presupuesto de cada categoría de un mes pasado es lo que **se le repartió ese mes** (movimientos `is_allocation`), no el monto que tiene configurado hoy. Los meses cerrados antes de la migración 0036 se rellenaron con el ingreso que tenías al aplicarla.

### 8.2 Vista mensual — contenido

| Dato | Descripción |
|---|---|
| Ingreso total del mes | Base + ingresos extra **reales** (un bono, el cobro de un deudor, el pago que recibes de una deuda vinculada, la ganancia de una inversión, un "Ingreso" a Dinero libre). **No** cuentan los traslados entre tus propias cuentas (asignar Dinero libre a una categoría, aumentar un gasto fijo desde Ahorro, convertir USD a Bs), ni los saldos iniciales ("Ahorro previo"/"Inversión previa"), ni el reparto mensual, ni el "Sobrante del mes". Mover plata propia nunca es ingreso nuevo ni gasto |
| Por pilar | Presupuesto asignado vs. gasto real, superávit o déficit |
| Por subcategoría | Mismo desglose que por pilar |
| Efecto dominó | Número de veces activado ese mes y categorías más afectadas |
| Progreso de deudas | Monto pendiente y pagos registrados por deuda (locales y vinculadas). Una deuda archivada igual aparece en el mes en que recibió pagos |
| Deudores activos ese mes | Cobros recibidos y pendientes (locales y vinculadas) |
| Saldo acumulado | Lo que pasó al mes siguiente por pilar |

### 8.3 Historial

- El usuario puede navegar mes a mes hacia atrás desde el mes actual hasta el primer mes con actividad registrada.
- Cada mes pasado muestra los mismos datos que la vista mensual actual, pero **cerrado y de solo lectura**.

### 8.4 Primer mes del usuario

- Si el usuario creó la cuenta a mitad de mes, el primer mes muestra datos solo desde la fecha de registro hasta fin de mes.
- No hay datos ficticios ni proyecciones — solo lo real registrado.

---

## 9. Navegación principal

Estructura de tabs (mobile-first, pensada para escalar a app móvil):

```
Dashboard | Mi Dinero | Deudas | Deudores | Estadísticas | Más ▾
```

Donde **Más** agrupa: Perfil y Configuración.

| Tab | Qué contiene |
|---|---|
| Dashboard | Presupuesto diario disponible, saldos en tiempo real, acceso rápido a registrar gasto/ingreso |
| Mi Dinero | Pilares, subcategorías, montos en Bs y saldos del mes. Acá el usuario organiza y edita cómo está distribuido su ingreso |
| Deudas | Lo que vos debés (cuotas, progreso, deudas saldadas) |
| Deudores | Lo que te deben a vos (pendientes, historial de cobros) |
| Estadísticas | Vista mensual navegable con historial completo |
| Más | Perfil, configuración, toggle de ingreso automático, zona horaria |

---

## 10. Esquema de base de datos

Moneda única: **bolivianos (Bs)**. Sin soporte multi-moneda en el MVP.

### Tablas

**`profiles`** — datos extra del usuario (complementa la tabla interna de Supabase auth)
```
id                  → UUID (mismo que auth.users)
name                → texto
base_income         → número
auto_repeat_income  → boolean
created_at          → timestamp
```

**`pillars`** — los 3 pilares de cada usuario
```
id             → UUID
user_id        → referencia a auth.users
name           → "ahorro" | "gasto" | "inversion"
monthly_amount → número en Bs, monto fijo (migración 0020 — ya no %)
created_at     → timestamp
```

**`categories`** — subcategorías dentro de cada pilar
```
id               → UUID
user_id          → referencia a auth.users
pillar_id        → referencia a pillars
name             → texto libre
fixed_amount     → número en Bs o null (migración 0023 — ya no %). Monto que recibe del reparto mensual de su pilar
auto_repeat      → boolean. Solo aplica a Gasto: si el monto se descuenta solo, en una fecha (ver fixed_start_date/fixed_interval_*)
goal_amount      → número en Bs o null (migración 0022). Solo Ahorro: meta de ahorro
goal_target_date → fecha o null (migración 0022). Fecha objetivo de la meta
deleted_at       → timestamp nullable (borrado suave)
created_at       → timestamp
```

**`transactions`** — cada gasto o ingreso extra registrado
```
id           → UUID
user_id      → referencia a auth.users
category_id  → referencia a categories (null si va directo a pilar)
pillar_id    → referencia a pillars
amount       → número (positivo = ingreso, negativo = gasto)
type         → "expense" | "extra_income"
description  → texto libre opcional
date         → fecha del registro
debt_id      → referencia a debts, opcional (pago de deuda con fuente pilar/categoría específica)
debtor_id    → referencia a debtors, opcional (cobro de un deudor registrado como ingreso extra)
kind         → "transfer" | "opening_balance" | null (migración 0037). transfer = un lado de un traslado entre cuentas propias; opening_balance = saldo inicial; null = ingreso o gasto real. Estadísticas excluye los que tienen kind
transfer_id  → UUID, opcional. El mismo en los dos lados de un traslado, para vincularlos (también existe en free_money_transactions y usd_savings_transactions)
created_at   → timestamp
```

**`debts`** — deudas del usuario (lo que él debe). Modelo v2 (sección 6):
crear una deuda no descuenta nada; solo un pago registrado resta.
```
id                     → UUID
user_id                → referencia a auth.users
name                   → texto
total_amount           → número
remaining_amount       → número
auto_pay_amount        → número o null. Cuota del plan de pago automático OPCIONAL (null = sin plan). Es un recordatorio: el usuario confirma cada pago
auto_pay_start_date    → fecha o null. Primer vencimiento del plan
auto_pay_interval_unit → "day" | "month" o null. Unidad de la frecuencia
auto_pay_interval_count → número o null. Cada cuántas unidades se repite (ej. 15 días, 2 meses)
auto_pay_pillar_id     → referencia a pillars (requerido si hay plan automático)
auto_pay_category_id   → referencia a categories, opcional (dentro de auto_pay_pillar_id)
status                 → "active" | "paid" | "archived" (el usuario archiva una deuda ya pagada para sacarla de la vista, sin borrar su historial)
created_at             → timestamp
```

**`debtors`** — personas que le deben al usuario
```
id               → UUID
user_id          → referencia a auth.users
name             → texto
total_amount     → número
remaining_amount → número
lent_date        → fecha
expected_date    → fecha (opcional)
description      → texto libre opcional
status           → "pending" | "paid"
created_at       → timestamp
```

**`monthly_budgets`** — estado de cada mes por categoría (base del historial)
```
id              → UUID
user_id         → referencia a auth.users
category_id     → referencia a categories
month           → número (1-12)
year            → número
budgeted_amount → número
spent_amount    → número
carried_over    → número (acumulado del mes anterior)
income_amount   → número o null. Ingreso base con el que se cerró el mes (migración 0036); null en filas anteriores sin dato
created_at      → timestamp
```

**`domino_events`** — registro de cada activación del efecto dominó
```
id                   → UUID
user_id              → referencia a auth.users
transaction_id       → referencia a transactions
source_category_id   → categoría que se excedió
affected_category_id → categoría que absorbió el exceso
amount               → cuánto se transfirió
created_at           → timestamp
```

### Relaciones

```
auth.users (Supabase)
  └── profiles        (1 a 1)
  └── pillars         (1 a 3 — siempre exactamente 3)
        └── categories (1 a muchos)
              └── transactions    (1 a muchos)
              └── monthly_budgets (1 a muchos)
  └── debts           (1 a muchos)
  └── debtors         (1 a muchos)
  └── domino_events   (1 a muchos)
```

---

## 11. Casos límite y reglas generales

| Escenario | Regla |
|---|---|
| El usuario borra una subcategoría con gastos registrados | Los gastos históricos se conservan etiquetados como "categoría eliminada". No se borran. |
| El usuario cambia el monto de un pilar a mitad de mes con gastos ya registrados | Los gastos pasados no cambian. Solo se recalcula el saldo disponible del resto del mes. |
| El ingreso base es $0 | El sistema no deja avanzar en el onboarding sin un ingreso mayor a $0. |
| Un pago de deuda deja el pilar/categoría elegido en negativo | Se ve reflejado como déficit del pilar, igual que cualquier otro exceso. No se bloquea. |
| El usuario intenta registrar un pago de deuda mayor al saldo pendiente | El sistema no acepta un pago mayor al saldo pendiente. Muestra error (misma regla que con Deudores). |
| Primer mes incompleto (se registró a mitad de mes) | El presupuesto se calcula proporcional a los días restantes del mes, no el mes completo. |
| El usuario no registra ningún gasto en todo el mes | El mes cierra con superávit total. Todo se acumula al siguiente mes según las reglas de cada pilar. |
| Dos ingresos extra el mismo día | Se registran como transacciones independientes, cada una con su destino manual elegido. |
| Una deuda se termina de pagar | Se marca como saldada sola al llegar a 0, notificación positiva al usuario. Si tenía un plan automático, deja de generarse el próximo mes. |
| El usuario quiere editar un mes ya cerrado | No se puede. El historial es de solo lectura. |
| Un deudor paga más de lo que debe | El sistema no acepta un pago mayor al saldo pendiente. Muestra error. |
| El usuario borra un deudor con pagos parciales registrados | Se conserva el historial de pagos recibidos como ingresos extra. El registro del deudor se archiva, no se borra. |
| El presupuesto diario disponible es 0 o negativo | Se muestra 0 Bs disponibles hoy con alerta visible de déficit. No se bloquea el registro de gastos. |
| El usuario no tiene subcategorías en un pilar | El saldo del pilar queda como "libre" y el presupuesto diario se calcula sobre el total del pilar Gasto igualmente. |

---

> **Nota:** Este documento es la fuente de verdad funcional del MVP (Fase 1). Los casos límite adicionales que surjan durante el desarrollo o las pruebas con usuarios se agregarán como versiones posteriores de este manual.