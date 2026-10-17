/* NexBuild client — auth fixed, side ads, marketplace upgrades */
var sb = supabase.createClient(CFG.url, CFG.key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
});
var app = document.getElementById('app'), me = null, prof = null, tt, cache = [];
var $ = function (s) { return document.querySelector(s); };
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function toast(m) {
  var t = $('#toast');
  t.textContent = m;
  t.className = 'on';
  clearTimeout(tt);
  tt = setTimeout(function () { t.className = ''; }, 3500);
}
function usd(c) { return c ? '$' + (c / 100).toFixed(c % 100 ? 2 : 0) : 'Free'; }
function pub(p) { return sb.storage.from('covers').getPublicUrl(p).data.publicUrl; }
function day(d) { return new Date(d).toLocaleDateString(); }

/* ——— local storage helpers (favorites + recently viewed) ——— */
function lsGet(k, def) {
  try {
    var v = localStorage.getItem(k);
    return v ? JSON.parse(v) : def;
  } catch (e) { return def; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
}
function savedIds() { return lsGet('nb_saved', []); }
function isSaved(id) { return savedIds().indexOf(id) > -1; }
function toggleSave(id) {
  var a = savedIds(), i = a.indexOf(id);
  if (i > -1) a.splice(i, 1); else a.unshift(id);
  if (a.length > 80) a = a.slice(0, 80);
  lsSet('nb_saved', a);
  return a.indexOf(id) > -1;
}
function pushRecent(p) {
  if (!p || !p.id) return;
  var a = lsGet('nb_recent', []).filter(function (x) { return x.id !== p.id; });
  a.unshift({ id: p.id, title: p.title });
  lsSet('nb_recent', a.slice(0, 8));
}

async function api(u, o) {
  var s = (await sb.auth.getSession()).data.session;
  o = o || {};
  o.headers = Object.assign({ 'Content-Type': 'application/json' }, o.headers || {}, {
    Authorization: 'Bearer ' + (s ? s.access_token : '')
  });
  return (await fetch(u, o)).json();
}
async function download(id) {
  var d = await api('/api/download?project_id=' + id);
  if (d.url) location.href = d.url;
  else toast(d.error || 'Download failed');
}

function card(p) {
  var s = p.profiles || {};
  var saved = isSaved(p.id);
  return '<article class="card" data-id="' + esc(p.id) + '">' +
    '<button type="button" class="save-btn' + (saved ? ' on' : '') + '" data-save="' + esc(p.id) + '" aria-label="' + (saved ? 'Unsave' : 'Save') + ' project">' + (saved ? '♥' : '♡') + '</button>' +
    '<div class="cover" style="background-image:url(' + esc(pub(p.cover_path)) + ')"><span>' + usd(p.price_cents) + '</span></div>' +
    '<div class="body"><h3>' + esc(p.title) + '</h3>' +
    '<div class="by">by ' + esc(s.display_name) + ' · ' + (s.verified ? '<span class="ver">Verified</span>' : '<span class="nw">New seller</span>') + '</div>' +
    '<div class="tags">' + esc(p.category) + '</div>' +
    '<a class="btn" href="#/p/' + p.id + '">View project</a></div></article>';
}
function grid(l, empty) {
  return '<div class="grid">' + (l.length ? l.map(card).join('') : '<p>' + empty + '</p>') + '</div>';
}
async function load() {
  var r = await sb.from('projects').select('*,profiles(display_name,verified,is_admin)').eq('status', 'approved').order('created_at', { ascending: false });
  return r.data || [];
}
var isOwner = function (p) { return p.profiles && p.profiles.is_admin; };

function bindSaves(root) {
  (root || app).querySelectorAll('[data-save]').forEach(function (b) {
    b.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      var on = toggleSave(b.getAttribute('data-save'));
      b.classList.toggle('on', on);
      b.textContent = on ? '♥' : '♡';
      b.setAttribute('aria-label', on ? 'Unsave project' : 'Save project');
      toast(on ? 'Saved for later' : 'Removed from saved');
    };
  });
}

function nav() {
  $('#nav').innerHTML =
    '<a href="#/">Home</a><a href="#/explore">Explore</a>' +
    (me
      ? '<a href="#/dashboard">Dashboard</a>' +
        (prof && prof.is_admin ? '<a href="#/admin">Admin</a>' : '') +
        '<a class="btn" href="#/sell">Sell a project</a><a href="#" id="out">Sign out</a>'
      : '<a class="btn" href="#/login">Sign in</a>');
  var o = $('#out');
  if (o) o.onclick = function (e) {
    e.preventDefault();
    sb.auth.signOut().then(function () { toast('Signed out'); });
  };
}

