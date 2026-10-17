export async function getUser(env, request) {
  const t = (request.headers.get('Authorization') || '').replace('Bearer ', '');
  if (!t) return null;
  const r = await fetch(env.SUPABASE_URL + '/auth/v1/user', { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + t } });
  return r.ok ? await r.json() : null;
}
export function sb(env, path, opt = {}) {
  return fetch(env.SUPABASE_URL + path, { ...opt, headers: { apikey: env.SUPABASE_SERVICE_KEY, ...(env.SUPABASE_SERVICE_KEY.startsWith('eyJ') ? { Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY } : {}), 'Content-Type': 'application/json', ...(opt.headers || {}) } });
}
export const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
export const isId = (x) => /^[0-9a-f-]{36}$/.test(x || '');
