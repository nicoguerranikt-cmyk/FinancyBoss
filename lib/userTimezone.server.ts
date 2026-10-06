// Zona horaria del usuario (profiles.timezone, migración 0035). Todo lo que
// dice "hoy" o "este mes" — pantallas y acciones — usa esta zona en vez de
// una fija. Los sitios que ya leen el perfil pueden pedir `timezone` en su
// propio select y pasarlo por resolveTimeZone; el resto usa esta función.

import type { createClient } from '@/lib/supabase/server'
import { resolveTimeZone } from '@/lib/dashboard'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function getUserTimeZone(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', userId).maybeSingle()
  return resolveTimeZone(data?.timezone)
}