async function boot() {
  // Clean OAuth hash fragments that Supabase leaves after redirect
  if (location.hash && /access_token|error=|type=recovery/.test(location.hash) && location.hash.indexOf('#/') !== 0) {
    // Let supabase client parse the URL first
  }
  var s = (await sb.auth.getSession()).data.session;
  me = s ? s.user : null;
  prof = null;
  if (me) {
    var r = await sb.from('profiles').select('*').eq('id', me.id).single();
    prof = r.data;
  }
  nav();
  route();
}

sb.auth.onAuthStateChange(function (ev) {
  if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'TOKEN_REFRESHED' || ev === 'USER_UPDATED') {
    boot();
  }
});

async function route() {
  var h = (location.hash || '#/').split('/'), v = h[1] || '';
  // Ignore pure OAuth callback hashes
  if (v && v.indexOf('access_token') === 0) {
    location.hash = '#/dashboard';
    return;
  }
  window.scrollTo(0, 0);
  app.onclick = null;
  if ({ sell: 1, dashboard: 1, admin: 1 }[v] && !me) {
    location.hash = '#/login';
    return;
  }
  app.innerHTML = '<p class="by">Loading…</p>';
  try {
    if (v === 'explore') await explore();
    else if (v === 'p') await detail(h[2]);
    else if (v === 'login') login();
    else if (v === 'sell') sell();
    else if (v === 'dashboard') await dash();
    else if (v === 'admin') await admin();
    else if (v === 'policies') policies();
    else if (v === 'saved') await savedPage();
    else await home();
  } catch (e) {
    console.error(e);
    app.innerHTML = '<p>Something went wrong. Refresh and try again.</p>';
  }
}
window.addEventListener('hashchange', route);

function recentBlock() {
  var r = lsGet('nb_recent', []);
  if (!r.length) return '';
  return '<div class="recent-box"><h3>Recently viewed</h3><div class="recent-list">' +
    r.map(function (x) { return '<a href="#/p/' + esc(x.id) + '">' + esc(x.title) + '</a>'; }).join(' · ') +
    '</div></div>';
}

async function home() {
  var r = await load();
  var mine = r.filter(isOwner);
  var more = r.filter(function (p) { return !isOwner(p); }).slice(0, 6);
  var cats = {};
  r.forEach(function (p) { if (p.category) cats[p.category] = (cats[p.category] || 0) + 1; });
  var catHtml = Object.keys(cats).sort().map(function (c) {
    return '<a class="cat-pill" href="#/explore?c=' + encodeURIComponent(c) + '">' + esc(c) + ' (' + cats[c] + ')</a>';
  }).join('');

  app.innerHTML =
    '<section class="hero">' +
      '<span class="eyebrow">THE ENGINEERING PROJECT MARKETPLACE</span>' +
      '<h1>Build it. Publish it. Get paid for it.</h1>' +
      '<p>Discover practical engineering projects, learn from real builds, and share the files behind your ideas.</p>' +
      '<div class="hero-actions">' +
        '<a class="btn" href="#/explore">Explore projects</a>' +
        '<a class="btn ghost" href="#/sell">Publish your project</a>' +
        (savedIds().length ? '<a class="btn ghost" href="#/saved">Saved (' + savedIds().length + ')</a>' : '') +
      '</div>' +
      '<div class="hero-points"><span>✓ Creator-led</span><span>✓ Reviewed listings</span><span>✓ Engineering-focused</span></div>' +
    '</section>' +
    recentBlock() +
    (catHtml ? '<div class="cat-row">' + catHtml + '</div>' : '') +
    '<div class="section-intro">' +
      '<span class="eyebrow">FOUNDER COLLECTION</span>' +
      '<h2 class="sec">Projects by ' + esc(CFG.owner) + '</h2>' +
      '<p>Start with the creator who built NexBuild, then explore projects from the community.</p>' +
    '</div>' +
    grid(mine, 'No founder projects yet. Publish the first one from the Sell page.') +
    '<div class="section-intro community-intro">' +
      '<span class="eyebrow">COMMUNITY PICKS</span>' +
      '<div class="bar"><h2 class="sec">More from the community</h2><a class="btn ghost" href="#/explore">See all</a></div>' +
      '<p>Ideas and useful files shared by other makers and engineers.</p>' +
    '</div>' +
    grid(more, 'Community projects will show here once approved.');
  bindSaves();
}

