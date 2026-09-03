// Tab "Más" (manual.md sección 9): agrupa Perfil y Configuración. Todavía no
// tienen pantalla propia; por ahora solo vive acá el botón de cerrar sesión
// (antes estaba en la home provisoria de módulo 1).

import { logout } from '@/app/login/actions'

export default function MasPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Más</h1>

      <p className="text-sm text-zinc-500">
        Perfil, configuración y el toggle de ingreso automático llegan en un próximo módulo.
      </p>

      <form action={logout}>
        <button
          type="submit"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  )
}
