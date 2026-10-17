var sb = supabase.createClient(CFG.url, CFG.key), app = document.getElementById('app'), me = null, prof = null, tt, cache = [];
var $ = function (s) { return document.querySelector(s); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function toast(m) { var t = $('#toast'); t.textContent = m; t.className = 'on'; clearTimeout(tt); tt = setTimeout(function () { t.className = ''; }, 3500); }
function usd(c) { return c ? '$' + (c / 100).toFixed(c % 100 ? 2 : 0) : 'Free'; }
function pub(p) { return sb.storage.from('covers').getPublicUrl(p).data.publicUrl; }
function day(d) { return new Date(d).toLocaleDateString(); }
function ad() { return '<div class="ad" aria-label="Advertisement">Ad slot. Paste your ad code here after approval.</div>'; }
async function api(u, o) { var s = (await sb.auth.getSession()).data.session; o = o || {}; o.headers = { Authorization: 'Bearer ' + (s ? s.access_token : '') }; return (await fetch(u, o)).json(); }
async function download(id) { var d = await api('/api/download?project_id=' + id); if (d.url) location.href = d.url; else toast(d.error || 'Download failed'); }

function card(p) {
  var s = p.profiles || {};
  return '<article class="card"><div class="cover" style="background-image:url(' + esc(pub(p.cover_path)) + ')"><span>' + usd(p.price_cents) + '</span></div><div class="body"><h3>' + esc(p.title) + '</h3><div class="by">by ' + esc(s.display_name) + ' · ' + (s.verified ? '<span class="ver">Verified</span>' : '<span class="nw">New seller</span>') + '</div><div class="tags">' + esc(p.category) + '</div><a class="btn" href="#/p/' + p.id + '">View project</a></div></article>';
}
function grid(l, empty) { return '<div class="grid">' + (l.length ? l.map(card).join('') : '<p>' + empty + '</p>') + '</div>'; }
async function load() { var r = await sb.from('projects').select('*,profiles(display_name,verified,is_admin)').eq('status', 'approved').order('created_at', { ascending: false }); return r.data || []; }
var isOwner = function (p) { return p.profiles && p.profiles.is_admin; };

function nav() {
  $('#nav').innerHTML = '<a href="#/">Home</a><a href="#/explore">Explore</a>' + (me ? '<a href="#/dashboard">Dashboard</a>' + (prof && prof.is_admin ? '<a href="#/admin">Admin</a>' : '') + '<a class="btn" href="#/sell">Sell a project</a><a href="#" id="out">Sign out</a>' : '<a class="btn" href="#/login">Sign in</a>');
  var o = $('#out'); if (o) o.onclick = function (e) { e.preventDefault(); sb.auth.signOut(); };
}
async function boot() {
  var s = (await sb.auth.getSession()).data.session; me = s ? s.user : null; prof = null;
  if (me) { var r = await sb.from('profiles').select('*').eq('id', me.id).single(); prof = r.data; }
  nav(); route();
}
sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') boot(); });

async function route() {
  var h = (location.hash || '#/').split('/'), v = h[1] || ''; window.scrollTo(0, 0); app.onclick = null;
  if ({ sell: 1, dashboard: 1, admin: 1 }[v] && !me) { location.hash = '#/login'; return; }
  app.innerHTML = '<p class="by">Loading…</p>';
  try {
    if (v === 'explore') await explore(); else if (v === 'p') await detail(h[2]); else if (v === 'login') login();
    else if (v === 'sell') sell(); else if (v === 'dashboard') await dash(); else if (v === 'admin') await admin();
    else if (v === 'policies') policies(); else await home();
  } catch (e) { app.innerHTML = '<p>Something went wrong. Refresh and try again.</p>'; }
}
window.addEventListener('hashchange', route);

async function home() {
  var r = await load(), mine = r.filter(isOwner), more = r.filter(function (p) { return !isOwner(p); }).slice(0, 3);
  app.innerHTML = '<section class="hero"><span class="eyebrow">THE ENGINEERING PROJECT MARKETPLACE</span><h1>Build it. Publish it. Get paid for it.</h1><p>Discover practical engineering projects, learn from real builds, and share the files behind your ideas.</p><div class="hero-actions"><a class="btn" href="#/explore">Explore projects</a><a class="btn ghost" href="#/sell">Publish your project</a></div><div class="hero-points"><span>✓ Creator-led</span><span>✓ Reviewed listings</span><span>✓ Engineering-focused</span></div></section><div class="section-intro"><span class="eyebrow">FOUNDER COLLECTION</span><h2 class="sec">Projects by ' + esc(CFG.owner) + '</h2><p>Start with the creator who built NexBuild, then explore projects from the community.</p></div>' + grid(mine, 'No projects yet.') + ad() +
    '<div class="section-intro community-intro"><span class="eyebrow">COMMUNITY PICKS</span><div class="bar"><h2 class="sec">More from the community</h2><a class="btn ghost" href="#/explore">See all</a></div><p>Ideas and useful files shared by other makers and engineers.</p></div>' + grid(more, 'Community projects will show here.');
}

async function explore() {
  cache = (await load()).filter(function (p) { return !isOwner(p); }); var q = '', f = 'all';
  function list() { var r = cache.filter(function (p) { return (f === 'all' || (f === 'free') === (p.price_cents === 0)) && (p.title + ' ' + p.category + ' ' + (p.profiles || {}).display_name).toLowerCase().indexOf(q.toLowerCase()) > -1; }); return r.length ? r.map(card).join('') : '<p>No projects match. Try another word or filter.</p>'; }
  app.innerHTML = '<div class="bar"><h2 class="sec">Explore</h2><div class="chips" role="group" aria-label="Filter by price">' + ['all', 'free', 'paid'].map(function (x) { return '<button class="chip" data-f="' + x + '" aria-pressed="' + (x === 'all') + '">' + x[0].toUpperCase() + x.slice(1) + '</button>'; }).join('') + '</div></div><input id="q" type="search" placeholder="Search projects, categories or creators" aria-label="Search" style="margin:0 0 20px"><div class="grid" id="g">' + list() + '</div>' + ad();
  $('#q').oninput = function (e) { q = e.target.value; $('#g').innerHTML = list(); };
  app.querySelectorAll('.chip').forEach(function (b) { b.onclick = function () { f = b.dataset.f; app.querySelectorAll('.chip').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); $('#g').innerHTML = list(); }; });
}

