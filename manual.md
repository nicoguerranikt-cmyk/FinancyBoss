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

El onboarding es **obligatorio**. El usuario no puede acceder al dashboard hasta completarlo. Consta de 4 pantallas en orden fijo.

---

**Pantalla 0 — Bienvenida y concepto**

Explica en lenguaje simple cómo funciona FinancyBoss. Máximo 3 ideas clave:
- *"Tu plata se divide en 3 pilares: Ahorro, Gasto e Inversión."*
- *"Vos decidís qué % va a cada uno."*
- *"Cuando te excedás en algo, te decimos exactamente qué meta estás sacrificando."*

Botón: **"Empecemos"** — no se puede saltar pero se puede leer rápido.

---

**Pantalla 1 — Ingreso mensual**

Contexto mostrado al usuario: *"Este es el dinero con el que trabajaremos cada mes. Podés ajustarlo cuando quieras."*

- Campo numérico: ingreso mensual base (mayor a $0 para continuar).
- Toggle: *"Repetir automáticamente cada mes"* — activado por default.
- Botón: **"Continuar"** (habilitado solo con valor > 0).

---

**Pantalla 2 — Distribución de pilares**

Contexto mostrado al usuario: *"Definí qué porcentaje de tu ingreso va a cada pilar. Tienen que sumar 100%."*

- 3 campos o sliders: Ahorro / Gasto / Inversión.
- El sistema muestra en tiempo real el monto equivalente de cada % (ej. "Ahorro 30% = $120").
- Indicador visual si la suma es distinta de 100%.
- Botón: **"Continuar"** (bloqueado hasta que los % sumen exactamente 100%).

---

**Pantalla 3 — Subcategorías iniciales**

Contexto mostrado al usuario: *"Dentro de cada pilar, podés crear categorías para organizar mejor tu dinero. Te damos algunas sugerencias para empezar."*

Subcategorías sugeridas por pilar (con checkbox para activar/desactivar):

| Ahorro | Gasto | Inversión |
|---|---|---|
| Fondo de emergencia | Comida | Proyecto personal |
| Viajes | Transporte | Educación |
| Meta específica | Vivienda | Otro |
| Imprevistos | Gastos diarios | |

- Botón **"+ Agregar categoría"** disponible por pilar para crear las propias.
- No es obligatorio asignar % a las subcategorías en este paso.
- Botón: **"Ir al dashboard"** para finalizar.

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
- Cada pilar tiene un % del ingreso total definido por el usuario.
- La suma de los 3 pilares siempre debe ser **100%**.

### 2.2 Subcategorías

- Ilimitadas por pilar, creadas y nombradas libremente por el usuario.
- El MVP permite máximo **2 niveles**: Pilar → Subcategoría. Sin sub-subcategorías.
- Cada subcategoría tiene su propio % **relativo al pilar** (no al ingreso total).
  - Ejemplo: Gasto = 50% del ingreso. Dentro de Gasto, Comida = 30%. Por lo tanto Comida = 15% del ingreso total.
- El sistema avisa si los % de las subcategorías de un pilar no suman 100%, pero **no bloquea**.
- El saldo de un pilar sin asignar a subcategorías queda como **"libre"** dentro del pilar.

### 2.3 Cambios a mitad de mes

- Cualquier cambio de % (pilar o subcategoría) aplica **desde ese momento hacia adelante**.
- Los gastos, ahorros o inversiones ya registrados **no se tocan retroactivamente**.
- El sistema recalcula el saldo disponible para el resto del mes con los nuevos %.

---

## 3. Ingresos

### 3.1 Ingreso base mensual

- El usuario define un ingreso base mensual durante el onboarding.
- **Toggle en configuración:** si está activado, el ingreso base se repite automáticamente cada mes. Si está desactivado, el sistema solicita ingresarlo manualmente al inicio de cada mes.
- Default: toggle activado.

### 3.2 Ingresos extra

- El usuario puede registrar ingresos extra en cualquier momento del mes (freelance, bonos, regalos, etc.).
- Al registrar un ingreso extra, el usuario **elige manualmente** a qué pilar o subcategoría va ese dinero.
- No se distribuye automáticamente por %.

### 3.3 Acumulación de saldos entre meses

- Los saldos no utilizados de **todos los pilares** (Ahorro, Gasto e Inversión) se acumulan al mes siguiente.
- ⚠️ *Nota de riesgo:* que Gasto acumule puede hacer crecer indefinidamente el presupuesto de gastos si el usuario es muy frugal. A monitorear con usuarios reales en Fase 1.

### 3.4 Distribución del ingreso

```
Ingreso total
  → Ahorro X%
  → Gasto Y%
  → Inversión Z%
```

Los pagos de deuda (sección 6) no se descuentan de este cálculo: son un
gasto normal contra el pilar/categoría que el usuario elige al registrar el
pago, igual que cualquier otro movimiento.

---

## 4. Efecto Dominó

### 4.0 Principio fundamental: toda la plata está trackeada

FinancyBoss es contabilidad real, no un presupuesto aproximado. **La plata nunca aparece ni desaparece por arte de magia.** Si el usuario gasta dinero que no tenía disponible, ese dinero salió de algún lado concreto y el sistema debe registrar de dónde.

Corolario: el sistema **nunca mueve dinero entre categorías por su cuenta**. O el movimiento es consecuencia matemática de la plata que el usuario ya tenía, o el usuario declara explícitamente el origen.