async function explore() {
  cache = await load();
  var params = new URLSearchParams((location.hash.split('?')[1] || ''));
  var q = params.get('q') || '', f = params.get('f') || 'all', cat = params.get('c') || 'all';
  var cats = ['all'].concat(Array.from(new Set(cache.map(function (p) { return p.category; }).filter(Boolean))).sort());

  function list() {
    var r = cache.filter(function (p) {
      var okF = f === 'all' || (f === 'free') === (p.price_cents === 0);
      var okC = cat === 'all' || p.category === cat;
      var hay = (p.title + ' ' + p.category + ' ' + (p.profiles || {}).display_name).toLowerCase();
      var okQ = !q || hay.indexOf(q.toLowerCase()) > -1;
      return okF && okC && okQ;
    });
    return r.length ? r.map(card).join('') : '<p>No projects match. Try another word or filter.</p>';
  }

  app.innerHTML =
    '<div class="bar"><h2 class="sec">Explore</h2>' +
      '<div class="chips" role="group" aria-label="Filter by price">' +
        ['all', 'free', 'paid'].map(function (x) {
          return '<button class="chip" data-f="' + x + '" aria-pressed="' + (x === f) + '">' + x[0].toUpperCase() + x.slice(1) + '</button>';
        }).join('') +
      '</div></div>' +
    '<div class="chips" style="margin-bottom:14px" role="group" aria-label="Category">' +
      cats.map(function (c) {
        return '<button class="chip" data-c="' + esc(c) + '" aria-pressed="' + (c === cat) + '">' + (c === 'all' ? 'All categories' : esc(c)) + '</button>';
      }).join('') +
    '</div>' +
    '<input id="q" type="search" placeholder="Search projects, categories or creators" aria-label="Search" value="' + esc(q) + '" style="margin:0 0 20px">' +
    '<div class="grid" id="g">' + list() + '</div>';
  bindSaves();

  function refresh() {
    $('#g').innerHTML = list();
    bindSaves($('#g'));
  }
  $('#q').oninput = function (e) { q = e.target.value; refresh(); };
  app.querySelectorAll('[data-f]').forEach(function (b) {
    b.onclick = function () {
      f = b.dataset.f;
      app.querySelectorAll('[data-f]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      refresh();
    };
  });
  app.querySelectorAll('[data-c]').forEach(function (b) {
    b.onclick = function () {
      cat = b.dataset.c;
      app.querySelectorAll('[data-c]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      refresh();
    };
  });
}

async function savedPage() {
  var ids = savedIds();
  if (!ids.length) {
    app.innerHTML = '<h2 class="sec">Saved projects</h2><p class="by">Nothing saved yet. Tap the heart on any project card.</p><a class="btn" href="#/explore">Explore projects</a>';
    return;
  }
  var all = await load();
  var map = {};
  all.forEach(function (p) { map[p.id] = p; });
  var list = ids.map(function (id) { return map[id]; }).filter(Boolean);
  app.innerHTML = '<div class="bar"><h2 class="sec">Saved projects</h2><span class="by">' + list.length + ' item' + (list.length === 1 ? '' : 's') + '</span></div>' + grid(list, 'Some saved projects are no longer available.');
  bindSaves();
}

async function detail(id) {
  var r = await sb.from('projects').select('*,profiles(display_name,verified)').eq('id', id).single();
  var p = r.data;
  if (!p) { app.innerHTML = '<p>Project not found.</p>'; return; }
  pushRecent(p);
  var own = false;
  if (me) {
    own = p.seller_id === me.id;
    if (!own && p.price_cents > 0) {
      var q = await sb.from('purchases').select('id').eq('project_id', id).eq('buyer_id', me.id);
      own = !!(q.data && q.data.length);
    }
  }
  var free = p.price_cents === 0, s = p.profiles || {}, can = own || (free && me);
  var inc = p.includes.split('\n').filter(Boolean).slice(0, 10).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
  var saved = isSaved(p.id);

  app.innerHTML =
    '<a class="by" href="#/explore">← Back to projects</a>' +
    '<div class="two"><div>' +
      '<h1 style="font-size:clamp(28px,4vw,40px);margin-top:10px">' + esc(p.title) + '</h1>' +
      '<p class="by">by ' + esc(s.display_name) + ' · ' +
        (s.verified ? '<span class="ver">Verified seller</span>' : '<span class="nw">New seller</span>') +
        ' · ' + esc(p.category) +
        (p.status !== 'approved' ? ' · <b>' + esc(p.status) + '</b>' : '') +
      '</p>' +
      '<div class="photo" style="background-image:url(' + esc(pub(p.cover_path)) + ')"></div>' +
      '<p>' + esc(p.description) + '</p>' +
      '<h3 style="margin:20px 0 8px">What you get</h3>' +
      '<ul class="by">' + inc + '</ul>' +
      '<p class="by">Formats: ' + esc(p.formats) + '</p>' +
      '<div class="share-row">' +
        '<button type="button" class="btn ghost" id="save-detail">' + (saved ? '♥ Saved' : '♡ Save') + '</button>' +
        '<button type="button" class="btn ghost" id="share">Copy link</button>' +
      '</div>' +
    '</div><aside>' +
      '<div class="box"><div class="price">' + usd(p.price_cents) + '</div>' +
        '<button class="btn" id="go" style="width:100%;margin-top:12px">' +
          (can ? 'Download files' : free ? 'Sign in to download' : 'Buy for ' + usd(p.price_cents)) +
        '</button></div>' +
      '<div class="box"><h3>Buy safely</h3><ul>' +
        '<li>Every project is reviewed by NexBuild before it is listed.</li>' +
        '<li>All sales are final. No refunds.</li>' +
        '<li>Files are delivered instantly after payment.</li>' +
        '<li><a href="#/policies">Read the full policies</a>.</li></ul>' +
        '<button class="btn ghost" id="rep" style="width:100%;margin-top:12px">Report this listing</button>' +
      '</div></aside></div>';

  $('#go').onclick = async function () {
    if (!me) { location.hash = '#/login'; return; }
    if (can) return download(id);
    this.disabled = true;
    var d = await api('/api/checkout', { method: 'POST', body: JSON.stringify({ project_id: id }) });
    if (d.url) location.href = d.url;
    else { toast(d.error || 'Checkout failed'); this.disabled = false; }
  };
  $('#rep').onclick = async function () {
    if (!me) { location.hash = '#/login'; return; }
    var why = prompt('What is wrong with this listing?');
    if (!why) return;
    var x = await sb.from('reports').insert({ project_id: id, reason: why.slice(0, 500) });
    toast(x.error ? 'Could not send report' : 'Report sent. We will review it.');
  };
  $('#save-detail').onclick = function () {
    var on = toggleSave(id);
    this.textContent = on ? '♥ Saved' : '♡ Save';
    toast(on ? 'Saved for later' : 'Removed from saved');
  };
  $('#share').onclick = function () {
    var url = location.origin + location.pathname + '#/p/' + id;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { toast('Link copied'); });
    } else {
      prompt('Copy this link:', url);
    }
  };
}

