// GET /functions/v1/stripe-return?to=done|refresh  (appelé par le navigateur à la fin de l'inscription Stripe — sans JWT)
// Stripe exige des adresses https pour revenir de son formulaire : cette page renvoie simplement vers l'app.
const page = (to: string) => {
  const target = `homemade://settings?payments=${to === 'refresh' ? 'refresh' : 'done'}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=${target}"><title>Homemade</title>
<style>body{font-family:system-ui,sans-serif;background:#FAF6EF;color:#1B1A17;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center;padding:24px}
a{display:inline-block;margin-top:16px;background:#1F3A2E;color:#fff;padding:14px 22px;border-radius:14px;text-decoration:none;font-weight:600}</style></head>
<body><div><h2>Retour à Homemade…</h2><p>Paiements : ${to === 'refresh' ? 'lien expiré, relancez depuis l’app.' : 'informations envoyées à Stripe.'}</p>
<a href="${target}">Ouvrir l’app / Open the app</a></div><script>location.href=${JSON.stringify(target)}</script></body></html>`;
};

Deno.serve((req) => {
  const to = new URL(req.url).searchParams.get('to') ?? 'done';
  return new Response(page(to), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
});
