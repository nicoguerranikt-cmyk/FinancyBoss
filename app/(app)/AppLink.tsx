'use client'

// Reemplazo directo de next/link's Link para toda navegación entre
// pantallas de la app: dispara la moneda cruzando la pantalla (ver
// NavTransition.tsx) al clickear, además de navegar normalmente. Import:
// `import Link from '.../AppLink'` — mismo nombre local, así no hace falta
// tocar el resto del JSX que ya usa <Link>.

import Link, { type LinkProps } from 'next/link'
import type { AnchorHTMLAttributes } from 'react'
import { useNavTransition } from './NavTransition'

type Props = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children?: React.ReactNode
  }

export default function AppLink({ onClick, ...props }: Props) {
  const { beginNavigation } = useNavTransition()

  return (
    <Link
      {...props}
      onClick={(e) => {
        beginNavigation()
        onClick?.(e)
      }}
    />
  )
}