function login() {
  var reg = false;
  app.innerHTML =
    '<div class="narrow"><form class="panel" id="af">' +
      '<h2 id="at">Sign in to NexBuild</h2>' +
      '<p class="by">Save projects, publish your work, and connect with engineering creators.</p>' +
      '<button class="google-btn" type="button" id="google">' +
        '<span class="google-mark" aria-hidden="true">G</span> Continue with Google' +
      '</button>' +
      '<div class="auth-divider"><span>or continue with email</span></div>' +
      '<label id="nl" hidden>Display name<input id="nm" maxlength="40" autocomplete="name" placeholder="How others will see you"></label>' +
      '<label>Email<input id="em" type="email" required autocomplete="email"></label>' +
      '<label>Password<input id="pw" type="password" required minlength="8" autocomplete="current-password"></label>' +
      '<div class="auth-msg" id="amsg" role="alert"></div>' +
      '<button class="btn" type="submit" id="sbtn">Sign in</button>' +
      '<p class="by"><a href="#" id="sw">New here? Create an account</a> · <a href="#" id="fg">Forgot password</a></p>' +
    '</form></div>';

  function showMsg(text, ok) {
    var el = $('#amsg');
    el.textContent = text;
    el.className = 'auth-msg show ' + (ok ? 'ok' : 'err');
  }

  $('#google').onclick = async function () {
    this.disabled = true;
    try {
      var r = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: location.origin + '/#/dashboard',
          queryParams: { access_type: 'offline', prompt: 'select_account' }
        }
      });
      if (r.error) {
        showMsg('Google sign-in failed: ' + r.error.message, false);
        this.disabled = false;
      }
      // On success the browser redirects to Google; no further action needed here.
    } catch (err) {
      showMsg('Google sign-in error: ' + (err.message || err), false);
      this.disabled = false;
    }
  };

  $('#sw').onclick = function (e) {
    e.preventDefault();
    reg = !reg;
    $('#nl').hidden = !reg;
    $('#at').textContent = $('#sbtn').textContent = reg ? 'Create account' : 'Sign in';
    this.textContent = reg ? 'Have an account? Sign in' : 'New here? Create an account';
    $('#amsg').className = 'auth-msg';
    $('#pw').setAttribute('autocomplete', reg ? 'new-password' : 'current-password');
  };

  $('#fg').onclick = async function (e) {
    e.preventDefault();
    var em = $('#em').value.trim();
    if (!em) { showMsg('Type your email first.', false); return; }
    var r = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + '/#/login' });
    if (r.error) showMsg(r.error.message, false);
    else showMsg('If that email exists, a reset link is on its way. Check your inbox (and spam).', true);
  };

  $('#af').onsubmit = async function (e) {
    e.preventDefault();
    var em = $('#em').value.trim(), pw = $('#pw').value, r, btn = $('#sbtn');
    btn.disabled = true;
    $('#amsg').className = 'auth-msg';
    try {
      if (reg) {
        var name = ($('#nm').value || '').trim();
        r = await sb.auth.signUp({
          email: em,
          password: pw,
          options: {
            data: { name: name || 'Creator' },
            emailRedirectTo: location.origin + '/#/dashboard'
          }
        });
        if (r.error) {
          showMsg(friendlyAuthError(r.error), false);
        } else if (r.data && r.data.user && r.data.user.identities && r.data.user.identities.length === 0) {
          // Supabase returns empty identities when email already registered
          showMsg('An account with this email already exists. Sign in instead.', false);
        } else {
          showMsg('Check your email to confirm your account, then come back and sign in.', true);
        }
      } else {
        r = await sb.auth.signInWithPassword({ email: em, password: pw });
        if (r.error) showMsg(friendlyAuthError(r.error), false);
        else {
          toast('Welcome back!');
          location.hash = '#/dashboard';
        }
      }
    } catch (err) {
      showMsg(err.message || 'Something went wrong', false);
    }
    btn.disabled = false;
  };
}

