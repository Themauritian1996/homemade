// POST /functions/v1/push-notify  { message_id } | { ping: true }
// Appelée par la base (déclencheur `messages_push_notify`, via pg_net) avec l'en-tête x-push-secret.
// Envoie une notification Firebase Cloud Messaging (API HTTP v1) aux téléphones des autres participants, en respectant
// la préférence « Nouveaux messages et commandes » et les conversations supprimées. Les jetons périmés sont oubliés.
// Secrets : FIREBASE_SERVICE_ACCOUNT (JSON du compte de service), PUSH_WEBHOOK_SECRET (posé par le robot de déploiement).
import { adminClient, env, handler, HttpError, json } from '../_shared/http.ts';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const b64url = (data: ArrayBuffer | string) =>
  btoa(typeof data === 'string' ? data : String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function serviceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) return null;
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.project_id || !sa.client_email || !sa.private_key) throw new HttpError(500, 'FIREBASE_SERVICE_ACCOUNT_INVALID');
  return sa;
}

let cached: { token: string; until: number } | null = null;

/** Jeton OAuth Google (JWT signé RS256 avec la clé du compte de service), gardé en mémoire ~55 min. */
async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(signature)}` }),
  });
  const out = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !out.access_token) throw new HttpError(502, 'FIREBASE_AUTH_FAILED', out.error_description ?? `HTTP ${res.status}`);
  cached = { token: out.access_token, until: Date.now() + 55 * 60_000 };
  return out.access_token;
}

Deno.serve(
  handler(async (req) => {
    if (req.headers.get('x-push-secret') !== env('PUSH_WEBHOOK_SECRET')) throw new HttpError(401, 'UNAUTHORIZED');
    const body = (await req.json()) as { message_id?: string; ping?: boolean };
    const sa = serviceAccount();

    // Vérification par le robot de déploiement : compte de service lisible et accepté par Google.
    if (body.ping) {
      if (!sa) return json({ ok: true, firebase: false });
      await accessToken(sa);
      return json({ ok: true, firebase: true, project: sa.project_id });
    }
    if (!sa) return json({ sent: 0, reason: 'firebase_not_configured' });
    if (!body.message_id) throw new HttpError(400, 'INVALID_INPUT');

    const db = adminClient();
    const { data: msg } = await db.from('messages').select('id, conversation_id, sender_id, kind, body').eq('id', body.message_id).maybeSingle();
    if (!msg) return json({ sent: 0, reason: 'message_not_found' });

    // Destinataires : les autres participants qui n'ont pas supprimé la conversation et gardent la préférence active.
    const { data: parts } = await db
      .from('conversation_participants')
      .select('user_id, hidden_at')
      .eq('conversation_id', msg.conversation_id)
      .neq('user_id', msg.sender_id ?? '00000000-0000-0000-0000-000000000000');
    const candidates = (parts ?? []).filter((p) => !p.hidden_at).map((p) => p.user_id as string);
    if (!candidates.length) return json({ sent: 0 });
    const { data: settings } = await db.from('user_settings').select('user_id, notify_messages, notify_preview').in('user_id', candidates);
    const pref = new Map((settings ?? []).map((x) => [x.user_id as string, x]));
    const recipients = candidates.filter((id) => pref.get(id)?.notify_messages !== false);
    if (!recipients.length) return json({ sent: 0 });
    const { data: tokens } = await db.from('push_tokens').select('token, user_id').in('user_id', recipients);
    if (!tokens?.length) return json({ sent: 0 });

    let title = 'Homemade';
    if (msg.kind !== 'system' && msg.sender_id) {
      const { data: p } = await db.from('profiles').select('display_name').eq('id', msg.sender_id).maybeSingle();
      if (p?.display_name) title = p.display_name;
    }
    const text = String(msg.body).length > 180 ? `${String(msg.body).slice(0, 177)}…` : String(msg.body);
    // Texte d'un message privé : seulement si le destinataire l'a choisi (sinon « Nouveau message », dans sa langue).
    const { data: locales } = await db.from('profiles').select('id, locale').in('id', recipients);
    const lang = new Map((locales ?? []).map((x) => [x.id as string, String(x.locale ?? 'fr')]));
    const bodyFor = (userId: string) =>
      msg.kind === 'system' || pref.get(userId)?.notify_preview ? text : lang.get(userId)?.startsWith('en') ? 'New message' : 'Nouveau message';

    const auth = await accessToken(sa);
    let sent = 0;
    const stale: string[] = [];
    await Promise.all(
      tokens.map(async ({ token, user_id }) => {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body: bodyFor(user_id as string) },
              data: { conversationId: msg.conversation_id },
              android: { priority: 'HIGH', notification: { channel_id: 'messages', sound: 'default', color: '#E2553B' } },
            },
          }),
        });
        if (res.ok) sent++;
        else {
          const err = await res.text();
          // Application désinstallée ou jeton remplacé : on l'oublie.
          if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(err)) stale.push(token);
          else console.warn('[push-notify] FCM', res.status, err.slice(0, 300));
        }
      }),
    );
    if (stale.length) await db.from('push_tokens').delete().in('token', stale);
    return json({ sent, stale: stale.length });
  }),
);
