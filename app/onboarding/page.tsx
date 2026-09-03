// Gate del onboarding (Server Component).
//
// - Sin usuario -> a login (el proxy ya lo hace, esto es cinturón extra).
// - Con perfil ya creado -> el onboarding está hecho, va al dashboard.
// - Con usuario pero sin perfil -> muestra el wizard.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import OnboardingWizard from './OnboardingWizard'

export default async function OnboardingPage() {
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

  if (profile) {
    redirect('/')
  }

  const userName = (user.user_metadata?.name as string | undefined) ?? ''

  return <OnboardingWizard userName={userName} />
}