async function detail(id) {
  var r = await sb.from('projects').select('*,profiles(display_name,verified)').eq('id', id).single(), p = r.data;
  if (!p) { app.innerHTML = '<p>Project not found.</p>'; return; }
  var own = false;
  if (me) { own = p.seller_id === me.id; if (!own && p.price_cents > 0) { var q = await sb.from('purchases').select('id').eq('project_id', id).eq('buyer_id', me.id); own = !!(q.data && q.data.length); } }
  var free = p.price_cents === 0, s = p.profiles || {}, can = own || (free && me);
  var inc = p.includes.split('\n').filter(Boolean).slice(0, 10).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
  app.innerHTML = '<a class="by" href="#/explore">Back to projects</a><div class="two"><div><h1 style="font-size:clamp(28px,4vw,40px);margin-top:10px">' + esc(p.title) + '</h1><p class="by">by ' + esc(s.display_name) + ' · ' + (s.verified ? '<span class="ver">Verified seller</span>' : '<span class="nw">New seller</span>') + ' · ' + esc(p.category) + (p.status !== 'approved' ? ' · <b>' + esc(p.status) + '</b>' : '') + '</p><div class="photo" style="background-image:url(' + esc(pub(p.cover_path)) + ')"></div><p>' + esc(p.description) + '</p><h3 style="margin:20px 0 8px">What you get</h3><ul class="by">' + inc + '</ul><p class="by">Formats: ' + esc(p.formats) + '</p>' + ad() + '</div><aside><div class="box"><div class="price">' + usd(p.price_cents) + '</div><button class="btn" id="go" style="width:100%;margin-top:12px">' + (can ? 'Download files' : free ? 'Sign in to download' : 'Buy for ' + usd(p.price_cents)) + '</button></div><div class="box"><h3>Buy safely</h3><ul><li>Every project is reviewed by NexBuild before it is listed.</li><li>All sales are final. No refunds.</li><li>Files are delivered instantly after payment.</li><li><a href="#/policies">Read the full policies</a>.</li></ul><button class="btn ghost" id="rep" style="width:100%;margin-top:12px">Report this listing</button></div></aside></div>';
  $('#go').onclick = async function () {
    if (!me) { location.hash = '#/login'; return; }
    if (can) return download(id);
    this.disabled = true; var d = await api('/api/checkout', { method: 'POST', body: JSON.stringify({ project_id: id }) });
    if (d.url) location.href = d.url; else { toast(d.error || 'Checkout failed'); this.disabled = false; }
  };
  $('#rep').onclick = async function () {
    if (!me) { location.hash = '#/login'; return; }
    var why = prompt('What is wrong with this listing?'); if (!why) return;
    var x = await sb.from('reports').insert({ project_id: id, reason: why.slice(0, 500) }); toast(x.error ? 'Could not send report' : 'Report sent. We will review it.');
  };
}

