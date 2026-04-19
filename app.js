// ── SUPABASE CONFIG ───────────────────────────────────────────────────────────
// Replace these two values with your own from supabase.com → Project Settings → API
const SUPABASE_URL = 'https://fscopstrkbhkyuhrklkp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__y-xdXOLMTovehN76jzuGA_XBBiJwMb';
// ─────────────────────────────────────────────────────────────────────────────

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── STATE ─────────────────────────────────────────────────────────────────────
let currentUser = null;
let activeTab = 'log';

// ── INIT ──────────────────────────────────────────────────────────────────────
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user ?? null;
  render();

  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    render();
  });
}

// ── RENDER ROOT ───────────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  if (!currentUser) {
    app.innerHTML = renderAuth();
  } else {
    app.innerHTML = renderApp();
    loadTab(activeTab);
  }
}

// ── AUTH SCREEN ───────────────────────────────────────────────────────────────
function renderAuth() {
  return `
    <div style="text-align:center;margin-bottom:2rem;margin-top:2rem;">
      <div class="logo" style="justify-content:center;display:block;">⛵ <span>Boat</span> Hours</div>
    </div>
    <div class="auth-wrap">
      <div class="auth-card">
        <h2>Sign in</h2>
        <p>Only invited members can access the boat tracker.</p>
        <div class="field">
          <label>Email</label>
          <input type="email" id="auth-email" placeholder="you@example.com" />
        </div>
        <div class="field">
          <label>Password</label>
          <input type="password" id="auth-pass" placeholder="••••••••" />
        </div>
        <div class="err" id="auth-err"></div>
        <div style="display:flex;gap:8px;margin-top:0.5rem;">
          <button class="btn btn-primary btn-full" onclick="signIn()">Sign in</button>
        </div>
        <p style="font-size:10px;color:var(--muted);margin-top:1rem;text-align:center;">
          Contact the boat owner if you need access.
        </p>
      </div>
    </div>`;
}

async function signIn() {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value;
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) document.getElementById('auth-err').textContent = error.message;
}

async function signUp() {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value;
  if (pass.length < 6) {
    document.getElementById('auth-err').textContent = 'Password must be at least 6 characters.';
    return;
  }
  const { error } = await sb.auth.signUp({ email, password: pass });
  if (error) document.getElementById('auth-err').textContent = error.message;
  else toast('Check your email to confirm your account.');
}

async function signOut() {
  await sb.auth.signOut();
}

// ── APP SHELL ─────────────────────────────────────────────────────────────────
function renderApp() {
  const email = currentUser.email;
  return `
    <header style="position:relative">
      <div class="logo">⛵ <span>Boat</span> Hours</div>
        <div class="user-pill" onclick="toggleUserMenu()" style="cursor:pointer;">
        ${email} ▾
        </div>
        <div id="user-menu" style="display:none; position:absolute; right:0; top:60px; background:var(--navy2); border:1px solid rgba(194,219,245,0.2); border-radius:var(--radius); padding:1rem; width:260px; z-index:100;">
        <p class="slabel" style="margin-bottom:0.75rem;">Change password</p>
        <div class="field" style="margin-bottom:0.5rem;">
            <label>New password</label>
            <input type="password" id="new-pass" placeholder="min. 6 characters" />
        </div>
        <div class="field" style="margin-bottom:0.5rem;">
            <label>Confirm password</label>
            <input type="password" id="confirm-pass" placeholder="repeat password" />
        </div>
        <div class="err" id="pass-err" style="margin-bottom:0.5rem;"></div>
        <div style="display:flex; gap:8px;">
            <button class="btn btn-primary" style="flex:1;" onclick="changePassword()">Update</button>
            <button class="btn btn-ghost" onclick="toggleUserMenu()">Cancel</button>
        </div>
        <hr style="border-color:rgba(194,219,245,0.1); margin:0.75rem 0;" />
        <button class="btn btn-ghost btn-full" onclick="signOut()">Sign out</button>
        </div>
    </header>
    <div class="tabs">
      <button class="tab ${activeTab === 'log'     ? 'active' : ''}" onclick="switchTab('log')">Log trip</button>
      <button class="tab ${activeTab === 'history' ? 'active' : ''}" onclick="switchTab('history')">History</button>
      <button class="tab ${activeTab === 'people'  ? 'active' : ''}" onclick="switchTab('people')">People</button>
    </div>
    <div id="tab-content"></div>`;
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach((el, i) => {
    el.classList.toggle('active', ['log', 'history', 'people'][i] === tab);
  });
  loadTab(tab);
}

