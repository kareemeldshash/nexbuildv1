import { sb, json, isId } from '../../lib/sb.js';
const SELLER_PERCENT = 70, HOLD_DAYS = 7;
async function hmac(secret, body) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function same(a, b) { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }
export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (!same(await hmac(env.LS_WEBHOOK_SECRET, raw), request.headers.get('X-Signature') || '')) return json({ error: 'bad signature' }, 401);
  const e = JSON.parse(raw), name = e.meta && e.meta.event_name, c = (e.meta && e.meta.custom_data) || {};
  if (name === 'order_refunded') {
    await sb(env, `/rest/v1/purchases?ls_order_id=eq.${encodeURIComponent(String(e.data.id))}&payout_id=is.null`, { method: 'DELETE' });
    return json({ ok: true });
  }
  if (name !== 'order_created' || e.data.attributes.status !== 'paid') return json({ ok: true });
  if (!isId(c.project_id) || !isId(c.buyer_id)) return json({ error: 'missing custom data' }, 400);
  const p = (await (await sb(env, `/rest/v1/projects?id=eq.${c.project_id}&select=id,seller_id,price_cents`)).json())[0];
  if (!p) return json({ error: 'unknown project' }, 400);
  const r = await sb(env, '/rest/v1/purchases?on_conflict=ls_order_id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ buyer_id: c.buyer_id, project_id: p.id, seller_id: p.seller_id, amount_cents: p.price_cents,
      seller_share_cents: Math.floor(p.price_cents * SELLER_PERCENT / 100),
      available_at: new Date(Date.now() + HOLD_DAYS * 864e5).toISOString(), ls_order_id: String(e.data.id) })
  });
  return r.ok ? json({ ok: true }) : json({ error: 'save failed' }, 500);
}
