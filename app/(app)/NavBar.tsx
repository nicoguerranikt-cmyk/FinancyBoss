'use client'

// Barra de navegación principal (manual.md sección 9): mobile-first, fija
// abajo, pensada para escalar a app móvil más adelante.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: 'Dashboard' },
  { href: '/mi-dinero', label: 'Mi Dinero' },
  { href: '/deudas', label: 'Deudas' },
  { href: '/deudores', label: 'Deudores' },
  { href: '/estadisticas', label: 'Estadísticas' },
  { href: '/mas', label: 'Más' },
] as const

export default function NavBar() {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
