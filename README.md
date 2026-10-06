# FinancyBoss

App de finanzas personales en Bolivianos (Bs). Organiza el ingreso mensual en tres pilares — **Ahorro, Gasto e Inversión** — más **Dinero libre** (lo que sobra), calcula un presupuesto diario y muestra el **efecto dominó** cuando un exceso de gasto se cubre con otro pilar. Incluye deudas, deudores, deudas compartidas entre usuarios, ahorro en USD y estadísticas con cierre de mes.

Las reglas de negocio están en [manual.md](manual.md), que es la fuente de verdad del modelo financiero.

## Stack

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript estricto
- [Supabase](https://supabase.com): autenticación, Postgres con RLS y Storage
- Tailwind CSS 4
- Vitest para los tests de la lógica de dinero

> Esta versión de Next.js tiene cambios respecto a lo habitual. Antes de tocar rutas o convenciones, lee la guía correspondiente en `node_modules/next/dist/docs/`.

## Requisitos

- Node.js 22 (el que usa el CI)
- Un proyecto de Supabase

## Puesta en marcha

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Crea un archivo `.env.local` en la raíz con estas variables (los valores salen de *Project Settings → API* en Supabase):

   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   ```

   `.env*` está en `.gitignore`: no subas credenciales al repositorio.

3. Aplica las migraciones de [supabase/migrations/](supabase/migrations/) **en orden numérico** (`0001`, `0002`, …) sobre tu base. Cada archivo explica en sus comentarios qué cambia.

4. Si usas confirmación de email, la plantilla de Supabase debe apuntar a la ruta `/auth/confirm` (ver los comentarios de [app/auth/confirm/route.ts](app/auth/confirm/route.ts)).

5. Levanta la app:

   ```bash
   npm run dev
   ```

   Abre [http://localhost:3000](http://localhost:3000).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm run lint` | ESLint |
| `npm test` | Tests de Vitest |
| `npx tsc --noEmit` | Chequeo de tipos |

## Tests

Los tests viven junto al código en `lib/*.test.ts` y cubren la lógica pura del dinero (saldos del Dashboard, gastos fijos). No necesitan base de datos. Cuando corrijas un bug de cálculo, agrega un test que lo reproduzca.

## Integración continua

[.github/workflows/ci.yml](.github/workflows/ci.yml) corre en cada push o pull request a `develop` y `main`: instalación, lint, tipos, tests y build.

## Estructura

- `app/` — pantallas y Server Actions (`(app)/` es la zona autenticada: Inicio, Mi Dinero, Deudas, Deudores, Estadísticas y Más)
- `lib/` — lógica de negocio sin dependencia de Supabase (dashboard, dominó, recurrencia, deudas, gastos fijos)
- `supabase/migrations/` — esquema, políticas RLS y funciones SQL
- `manual.md` — reglas del producto
