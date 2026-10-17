import { getUser, sb, json, isId } from '../../lib/sb.js';
export async function onRequestGet({ request, env }) {
  const u = await getUser(env, request);
  if (!u) return json({ error: 'Sign in first' }, 401);
  const id = new URL(request.url).searchParams.get('project_id');
  if (!isId(id)) return json({ error: 'Bad project' }, 400);
  const p = (await (await sb(env, `/rest/v1/projects?id=eq.${id}&select=seller_id,price_cents,file_path,status`)).json())[0];
  if (!p) return json({ error: 'Not found' }, 404);
  const me = (await (await sb(env, `/rest/v1/profiles?id=eq.${u.id}&select=is_admin`)).json())[0];
  let ok = p.seller_id === u.id || (me && me.is_admin) || (p.status === 'approved' && p.price_cents === 0);
  if (!ok) ok = (await (await sb(env, `/rest/v1/purchases?buyer_id=eq.${u.id}&project_id=eq.${id}&select=id`)).json()).length > 0;
  if (!ok) return json({ error: 'Buy this project to download it' }, 403);
  const d = await (await sb(env, `/storage/v1/object/sign/files/${p.file_path}`, { method: 'POST', body: JSON.stringify({ expiresIn: 60 }) })).json();
  return d.signedURL ? json({ url: env.SUPABASE_URL + '/storage/v1' + d.signedURL }) : json({ error: 'File missing' }, 404);
}