function login() {
  var reg = false;
  app.innerHTML = '<div class="narrow"><form class="panel" id="af"><h2 id="at">Sign in to NexBuild</h2><p class="by">Save projects, publish your work, and connect with engineering creators.</p><button class="google-btn" type="button" id="google"><span class="google-mark" aria-hidden="true">G</span> Continue with Google</button><div class="auth-divider"><span>or continue with email</span></div><label id="nl" hidden>Display name<input id="nm" maxlength="40" autocomplete="name"></label><label>Email<input id="em" type="email" required autocomplete="email"></label><label>Password<input id="pw" type="password" required minlength="8" autocomplete="current-password"></label><button class="btn" type="submit" id="sbtn">Sign in</button><p class="by"><a href="#" id="sw">New here? Create an account</a> · <a href="#" id="fg">Forgot password</a></p></form></div>';
  $('#google').onclick = async function () {
    this.disabled = true;
    var r = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/#/dashboard', queryParams: { access_type: 'offline', prompt: 'select_account' } } });
    if (r.error) { toast('Google sign-in failed: ' + r.error.message); this.disabled = false; }
  };
  $('#sw').onclick = function (e) { e.preventDefault(); reg = !reg; $('#nl').hidden = !reg; $('#at').textContent = $('#sbtn').textContent = reg ? 'Create account' : 'Sign in'; this.textContent = reg ? 'Have an account? Sign in' : 'New here? Create an account'; };
  $('#fg').onclick = async function (e) { e.preventDefault(); var em = $('#em').value; if (!em) { toast('Type your email first.'); return; } await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin }); toast('If that email exists, a reset link is on its way.'); };
  $('#af').onsubmit = async function (e) {
    e.preventDefault(); var em = $('#em').value.trim(), pw = $('#pw').value, r;
    if (reg) { r = await sb.auth.signUp({ email: em, password: pw, options: { data: { name: $('#nm').value.trim() } } }); if (!r.error) toast('Check your email to confirm your account, then sign in.'); }
    else { r = await sb.auth.signInWithPassword({ email: em, password: pw }); if (!r.error) location.hash = '#/dashboard'; }
    if (r.error) toast(r.error.message);
  };
}

