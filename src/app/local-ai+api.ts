/**
 * Route API de DÉVELOPPEMENT : relaie l'analyse d'image vers Ollama sur le PC (Qwen3-VL, gratuit, local).
 * Le téléphone joint déjà le serveur Expo en Wi-Fi ; cette route lui donne accès à l'IA locale
 * sans ouvrir Ollama sur le réseau. Désactivée hors développement (404).
 *
 * La réponse est relayée en flux (NDJSON d'Ollama, `stream: true`) : les en-têtes partent tout de suite,
 * ce qui évite la coupure à 30 s du serveur de développement pendant une analyse d'une minute.
 */
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV !== 'development') return new Response('Not found', { status: 404 });
  try {
    const body = { ...(await request.json()), stream: true };
    const upstream = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': 'application/x-ndjson' } });
  } catch (e) {
    return Response.json({ error: `Ollama injoignable sur ce PC (${e instanceof Error ? e.message : e}). Ollama est-il lancé ?` }, { status: 502 });
  }
}
