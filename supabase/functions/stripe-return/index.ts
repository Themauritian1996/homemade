// GET /functions/v1/stripe-return?to=done|refresh  (ouvert par le navigateur à la fin du formulaire Stripe — sans JWT)
// Stripe exige une adresse https pour revenir de son formulaire ; on redirige aussitôt (302) vers l'app.
// Pas de page HTML : Supabase sert les réponses des Edge Functions en texte brut (le HTML s'affichait comme du code).
Deno.serve((req) => {
  const to = new URL(req.url).searchParams.get('to') === 'refresh' ? 'refresh' : 'done';
  const target = `homemade://settings?payments=${to}`;
  return new Response(`Retour à Homemade : ${target}\nBack to Homemade: ${target}\n`, {
    status: 302,
    headers: { Location: target, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
});