function friendlyAuthError(err) {
  var m = (err && err.message) || 'Authentication failed';
  if (/Invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/Email not confirmed/i.test(m)) return 'Please confirm your email first (check inbox & spam).';
  if (/User already registered/i.test(m)) return 'This email is already registered. Sign in instead.';
  if (/Password should be/i.test(m)) return 'Password must be at least 8 characters.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  return m;
}

function sell() {
  var cats = ['Firmware', 'IoT', 'Robotics', 'Embedded', 'Mechanical', 'Electronics', 'Other'];
  app.innerHTML =
    '<div class="narrow" style="max-width:560px"><form class="panel" id="sf" autocomplete="off">' +
      '<h2>Sell a project</h2>' +
      '<small>You keep 70% of every sale. Every listing is reviewed before it goes live.</small>' +
      '<label>Project title<input id="t" required minlength="3" maxlength="60"></label>' +
      '<div class="row"><label>Price (USD)<input id="pr" type="number" min="0" max="500" step="1" value="0"></label>' +
      '<label>Category<select id="c">' + cats.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></label></div>' +
      '<small>Set 0 for free, otherwise $5 to $500.</small>' +
      '<label>Description<textarea id="d" rows="4" required minlength="40" maxlength="800" placeholder="What it is, what it does, how you made it (40+ characters)"></textarea></label>' +
      '<label>Project photo<input id="cv" type="file" accept="image/png,image/jpeg,image/webp" required></label>' +
      '<small>Your own photo or render. PNG, JPG or WebP, up to 2 MB.</small>' +
      '<label>What the buyer gets<textarea id="inc" rows="3" required maxlength="400" placeholder="One per line: Part files, Final assembly, Wiring diagram"></textarea></label>' +
      '<label>File formats<input id="fm" required maxlength="60" placeholder="SolidWorks, STEP"></label>' +
      '<label>Project files (one .zip, up to 50 MB)<input id="fl" type="file" accept=".zip" required></label>' +
      '<label class="chk"><input type="checkbox" required>I made this project or have the right to sell it.</label>' +
      '<label class="chk"><input type="checkbox" required>The photo and description match the files I deliver.</label>' +
      '<label class="chk"><input type="checkbox" required>I accept the <a href="#/policies">Seller terms</a>.</label>' +
      '<button class="btn" id="go" type="submit">Submit for review</button></form></div>';

  $('#sf').onsubmit = async function (e) {
    e.preventDefault();
    var b = $('#go');
    b.disabled = true;
    try {
      var cv = $('#cv').files[0], fl = $('#fl').files[0], price = Math.round(+$('#pr').value * 100);
      if (!/^image\/(png|jpeg|webp)$/.test(cv.type) || cv.size > 2e6) throw Error('Photo must be PNG, JPG or WebP under 2 MB.');
      if (!/\.zip$/i.test(fl.name) || fl.size > 5e7) throw Error('Project files must be one .zip under 50 MB.');
      if (price !== 0 && (price < 500 || price > 50000)) throw Error('Price must be 0, or between $5 and $500.');
      var id = crypto.randomUUID();
      var cp = me.id + '/' + id + '.' + cv.type.split('/')[1].replace('jpeg', 'jpg');
      var fp = me.id + '/' + id + '.zip';
      var a = await sb.storage.from('covers').upload(cp, cv);
      if (a.error) throw a.error;
      var z = await sb.storage.from('files').upload(fp, fl);
      if (z.error) throw z.error;
      var ins = await sb.from('projects').insert({
        id: id,
        seller_id: me.id,
        title: $('#t').value.trim(),
        description: $('#d').value.trim(),
        category: $('#c').value,
        formats: $('#fm').value.trim(),
        includes: $('#inc').value.trim(),
        price_cents: price,
        cover_path: cp,
        file_path: fp,
        status: 'pending'
      });
      if (ins.error) throw ins.error;
      toast('Submitted for review. You will see it on your dashboard.');
      location.hash = '#/dashboard';
    } catch (err) {
      toast(err.message || 'Upload failed');
      b.disabled = false;
    }
  };
}