### 4.1 Los tres niveles de dinero

```
Ingreso total
  − Cuotas de deuda activas       ← comprometido
  − Ahorro (%)                    ← comprometido, no se toca
  − Inversión (%)                 ← comprometido, no se toca
  − Gastos fijos del mes          ← comprometido (ver sección 4.2)
= Plata discrecional del mes
  ÷ Días restantes
= Presupuesto diario disponible
```

### 4.2 Gastos fijos vs. gastos variables

Cada subcategoría del pilar Gasto es de uno de estos dos tipos:

| Tipo | Cómo se define | Efecto en el presupuesto diario |
|---|---|---|
| **Fijo** | Tiene un monto mensual asignado (ej. Vivienda 800 Bs, Internet 100 Bs, Mercado 500 Bs) | Se descuenta del pilar Gasto pero **NO entra** en el cálculo diario. Es plata comprometida. |
| **Variable** | Sin monto asignado (ej. Comida, Transporte, Ocio) | Sale del pool discrecional que **sí alimenta** el presupuesto diario. |

**Repetición automática:** al crear un gasto fijo, el usuario puede activar un toggle de *"repetir automáticamente cada mes"*. Si está activo, el gasto se descuenta solo al inicio de cada mes. Si no, el usuario lo registra manualmente cuando efectivamente lo paga.

**Nota de diseño:** esta distinción resuelve la ambigüedad de categorías como "Comida", que puede significar el mercado mensual (fijo, monto conocido) o salir a comer (variable). Se resuelven con nombres distintos: **Mercado** (fijo) y **Comida** (variable).

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
  − Suma de gastos fijos del mes        ← plata comprometida
  − Gastos variables ya registrados
= Plata discrecional restante
  ÷ Días restantes del mes (incluyendo hoy)
= Presupuesto diario disponible hoy
```

**Crítico:** los gastos fijos NO entran en el cálculo diario. Si el arriendo son 800 Bs, esa plata ya está comprometida y no debe aparecer como "disponible para gastar hoy". Ver sección 4.2.

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
- Los gastos fijos (arriendo, servicios) se descuentan normalmente del pilar Gasto cuando se registran, afectando el cálculo diario.

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
- **Plan automático (opcional, se configura una sola vez):** cuota fija
  mensual + mes/año/día de inicio (el día es opcional) + el mismo
  pilar/categoría. Es un **recordatorio, no un descuento silencioso**: al
  llegar la fecha, aparece un aviso ("Te toca pagar X Bs de [deuda]") con un
  botón "Ya la pagué". El pago recién se registra cuando el usuario toca ese
  botón — nunca se asume que ya se pagó solo porque llegó la fecha.

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

---

## 8. Estadísticas

### 8.1 Estructura

- Una sola sección de Estadísticas con **selector de mes navegable**.
- El dashboard principal cubre la vista del día actual en tiempo real — no se duplica en Estadísticas.
- Sin estadísticas semanales en el MVP.

### 8.2 Vista mensual — contenido

| Dato | Descripción |
|---|---|
| Ingreso total del mes | Base + extras registrados |
| Por pilar | Presupuesto asignado vs. gasto real, superávit o déficit |
| Por subcategoría | Mismo desglose que por pilar |
| Efecto dominó | Número de veces activado ese mes y categorías más afectadas |
| Progreso de deudas | Monto pendiente y pagos registrados por deuda |
| Deudores activos ese mes | Cobros recibidos y pendientes |
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
| Mi Dinero | Pilares, subcategorías, % y saldos del mes. Acá el usuario organiza y edita cómo está distribuido su ingreso |
| Deudas | Lo que vos debés (cuotas, progreso, deudas saldadas) |
| Deudores | Lo que te deben a vos (pendientes, historial de cobros) |
| Estadísticas | Vista mensual navegable con historial completo |
| Más | Perfil, configuración, toggle de ingreso automático |

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
id          → UUID
user_id     → referencia a auth.users
name        → "ahorro" | "gasto" | "inversion"
percentage  → número (ej. 30)
created_at  → timestamp
```

**`categories`** — subcategorías dentro de cada pilar
```
id               → UUID
user_id          → referencia a auth.users
pillar_id        → referencia a pillars
name             → texto libre
percentage       → número relativo al pilar (puede ser null)
fixed_amount     → número o null. Si tiene valor = GASTO FIJO, no entra en el cálculo diario
auto_repeat      → boolean. Si el gasto fijo se descuenta solo cada mes
backup_priority  → número (orden de respaldo en efecto dominó)
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
monthly_payment        → número o null. Cuota del plan de pago automático OPCIONAL (null = sin plan)
auto_pay_start_year    → número o null. Año desde el que arranca el plan automático
auto_pay_start_month   → número (1-12) o null
auto_pay_start_day     → número (1-31) o null. Día del recordatorio; null = desde el 1° del mes
auto_pay_pillar_id     → referencia a pillars (requerido si hay plan automático)
auto_pay_category_id   → referencia a categories, opcional (dentro de auto_pay_pillar_id)
status                 → "active" | "paid"
created_at             → timestamp
-- interest_rate, total_months, paid_months: obsoletos desde el modelo v2, se dejan sin borrar.
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
| El usuario cambia el % de un pilar a mitad de mes con gastos ya registrados | Los gastos pasados no cambian. Solo se recalcula el saldo disponible del resto del mes. |
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