function loadTab(tab) {
  if (tab === 'log')     renderLogTab();
  if (tab === 'history') renderHistoryTab();
  if (tab === 'people')  renderPeopleTab();
}

// ── LOG TAB ───────────────────────────────────────────────────────────────────
async function renderLogTab() {
  const el = document.getElementById('tab-content');
  el.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const [{ data: people }, { data: trips }] = await Promise.all([
    sb.from('people').select('*').order('name'),
    sb.from('trips').select('*, people(name)').order('date', { ascending: false })
  ]);

  const totals = {};
  (people || []).forEach(p => totals[p.id] = { name: p.name, hours: 0 });
  (trips  || []).forEach(t => { if (totals[t.person_id]) totals[t.person_id].hours += t.hours; });

  const maxH     = Math.max(...Object.values(totals).map(x => x.hours), 0.01);
  const totalAll = Object.values(totals).reduce((a, b) => a + b.hours, 0);

  const statsHtml = Object.entries(totals).map(([, v]) => {
    const pct      = totalAll > 0 ? Math.round(v.hours / totalAll * 100) : 0;
    const { h, m } = splitHM(v.hours);
    const barW     = Math.round(v.hours / maxH * 100);
    return `
      <div class="stat-card">
        <div class="who">${v.name}</div>
        <div class="hrs">${h}<span class="hrs-unit">h ${m}m</span></div>
        <div class="pct">${pct}% of total</div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width:${barW}%"></div></div>
      </div>`;
  }).join('') || '<div class="empty">No people added yet — go to People tab.</div>';

  const peopleOpts = (people || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  const today = new Date().toISOString().split('T')[0];

  const { h: totalH, m: totalM } = splitHM(totalAll);

  el.innerHTML =
    <p class="slabel">Total boat usage</p>
    <div class="stat-card" style="margin-bottom:1.75rem; display:flex; align-items:baseline; gap:16px;">
      <div>
        <div class="who">All users combined</div>
        <div class="hrs">${totalH}<span class="hrs-unit">h ${totalM}m</span></div>
      </div>
    </div>

    <p class="slabel">Hours per person</p>
    <div class="stats-grid">${statsHtml}</div>

    <p class="slabel">Log a trip</p>
    <div class="form-card">
      <div class="form-row">
        <div class="field">
          <label>Person</label>
          <select id="f-person">${peopleOpts || '<option disabled>Add people first</option>'}</select>
        </div>
        <div class="field">
          <label>Date</label>
          <input type="date" id="f-date" value="${today}" />
        </div>
        <div class="field">
          <label>Start time</label>
          <input type="text" id="f-start" placeholder="09:00" maxlength="5" />
        </div>
        <div class="field">
          <label>End time</label>
          <input type="text" id="f-end" placeholder="14:30" maxlength="5" />
        </div>
        <div class="field" style="min-width:unset;flex:0 0 auto;">
          <label style="opacity:0">_</label>
          <button class="btn btn-primary" onclick="logTrip()">Add</button>
        </div>
      </div>
      <div class="err" id="trip-err"></div>
    </div>`;
}

async function logTrip() {
  const person_id = document.getElementById('f-person').value;
  const date      = document.getElementById('f-date').value;
  const start     = document.getElementById('f-start').value.trim();
  const end       = document.getElementById('f-end').value.trim();
  const errEl     = document.getElementById('trip-err');

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!person_id || !date || !start || !end) {
    errEl.textContent = 'Fill in all fields.';
    return;
  }
  if (!timeRegex.test(start) || !timeRegex.test(end)){
        errEl.textContent = 'Enter time as HH:MM (e.g. 9:00).';
        return;
    }

  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);

  if (mins <= 0) {
    errEl.textContent = 'End time must be after start time.';
    return;
  }
  errEl.textContent = '';

  const { error } = await sb.from('trips').insert({
    person_id,
    date,
    start_time: start,
    end_time: end,
    hours: mins / 60,
    logged_by: currentUser.id
  });

  if (error) { errEl.textContent = error.message; return; }
  toast('Trip logged!');
  renderLogTab();
}

// ── HISTORY TAB ───────────────────────────────────────────────────────────────
async function renderHistoryTab() {
  const el = document.getElementById('tab-content');
  el.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const { data: trips } = await sb
    .from('trips')
    .select('*, people(name)')
    .order('date', { ascending: false })
    .order('start_time', { ascending: false });

  if (!trips || trips.length === 0) {
    el.innerHTML = '<div class="empty">No trips logged yet.</div>';
    return;
  }

  const items = trips.map(t => {
    const { h, m } = splitHM(t.hours);
    return `
      <div class="trip-item">
        <div class="trip-dot"></div>
        <div class="trip-body">
          <div class="trip-who">${t.people?.name ?? '—'}</div>
            <div class="trip-detail">${t.date} &nbsp;·&nbsp; ${t.start_time?.slice(0,5)} – ${t.end_time?.slice(0,5)}</div>
        </div>
        <div class="trip-hrs">${h}h ${m}m</div>
        <button class="btn btn-danger" onclick="deleteTrip('${t.id}')">Remove</button>
      </div>`;
  }).join('');

  el.innerHTML = `<div class="form-card" style="padding:0.5rem 1.25rem;"><div class="trip-list">${items}</div></div>`;
}

async function deleteTrip(id) {
  const { error } = await sb.from('trips').delete().eq('id', id);
  if (error) { toast(error.message, true); return; }
  toast('Trip removed.');
  renderHistoryTab();
}

// ── PEOPLE TAB ────────────────────────────────────────────────────────────────
async function renderPeopleTab() {
  const el = document.getElementById('tab-content');
  el.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const { data: people } = await sb.from('people').select('*').order('name');

  const chips = (people || []).map(p => `
    <div class="person-chip">
      ${p.name}
      <button onclick="deletePerson('${p.id}', '${p.name}')" title="Remove">×</button>
    </div>`
  ).join('') || '<span style="font-size:12px;color:var(--muted);">No people yet.</span>';

  el.innerHTML = `
    <p class="slabel">Add person</p>
    <div class="form-card">
      <div class="add-person-row">
        <div class="field" style="margin:0;flex:1;">
          <input type="text" id="new-person" placeholder="Name…" onkeydown="if(event.key==='Enter') addPerson()" />
        </div>
        <button class="btn btn-primary" onclick="addPerson()">Add</button>
      </div>
      <div class="err" id="person-err"></div>
      <div class="people-list" id="people-list">${chips}</div>
    </div>`;
}

async function addPerson() {
  const name  = document.getElementById('new-person').value.trim();
  const errEl = document.getElementById('person-err');
  if (!name) return;

  const { error } = await sb.from('people').insert({ name });
  if (error) { errEl.textContent = error.message; return; }

  document.getElementById('new-person').value = '';
  toast(`${name} added.`);
  renderPeopleTab();
}

async function deletePerson(id, name) {
  if (!confirm(`Remove ${name}? Their trips will also be deleted.`)) return;
  await sb.from('trips').delete().eq('person_id', id);
  const { error } = await sb.from('people').delete().eq('id', id);
  if (error) { toast(error.message, true); return; }
  toast(`${name} removed.`);
  renderPeopleTab();
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function splitHM(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return { h, m };
}

let toastTimer;
function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3000);
}

function toggleUserMenu() {
  const menu = document.getElementById('user-menu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

async function changePassword() {
  const newPass     = document.getElementById('new-pass').value;
  const confirmPass = document.getElementById('confirm-pass').value;
  const errEl       = document.getElementById('pass-err');

  if (newPass.length < 6) {
    errEl.textContent = 'Password must be at least 6 characters.';
    return;
  }
  if (newPass !== confirmPass) {
    errEl.textContent = 'Passwords do not match.';
    return;
  }

  const { error } = await sb.auth.updateUser({ password: newPass });
  if (error) { errEl.textContent = error.message; return; }

  toggleUserMenu();
  toast('Password updated!');
}

// ── START ─────────────────────────────────────────────────────────────────────
init();