async function dash() {
  var R = await Promise.all([
    sb.rpc('my_balance'),
    sb.from('projects').select('id,title,status,price_cents').eq('seller_id', me.id).order('created_at', { ascending: false }),
    sb.from('purchases').select('seller_share_cents,available_at,payout_id,created_at,projects(title)').eq('seller_id', me.id).order('created_at', { ascending: false }).limit(50),
    sb.from('payouts').select('*').eq('seller_id', me.id).order('created_at', { ascending: false }),
    sb.from('purchases').select('project_id,created_at,projects(title)').eq('buyer_id', me.id).order('created_at', { ascending: false })
  ]);
  var bal = (R[0].data && R[0].data[0]) || { pending: 0, available: 0, paid: 0 };
  var mp = R[1].data || [], sales = R[2].data || [], po = R[3].data || [], lib = R[4].data || [];
  function ln(a, b) { return '<div class="line"><span>' + a + '</span><span>' + b + '</span></div>'; }

  app.innerHTML =
    '<h1 style="font-size:36px;margin-bottom:6px">Dashboard</h1>' +
    '<p class="by">Hi ' + esc(prof && prof.display_name) + '. You keep 70% of every sale. Earnings stay pending for 7 days, then you can withdraw them.</p>' +
    '<div class="stats">' +
      '<div class="stat"><span class="by">Pending (7-day hold)</span><b>' + usd(bal.pending) + '</b></div>' +
      '<div class="stat"><span class="by">Available to withdraw</span><b>' + usd(bal.available) + '</b></div>' +
      '<div class="stat"><span class="by">Withdrawn or requested</span><b>' + usd(bal.paid) + '</b></div>' +
    '</div>' +
    '<form class="panel" id="pf" style="max-width:520px"><h2>Withdraw money</h2>' +
      '<small>Minimum $10. We send it by the method you choose.</small>' +
      '<label>Method<select id="pm"><option>PayPal</option><option>Bank transfer</option><option>Vodafone Cash</option><option>InstaPay</option></select></label>' +
      '<label>Account details<input id="pd" required maxlength="200" placeholder="Email, IBAN or phone number"></label>' +
      '<button class="btn" type="submit"' + (bal.available < 1000 ? ' disabled' : '') + '>Request payout</button></form>' +
    '<h2 class="sec">My projects</h2>' +
    (mp.map(function (p) {
      return ln('<a href="#/p/' + p.id + '">' + esc(p.title) + '</a>', esc(p.status) + ' · ' + usd(p.price_cents));
    }).join('') || '<p class="by">Nothing yet. <a href="#/sell">Sell your first project</a>.</p>') +
    '<h2 class="sec" style="margin-top:28px">My sales</h2>' +
    (sales.map(function (s) {
      return ln(esc((s.projects || {}).title) + ' · ' + day(s.created_at), usd(s.seller_share_cents) + ' · ' + (s.payout_id ? 'In payout' : new Date(s.available_at) > new Date() ? 'Pending' : 'Available'));
    }).join('') || '<p class="by">No sales yet.</p>') +
    '<h2 class="sec" style="margin-top:28px">Payouts</h2>' +
    (po.map(function (p) {
      return ln(esc(p.method) + ' · ' + day(p.created_at), usd(p.amount_cents) + ' · ' + esc(p.status));
    }).join('') || '<p class="by">No payouts yet.</p>') +
    '<h2 class="sec" style="margin-top:28px">My library</h2>' +
    (lib.map(function (x) {
      return ln('<a href="#/p/' + x.project_id + '">' + esc((x.projects || {}).title) + '</a>', day(x.created_at));
    }).join('') || '<p class="by">No purchases yet.</p>') +
    (savedIds().length ? '<p class="by" style="margin-top:20px"><a href="#/saved">View saved projects (' + savedIds().length + ')</a></p>' : '');

  $('#pf').onsubmit = async function (e) {
    e.preventDefault();
    if (bal.available < 1000) return toast('Minimum $10 available required');
    var method = $('#pm').value, details = $('#pd').value.trim();
    if (!details) return toast('Add account details');
    var ins = await sb.from('payouts').insert({
      seller_id: me.id,
      amount_cents: bal.available,
      method: method,
      details: details
    });
    if (ins.error) return toast(ins.error.message);
    toast('Payout requested. We will process it soon.');
    dash();
  };
}