function sell() {
  var cats = ['Firmware', 'IoT', 'Robotics', 'Embedded', 'Mechanical', 'Electronics', 'Other'];
  app.innerHTML = '<div class="narrow" style="max-width:560px"><form class="panel" id="sf" autocomplete="off"><h2>Sell a project</h2><small>You keep 70% of every sale. Every listing is reviewed before it goes live.</small><label>Project title<input id="t" required minlength="3" maxlength="60"></label><div class="row"><label>Price (USD)<input id="pr" type="number" min="0" max="500" step="1" value="0"></label><label>Category<select id="c">' + cats.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></label></div><small>Set 0 for free, otherwise $5 to $500.</small><label>Description<textarea id="d" rows="4" required minlength="40" maxlength="800" placeholder="What it is, what it does, how you made it (40+ characters)"></textarea></label><label>Project photo<input id="cv" type="file" accept="image/png,image/jpeg,image/webp" required></label><small>Your own photo or render. PNG, JPG or WebP, up to 2 MB.</small><label>What the buyer gets<textarea id="inc" rows="3" required maxlength="400" placeholder="One per line: Part files, Final assembly, Wiring diagram"></textarea></label><label>File formats<input id="fm" required maxlength="60" placeholder="SolidWorks, STEP"></label><label>Project files (one .zip, up to 50 MB)<input id="fl" type="file" accept=".zip" required></label><label class="chk"><input type="checkbox" required>I made this project or have the right to sell it.</label><label class="chk"><input type="checkbox" required>The photo and description match the files I deliver.</label><label class="chk"><input type="checkbox" required>I accept the <a href="#/policies">Seller terms</a>.</label><button class="btn" id="go" type="submit">Submit for review</button></form></div>';
  $('#sf').onsubmit = async function (e) {
    e.preventDefault(); var b = $('#go'); b.disabled = true;
    try {
      var cv = $('#cv').files[0], fl = $('#fl').files[0], price = Math.round(+$('#pr').value * 100);
      if (!/^image\/(png|jpeg|webp)$/.test(cv.type) || cv.size > 2e6) throw Error('Photo must be PNG, JPG or WebP under 2 MB.');
      if (!/\.zip$/i.test(fl.name) || fl.size > 5e7) throw Error('Project files must be one .zip under 50 MB.');
      if (price !== 0 && (price < 500 || price > 50000)) throw Error('Price must be 0, or between $5 and $500.');
      var id = crypto.randomUUID(), cp = me.id + '/' + id + '.' + cv.type.split('/')[1].replace('jpeg', 'jpg'), fp = me.id + '/' + id + '.zip';
      var a = await sb.storage.from('covers').upload(cp, cv); if (a.error) throw a.error;
      var f = await sb.storage.from('files').upload(fp, fl, { contentType: 'application/zip' }); if (f.error) throw f.error;
      var i = await sb.from('projects').insert({ seller_id: me.id, title: $('#t').value.trim(), description: $('#d').value.trim(), category: $('#c').value, formats: $('#fm').value.trim(), includes: $('#inc').value.trim(), price_cents: price, cover_path: cp, file_path: fp });
      if (i.error) throw i.error;
      toast('Submitted. We review every project before it goes live.'); location.hash = '#/dashboard';
    } catch (x) { toast(x.message || 'Upload failed'); }
    b.disabled = false;
  };
}

