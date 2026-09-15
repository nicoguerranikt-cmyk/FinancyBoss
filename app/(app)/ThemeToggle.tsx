'use client'

// Switch manual de modo claro/oscuro. La app NO sigue el sistema operativo:
// arranca siempre en claro (ver el script inline en app/layout.tsx) y solo
// cambia cuando el usuario toca este botón. La elección se guarda en
// localStorage (alcanza: es una preferencia de este navegador, no hace falta
// sincronizarla entre dispositivos).

import { useSyncExternalStore } from 'react'

// Nada más que nuestro propio botón cambia la clase .dark, así que no hace
// falta reaccionar a cambios externos — solo nos interesa que
// useSyncExternalStore sepa devolver un snapshot distinto para servidor
// (siempre claro, no hay localStorage ahí) y cliente (la clase real del
// <html>, ya corregida por el script inline de app/layout.tsx antes de
// hidratar). Es la forma correcta de evitar un mismatch de hidratación acá
// — un `suppressHydrationWarning` no alcanza porque el ícono cambia de
// sub-árbol entero (sol vs. luna), no solo de texto.
let listeners: Array<() => void> = []
function subscribe(callback: () => void) {
  listeners.push(callback)
  return () => {
    listeners = listeners.filter((l) => l !== callback)
  }
}
function getSnapshot() {
  return document.documentElement.classList.contains('dark')
}
function getServerSnapshot() {
  return false
}

export default function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  function toggle() {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    listeners.forEach((l) => l())
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {
      // Sin localStorage (privado/bloqueado): el toggle sigue andando en esta
      // carga de página, solo no se recuerda la próxima vez.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
    </button>
  )
}