async function admin() {
  if (!prof || !prof.is_admin) {
    app.innerHTML = '<p>Admins only.</p>';
    return;
  }
  var pending = (await sb.from('projects').select('*,profiles(display_name)').eq('status', 'pending').order('created_at', { ascending: true })).data || [];
  var payouts = (await sb.from('payouts').select('*,profiles(display_name)').eq('status', 'requested').order('created_at', { ascending: true })).data || [];
  var creators = (await sb.from('profiles').select('id,display_name,verified,is_admin').eq('verified', false).eq('is_admin', false).order('created_at', { ascending: false }).limit(40)).data || [];

  function ln(a, b) { return '<div class="line"><span>' + a + '</span><span>' + b + '</span></div>'; }

  app.innerHTML =
    '<h1 style="font-size:36px;margin-bottom:6px">Admin</h1>' +
    '<p class="by">Review listings, mark payouts paid, and grant verified badges. Only admins can verify creators.</p>' +
    '<h2 class="sec">Pending projects</h2>' +
    (pending.map(function (p) {
      return ln(
        '<a href="#/p/' + p.id + '">' + esc(p.title) + '</a> · ' + esc((p.profiles || {}).display_name),
        '<button class="btn" data-ok="' + p.id + '">Approve</button><button class="btn ghost" data-no="' + p.id + '">Reject</button>'
      );
    }).join('') || '<p class="by">Nothing pending.</p>') +
    '<h2 class="sec" style="margin-top:28px">Payout requests</h2>' +
    (payouts.map(function (p) {
      return ln(
        esc((p.profiles || {}).display_name) + ' · ' + esc(p.method) + ' · ' + esc(p.details),
        usd(p.amount_cents) + ' <button class="btn" data-pay="' + p.id + '">Mark paid</button>'
      );
    }).join('') || '<p class="by">No open requests.</p>') +
    '<h2 class="sec" style="margin-top:28px">Verify creators</h2>' +
    (creators.map(function (c) {
      return ln(esc(c.display_name), '<button class="btn" data-ver="' + c.id + '">Grant verified</button>');
    }).join('') || '<p class="by">Everyone eligible is already verified.</p>');

  app.onclick = async function (e) {
    var t = e.target, id;
    if ((id = t.getAttribute('data-ok'))) {
      await sb.from('projects').update({ status: 'approved' }).eq('id', id);
      toast('Approved'); admin();
    } else if ((id = t.getAttribute('data-no'))) {
      await sb.from('projects').update({ status: 'rejected' }).eq('id', id);
      toast('Rejected'); admin();
    } else if ((id = t.getAttribute('data-pay'))) {
      await sb.from('payouts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
      // Attach purchases to this payout so they are no longer available
      await sb.from('purchases').update({ payout_id: id }).eq('seller_id', (await sb.from('payouts').select('seller_id').eq('id', id).single()).data.seller_id).is('payout_id', null).lte('available_at', new Date().toISOString());
      toast('Marked paid'); admin();
    } else if ((id = t.getAttribute('data-ver'))) {
      var r = await sb.rpc('admin_verify_creator', { p_id: id });
      toast(r.error ? r.error.message : 'Verified');
      admin();
    }
  };
}

function policies() {
  var s = [
    ['About NexBuild', 'NexBuild is a marketplace for practical engineering projects. Creators upload files, photos and descriptions; buyers get a personal license to use them.'],
    ['Accounts', 'You must be 16 or older. Keep your login secure. We may suspend accounts that break these rules or that look fraudulent.'],
    ['Listings and review', 'Sellers must own the rights to what they upload, use an accurate project photo and an honest description, and the files must be complete and free of malware. Every listing is reviewed by NexBuild before it goes live, and we may ask for the original files. Sellers keep 70% of each sale and NexBuild keeps 30%, which covers payment fees. Earnings stay pending for 7 days after each sale, then can be withdrawn (minimum $10) and are sent by the method you choose. We may remove listings, hold payouts, or take back payouts for fraud or stolen work.'],
    ['Buyer license', 'Buying a project gives you a personal, non-exclusive, non-transferable license to build, study and modify it. You may not resell, share or upload the files, or claim them as your own. The seller keeps the copyright unless the listing says otherwise.'],
    ['Safety and engineering disclaimer', 'Projects are provided as is. Designs may need changes for your materials, tools and local rules. You are responsible for checking dimensions, loads, electrical safety and legal requirements before you build or use anything. Nothing on NexBuild is professional engineering advice.'],
    ['Liability', 'To the maximum extent allowed by law, NexBuild and its owner are not liable for indirect or lost-profit damages, injury, or property damage from projects or seller conduct. Total liability is limited to the amount you paid NexBuild in the last 12 months. Sellers are responsible for their listings and agree to cover claims caused by them.'],
    ['Copyright claims', 'If you believe a listing copies your work, email [your email] with a link, proof you own the work, and your contact details. We will review it and may remove the listing. Repeat copiers are banned.'],
    ['Privacy and ads', 'We collect your email, account details and purchase history to run the site. Our payment provider handles all payment details, and NexBuild never sees your card. We show third-party ads that may use cookies, and you can manage cookie choices in your browser. We do not sell your personal data. Email [your email] to see or delete your data.'],
    ['Governing law', 'These terms follow the laws of [your country], and disputes go to its courts, unless local consumer law says otherwise.']
  ];
  app.innerHTML =
    '<div class="pol" style="max-width:760px;margin:0 auto 40px">' +
      '<h1 style="font-size:clamp(30px,4vw,44px)">Policies</h1>' +
      '<p class="by">Draft v1. Have a lawyer review before launch.</p>' +
      s.map(function (x) { return '<h3>' + x[0] + '</h3><p>' + x[1] + '</p>'; }).join('') +
    '</div>';
}

/* Dark mode */
(function initTheme() {
  var dark = localStorage.getItem('nb_theme') === 'dark';
  if (dark) document.documentElement.classList.add('dark');
  var btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.textContent = dark ? 'Light mode' : 'Dark mode';
    btn.onclick = function () {
      document.documentElement.classList.toggle('dark');
      var on = document.documentElement.classList.contains('dark');
      localStorage.setItem('nb_theme', on ? 'dark' : 'light');
      btn.textContent = on ? 'Light mode' : 'Dark mode';
    };
  }
})();

/* Optional: inject real ad code later into #ad-left and #ad-right */
function injectAds(html) {
  var L = document.getElementById('ad-left'), R = document.getElementById('ad-right');
  if (L && html) L.innerHTML = html;
  if (R && html) R.innerHTML = html;
}
// injectAds('<!-- your AdSense / ad network code -->');

boot();
