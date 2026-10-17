import { getUser, sb, json, isId } from '../../lib/sb.js';
export async function onRequestPost({ request, env }) {
  const u = await getUser(env, request);
  if (!u) return json({ error: 'Sign in first' }, 401);
  const { project_id } = await request.json().catch(() => ({}));
  if (!isId(project_id)) return json({ error: 'Bad project' }, 400);
  const p = (await (await sb(env, `/rest/v1/projects?id=eq.${project_id}&status=eq.approved&select=id,title,price_cents,seller_id`)).json())[0];
  if (!p || p.price_cents <= 0) return json({ error: 'Not for sale' }, 400);
  if (p.seller_id === u.id) return json({ error: 'This is your own project' }, 400);
  const own = await (await sb(env, `/rest/v1/purchases?buyer_id=eq.${u.id}&project_id=eq.${p.id}&select=id`)).json();
  if (own.length) return json({ error: 'You already own this project' }, 400);
  const r = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: { Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json', Authorization: 'Bearer ' + env.LS_API_KEY },
    body: JSON.stringify({ data: { type: 'checkouts', attributes: {
      custom_price: p.price_cents,
      product_options: { name: p.title.slice(0, 60), redirect_url: env.SITE_URL + '/#/dashboard' },
      checkout_data: { email: u.email, custom: { project_id: p.id, buyer_id: u.id } } },
      relationships: { store: { data: { type: 'stores', id: String(env.LS_STORE_ID) } }, variant: { data: { type: 'variants', id: String(env.LS_VARIANT_ID) } } } } })
  });
  const d = await r.json();
  const url = d && d.data && d.data.attributes && d.data.attributes.url;
  return url ? json({ url }) : json({ error: 'Could not start checkout' }, 502);
}