async function dash() {
  var R = await Promise.all([
    sb.rpc('my_balance'),
    sb.from('projects').select('id,title,status,price_cents').eq('seller_id', me.id).order('created_at', { ascending: false }),
    sb.from('purchases').select('seller_share_cents,available_at,payout_id,created_at,projects(title)').eq('seller_id', me.id).order('created_at', { ascending: false }).limit(50),
    sb.from('payouts').select('*').eq('seller_id', me.id).order('created_at', { ascending: false }),
    sb.from('purchases').select('project_id,created_at,projects(title)').eq('buyer_id', me.id).order('created_at', { ascending: false })]);
  var bal = (R[0].data && R[0].data[0]) || { pending: 0, available: 0, paid: 0 }, mp = R[1].data || [], sales = R[2].data || [], po = R[3].data || [], lib = R[4].data || [];
  function ln(a, b) { return '<div class="line"><span>' + a + '</span><span>' + b + '</span></div>'; }
  app.innerHTML = '<h1 style="font-size:36px;margin-bottom:6px">Dashboard</h1><p class="by">Hi ' + esc(prof && prof.display_name) + '. You keep 70% of every sale. Earnings stay pending for 7 days, then you can withdraw them.</p>' +
    '<div class="stats"><div class="stat"><span class="by">Pending (7-day hold)</span><b>' + usd(bal.pending) + '</b></div><div class="stat"><span class="by">Available to withdraw</span><b>' + usd(bal.available) + '</b></div><div class="stat"><span class="by">Withdrawn or requested</span><b>' + usd(bal.paid) + '</b></div></div>' +
    '<form class="panel" id="pf" style="max-width:520px"><h2>Withdraw money</h2><small>Minimum $10. We send it by the method you choose.</small><label>Method<select id="pm"><option>PayPal</option><option>Bank transfer</option><option>Vodafone Cash</option><option>InstaPay</option></select></label><label>Account details<input id="pd" required maxlength="200" placeholder="Email, IBAN or phone number"></label><button class="btn" type="submit"' + (bal.available < 1000 ? ' disabled' : '') + '>Request payout</button></form>' +
    '<h2 class="sec">My projects</h2>' + (mp.map(function (p) { return ln('<a href="#/p/' + p.id + '">' + esc(p.title) + '</a>', esc(p.status) + ' · ' + usd(p.price_cents)); }).join('') || '<p class="by">Nothing yet. <a href="#/sell">Sell your first project</a>.</p>') +
    '<h2 class="sec" style="margin-top:28px">My sales</h2>' + (sales.map(function (s) { return ln(esc((s.projects || {}).title) + ' · ' + day(s.created_at), usd(s.seller_share_cents) + ' · ' + (s.payout_id ? 'In payout' : new Date(s.available_at) > new Date() ? 'Pending until ' + day(s.available_at) : 'Available')); }).join('') || '<p class="by">No sales yet.</p>') +
    '<h2 class="sec" style="margin-top:28px">My payouts</h2>' + (po.map(function (p) { return ln(day(p.created_at) + ' · ' + esc(p.method), usd(p.amount_cents) + ' · ' + esc(p.status)); }).join('') || '<p class="by">No payouts yet.</p>') +
    '<h2 class="sec" style="margin-top:28px">My library</h2>' + (lib.map(function (l) { return ln(esc((l.projects || {}).title), '<button class="btn dl" data-id="' + l.project_id + '">Download</button>'); }).join('') || '<p class="by">Projects you buy will appear here.</p>');
  app.onclick = function (e) { var b = e.target.closest('.dl'); if (b) download(b.dataset.id); };
  $('#pf').onsubmit = async function (e) {
    e.preventDefault(); var r = await sb.rpc('request_payout', { p_method: $('#pm').value, p_details: $('#pd').value.trim() });
    if (r.error) toast(r.error.message); else { toast('Payout requested. We will send it soon.'); dash(); }
  };
}

async function admin() {
  if (!prof || !prof.is_admin) { app.innerHTML = '<p>Admins only.</p>'; return; }
  var R = await Promise.all([sb.from('projects').select('*,profiles(display_name)').eq('status', 'pending').order('created_at'), sb.from('payouts').select('*,profiles(display_name)').eq('status', 'requested').order('created_at'), sb.from('profiles').select('id,display_name,verified,created_at,is_admin').eq('verified', false).order('created_at')]), pp = R[0].data || [], po = R[1].data || [], creators = (R[2].data || []).filter(function (x) { return !x.is_admin; });
  app.innerHTML = '<h1 style="font-size:36px;margin-bottom:14px">Admin</h1><p class="by">Manage project reviews, creator verification, and payout requests. Verification is granted by an admin only.</p><h2 class="sec">Creator verification (' + creators.length + ')</h2>' + (creators.map(function (c) { return '<div class="line"><span><b>' + esc(c.display_name) + '</b><small> · Joined ' + day(c.created_at) + '</small></span><button class="btn" data-a="verify" data-id="' + c.id + '">Verify creator</button></div>'; }).join('') || '<p class="by">No creators waiting for verification.</p>') + '<h2 class="sec" style="margin-top:28px">Projects to review (' + pp.length + ')</h2>' +
    (pp.map(function (p) { return '<div class="box"><h3>' + esc(p.title) + ' · ' + usd(p.price_cents) + '</h3><p class="by">by ' + esc((p.profiles || {}).display_name) + ' · ' + esc(p.category) + ' · ' + esc(p.formats) + '</p><div class="photo" style="height:160px;background-image:url(' + esc(pub(p.cover_path)) + ')"></div><p>' + esc(p.description) + '</p><p class="by">' + esc(p.includes).replace(/\n/g, '<br>') + '</p><button class="btn ghost" data-a="dl" data-id="' + p.id + '">Download files to check</button> <button class="btn" data-a="approved" data-id="' + p.id + '">Approve</button> <button class="btn ghost" data-a="rejected" data-id="' + p.id + '">Reject</button></div>'; }).join('') || '<p class="by">Nothing waiting.</p>') +
    '<h2 class="sec" style="margin-top:28px">Payout requests (' + po.length + ')</h2>' +
    (po.map(function (p) { return '<div class="line"><span>' + esc((p.profiles || {}).display_name) + ' · ' + usd(p.amount_cents) + ' · ' + esc(p.method) + ' · ' + esc(p.details) + '</span><button class="btn" data-a="paid" data-id="' + p.id + '">Mark paid</button></div>'; }).join('') || '<p class="by">No requests.</p>');
  app.onclick = async function (e) {
    var b = e.target.closest('button[data-a]'); if (!b) return; var a = b.dataset.a, id = b.dataset.id;
    if (a === 'dl') return download(id);
    var r = a === 'paid' ? await sb.rpc('admin_mark_paid', { p_id: id }) : a === 'verify' ? await sb.rpc('admin_verify_creator', { p_id: id }) : await sb.from('projects').update({ status: a }).eq('id', id);
    if (r.error) toast(r.error.message); else { toast('Done'); admin(); }
  };
}

