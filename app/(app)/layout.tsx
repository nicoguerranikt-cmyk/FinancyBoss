// Layout compartido por toda la app autenticada (Dashboard, Mi Dinero,
// Deudas, Deudores, Estadísticas, Más — manual.md sección 9).
//
// Centraliza acá el gate que antes vivía solo en app/page.tsx: sin sesión, a
// /login; con sesión pero sin perfil creado, el onboarding sigue pendiente.
// Así las páginas nuevas no repiten este chequeo cada una.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NavBar from './NavBar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) {
    redirect('/onboarding')
  }

  return (
    <div className="flex flex-1 flex-col">
      <main className="flex flex-1 flex-col pb-16">{children}</main>
      <NavBar />
    </div>
  )
}
