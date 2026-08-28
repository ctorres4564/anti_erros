import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database.types';

export async function recordActivationEvent(
  userId: string,
  eventName: string,
  properties: Record<string, Json> = {}
) {
  try {
    const { error } = await createAdminClient().from('events').insert({
      user_id: userId,
      event_name: eventName,
      properties,
    });
    if (error) console.error(`Falha ao registrar evento ${eventName}:`, error.message);
  } catch (error) {
    console.error(`Falha ao registrar evento ${eventName}:`, error instanceof Error ? error.message : 'erro desconhecido');
  }
}

export async function recordAnonymousActivationEvent(anonymousId: string, eventName: string) {
  try {
    const { error } = await createAdminClient().from('anonymous_events').insert({
      anonymous_id: anonymousId,
      event_name: eventName,
      properties: {},
    });
    if (error) console.error(`Falha ao registrar evento anônimo ${eventName}:`, error.message);
  } catch (error) {
    console.error(`Falha ao registrar evento anônimo ${eventName}:`, error instanceof Error ? error.message : 'erro desconhecido');
  }
}