function policies() {
  var s = [['Terms of use', 'NexBuild is a marketplace where independent creators sell digital engineering files. NexBuild is not the seller and does not check the technical accuracy of listed projects. You must be 18 or older. Do not list weapons, malware, stolen designs, or anything illegal. We may remove listings or close accounts that break these rules.'],
    ['All sales are final', 'Projects are digital files delivered right after payment, so all sales are final and non-refundable. NexBuild reviews every project before it is listed. If a file is corrupted or will not open, report it within 7 days and we will replace it. The only refunds are duplicate charges and cases where the law requires one. By paying you agree to instant delivery and, where the law allows, give up any right to cancel after delivery.'],
    ['Seller terms', 'Sellers must own the rights to everything they list, or have permission to sell it. Every listing needs your own project photo and an honest description, and the files must be complete and free of malware. Every listing is reviewed by NexBuild before it goes live, and we may ask for the original files. Sellers keep 70% of each sale and NexBuild keeps 30%, which covers payment fees. Earnings stay pending for 7 days after each sale, then can be withdrawn (minimum $10) and are sent by the method you choose. We may remove listings, hold payouts, or take back payouts for fraud or stolen work.'],
    ['Buyer license', 'Buying a project gives you a personal, non-exclusive, non-transferable license to build, study and modify it. You may not resell, share or upload the files, or claim them as your own. The seller keeps the copyright unless the listing says otherwise.'],
    ['Safety and engineering disclaimer', 'Projects are provided as is. Designs may need changes for your materials, tools and local rules. You are responsible for checking dimensions, loads, electrical safety and legal requirements before you build or use anything. Nothing on NexBuild is professional engineering advice.'],
    ['Liability', 'To the maximum extent allowed by law, NexBuild and its owner are not liable for indirect or lost-profit damages, injury, or property damage from projects or seller conduct. Total liability is limited to the amount you paid NexBuild in the last 12 months. Sellers are responsible for their listings and agree to cover claims caused by them.'],
    ['Copyright claims', 'If you believe a listing copies your work, email [your email] with a link, proof you own the work, and your contact details. We will review it and may remove the listing. Repeat copiers are banned.'],
    ['Privacy and ads', 'We collect your email, account details and purchase history to run the site. Our payment provider handles all payment details, and NexBuild never sees your card. We show third-party ads that may use cookies, and you can manage cookie choices in your browser. We do not sell your personal data. Email [your email] to see or delete your data.'],
    ['Governing law', 'These terms follow the laws of [your country], and disputes go to its courts, unless local consumer law says otherwise.']];
  app.innerHTML = '<div class="pol" style="max-width:760px;margin:0 auto 40px"><h1 style="font-size:clamp(30px,4vw,44px)">Policies</h1><p class="by">Draft v1. Have a lawyer review before launch.</p>' + s.map(function (x) { return '<h3>' + x[0] + '</h3><p>' + x[1] + '</p>'; }).join('') + '</div>';
}

boot();
