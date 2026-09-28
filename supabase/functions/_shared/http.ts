// Utilitaires communs aux Edge Functions (runtime Deno de Supabase).
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

export function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name) ?? fallback;
  if (v === undefined) throw new HttpError(500, 'MISSING_ENV', `Variable d'environnement manquante : ${name}`);
  return v;
}

const supabaseUrl = () => env('SUPABASE_URL');
const anonKey = () => Deno.env.get('SUPABASE_ANON_KEY') ?? env('SUPABASE_PUBLISHABLE_KEY');
const serviceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? env('SUPABASE_SECRET_KEY');

/** Client service role : contourne la RLS. À n'utiliser qu'après avoir authentifié l'appelant. */
export const adminClient = (): SupabaseClient =>
  createClient(supabaseUrl(), serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });

/** Client « au nom de l'utilisateur » : la RLS et auth.uid() s'appliquent. */
export const userClient = (req: Request): SupabaseClient =>
  createClient(supabaseUrl(), anonKey(), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function requireUser(req: Request): Promise<{ user: User; client: SupabaseClient }> {
  const client = userClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'UNAUTHENTICATED');
  return { user: data.user, client };
}

/** Enveloppe standard : CORS, méthode, erreurs typées → réponses JSON cohérentes. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      // Erreurs Postgres levées par les RPC (ex. « HEALTH_PROFILE_CONFLICT ») : message métier exploitable.
      const message = e instanceof Error ? e.message : String(e);
      console.error('[edge-function]', message);
      return json({ error: 'INTERNAL', message }, 500);
    }
  };
}
