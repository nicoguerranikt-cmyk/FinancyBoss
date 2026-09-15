// Header superior con el logo de FinancyBoss (manual.md sección 9). Dos
// versiones del ícono (una por tema), alternadas con el mismo patrón que ya
// usa CategoryDonut para colores de gráficos: clases dark:hidden/hidden
// dark:block, nunca nombres de clase armados dinámicamente (Tailwind no los
// genera).

import Image from 'next/image'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo-icon-light.png"
            alt=""
            width={48}
            height={48}
            className="dark:hidden"
            priority
          />
          <Image
            src="/logo-icon-dark.png"
            alt=""
            width={48}
            height={48}
            className="hidden dark:block"
            priority
          />
          <span className="text-2xl tracking-tight text-zinc-900 dark:text-zinc-100">
            Financy<span className="font-bold">Boss</span>
          </span>
        </div>
        <ThemeToggle />
      </div>
    </header>
  )
}
