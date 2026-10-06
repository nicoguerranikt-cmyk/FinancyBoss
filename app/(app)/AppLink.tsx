'use client'

// Reemplazo directo de next/link's Link para toda navegación entre
// pantallas de la app: dispara la moneda cruzando la pantalla (ver
// NavTransition.tsx) al clickear, además de navegar normalmente. Import:
// `import Link from '.../AppLink'` — mismo nombre local, así no hace falta
// tocar el resto del JSX que ya usa <Link>.
//
// La moneda SOLO arranca si el clic va a navegar de verdad a otra pantalla de
// la app. No arranca en: el mismo destino en el que ya estás (la pantalla no
// se vuelve a montar, nadie avisaría "lista" y la capa quedaría tapando), un
// clic con Ctrl/Cmd/Shift/Alt o botón del medio (abre otra pestaña o ventana),
// un link con target distinto de _self, ni un enlace a otro sitio.

import Link, { type LinkProps } from 'next/link'
import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { useNavTransition } from './NavTransition'

type Props = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children?: React.ReactNode
  }

function hrefToString(href: LinkProps['href']): string | null {
  if (typeof href === 'string') return href
  // Un href con `query` como objeto no se puede comparar fácil con la URL
  // actual: se trata como una navegación normal (se anima).
  if (href.query && typeof href.query === 'object' && Object.keys(href.query).length > 0) return null
  return `${href.pathname ?? ''}${href.search ?? ''}${href.hash ?? ''}`
}

function willNavigateToAnotherScreen(
  e: MouseEvent<HTMLAnchorElement>,
  href: LinkProps['href'],
  target: string | undefined
): boolean {
  if (e.defaultPrevented) return false
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false
  if (target && target !== '_self') return false

  const hrefString = hrefToString(href)
  if (hrefString === null) return true

  let url: URL
  try {
    url = new URL(hrefString, window.location.href)
  } catch {
    return false
  }
  if (url.origin !== window.location.origin) return false

  const sameScreen =
    url.pathname === window.location.pathname && url.search === window.location.search
  return !sameScreen
}

export default function AppLink({ onClick, href, target, ...props }: Props) {
  const { beginNavigation } = useNavTransition()

  return (
    <Link
      {...props}
      href={href}
      target={target}
      onClick={(e) => {
        // Primero el onClick propio: puede cancelar la navegación (preventDefault).
        onClick?.(e)
        if (willNavigateToAnotherScreen(e, href, target)) beginNavigation()
      }}
    />
  )
}
