/* Group Eats — core: utilities, native bridge, profile, sync and shared state. */
'use strict';
var A = window.AndroidApp;
if (!A) { document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">Open this inside the Group Eats Android app.</p>'; throw new Error('no bridge'); }

// ================================================================ utilities
var $ = function (id) { return document.getElementById(id); };
var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (k) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[k]; }); };
var enc = encodeURIComponent;
function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function rnd(n, alpha) { alpha = alpha || 'abcdefghijkmnpqrstuvwxyz23456789'; var a = new Uint32Array(n), s = ''; crypto.getRandomValues(a); for (var i = 0; i < n; i++) s += alpha[a[i] % alpha.length]; return s; }
var CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function fmtCode(c) { return c.slice(0, 4) + '-' + c.slice(4); }
function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function validCode(c) { return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(c); }
function topicFor(c) { return 'groupeats-v2-' + c.toLowerCase(); }
function dist(a, b) { var R = 6371000, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r; var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2); return 2 * R * Math.asin(Math.sqrt(h)); }
function ll(p) { return { lat: p.la, lng: p.lo }; }
function fmtDist(m) { var mi = m / 1609.34; return mi < 0.1 ? Math.round(m * 3.281) + ' ft' : mi < 10 ? mi.toFixed(1) + ' mi' : Math.round(mi) + ' mi'; }
function ago(ts) { var s = (Date.now() - ts) / 1000; if (s < 50) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }); }
function clock(ts) { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function initials(n) { return String(n || '?').trim().split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase(); }
var AV_COLORS = ['#E63B2E', '#1F9D6B', '#3D5AFE', '#B5179E', '#F08C00', '#0F7C90', '#7048E8', '#C2255C'];
function colorFor(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; }
function bytes(s) { return new TextEncoder().encode(s).length; }
function toast(m) { var t = $('toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.add('hidden'); }, 2800); }
function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function ic(name) { return '<svg class="ic"><use href="#i-' + name + '"/></svg>'; }
function normName(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/\b(the|restaurant|cafe|café|bar|nyc|new york|kitchen|and)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim(); }
function nameMatch(a, b) {
  a = normName(a); b = normName(b);
  if (!a || !b) return false;
  if (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return true;
  var ta = a.split(' '), tb = b.split(' '), hit = 0;
  ta.forEach(function (t) { if (t.length > 1 && tb.indexOf(t) >= 0) hit++; });
  return hit / Math.max(1, Math.min(ta.length, tb.length)) >= 0.6;
}
function avatar(m, cls) {
  var id = m.id || m.u || m.name || '?';
  return '<span class="av ' + (cls || '') + '" style="background:' + colorFor(id) + '">' + esc(initials(m.name || m.n)) + '</span>';
}

// ================================================================ native bridge promises
var pending = {}, seq = 0;
window.__appHttpCb = function (id, code, body) { var p = pending[id]; if (p) { delete pending[id]; p({ code: code, body: body }); } };
window.__appLoc = function (id, json) { var p = pending[id]; if (p) { delete pending[id]; try { p(JSON.parse(json)); } catch (e) { p({ ok: false, error: 'Bad location' }); } } };
function req(method, url, headers, body, auth) {
  return new Promise(function (res) { var id = 'h' + (++seq); pending[id] = res; A.request(id, method, url, headers ? JSON.stringify(headers) : '', body || '', auth || ''); });
}
function reqJSON(method, url, headers, body, auth) {
  return req(method, url, headers, body, auth).then(function (r) {
    var j = null; try { j = JSON.parse(r.body); } catch (e) {}
    if (r.code !== 200) {
      var m = (j && j.error && (j.error.message || j.error.description)) || (Array.isArray(j) && j[0] && j[0].error && j[0].error.message) || ('HTTP ' + r.code);
      var err = new Error(m); err.code = r.code; throw err;
    }
    return j;
  });
}
function getLocation() { return new Promise(function (res) { var id = 'l' + (++seq); pending[id] = res; A.getLocation(id); }); }
function info() { try { return JSON.parse(A.appInfo()); } catch (e) { return {}; } }

// ================================================================ profile
var me = lsGet('ge:me', null);
if (!me) { me = { id: rnd(10), name: '', diet: [] }; lsSet('ge:me', me); }
if (!me.diet) me.diet = [];
var prefs = lsGet('ge:prefs', { appLink: '', updateSrc: '' });
// built-in links (published on GitHub): used unless the user sets their own in Settings
var DEFAULT_LINKS = { webLink: 'https://evermaat.github.io/group-eats/', appLink: 'https://github.com/evermaat/group-eats/releases/latest/download/Group-Eats.apk', updateSrc: 'evermaat/group-eats' };
Object.keys(DEFAULT_LINKS).forEach(function (k) { if (!prefs[k]) prefs[k] = DEFAULT_LINKS[k]; });
var recents = lsGet('ge:recents', []);
var S = null, myLoc = null;
function saveMe() { lsSet('ge:me', me); try { A.setName(me.name || ''); } catch (e) {} }
var DIETS = [['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['gluten-free', 'Gluten-free'], ['halal', 'Halal'], ['kosher', 'Kosher'], ['dairy-free', 'Dairy-free']];
function dietLabel(k) { for (var i = 0; i < DIETS.length; i++) if (DIETS[i][0] === k) return DIETS[i][1]; return k; }

function blankState() {
  return { title: '', members: {}, filters: defaultFilters(), filtersTs: 0, filtersBy: '',
    searches: {}, order: [], places: {}, votes: {}, feed: [], pick: null, reqs: {}, deadline: null, ratings: {} };
}
function defaultFilters() {
  var h = new Date().getHours(), d = new Date().getDay();
  var what = (h < 11 || ((d === 0 || d === 6) && h < 15)) ? 'Brunch' : h < 16 ? 'Lunch' : 'Dinner';
  return { what: what, text: '', where: { mode: 'me', label: '' }, radius: 1.6, when: { mode: 'now', date: '', time: '' },
    open: true, minRating: 0, priceMax: 0, outdoor: false, groups: false, reserve: false, brunchMenu: false, diet: true,
    sort: 'best', mode: 'walk', party: '4' };
}

// ================================================================ sync (event log over ntfy.sh)
var Q = [], flushTimer = null, backoffUntil = 0, inflight = false, evCounter = 0, renderTimer = null, syncStatus = 'connecting', lastHello = 0;

function caps(first) {
  var i = info(), c = { g: !!i.hasGoogle, y: !!i.hasYelp, diet: me.diet || [] };
  if (prefs.updateSrc) c.upd = prefs.updateSrc;
  if (prefs.appLink) c.dl = prefs.appLink;
  if (prefs.webLink) c.wl = prefs.webLink;
  if (lsGet('ge:ntfyAlerts', false)) c.na = true;
  if (first) c.first = true;
  if (info().web) c.web = true;
  return c;
}
function openSession(code, title) {
  if (S) closeSession(true);
  var saved = lsGet('ge:s:' + code, null);
  S = { code: code, topic: topicFor(code), st: blankState(), seen: {}, log: [], lastId: saved ? saved.lastId : '', unseen: 0, joinedAt: Date.now() };
  if (saved && saved.log) saved.log.forEach(function (ev) { applyEv(ev, false, false); });
  if (title && !S.st.title) emit('meta', { title: title });
  emit('hello', caps(!saved));
  lastHello = Date.now();
  A.syncStart(S.topic, S.lastId || '', me.id, S.st.title || title || '');
  var r = recents.filter(function (x) { return x.code !== code; });
  r.unshift({ code: code, title: S.st.title || title || 'Table', ts: Date.now() });
  recents = r.slice(0, 6); lsSet('ge:recents', recents);
  lsSet('ge:last', code);
  if (!lsGet('ge:askedNotif', false)) { lsSet('ge:askedNotif', true); try { A.requestNotifications(); } catch (e) {} }
  showScreen('session'); setTab('find'); renderAll();
}
function closeSession(silent) {
  if (!S) return;
  A.syncStop();
  persist(true);
  S = null;
  lsSet('ge:last', '');
  if (!silent) { showScreen('start'); renderStart(); }
}
function emit(t, data) {
  if (!S) return null;
  var ev = Object.assign({ id: me.id + '.' + Date.now().toString(36) + '.' + (++evCounter), t: t, ts: Date.now() }, data || {});
  Object.keys(ev).forEach(function (k) { if (ev[k] === undefined) delete ev[k]; });
  ev.u = me.id; ev.n = me.name;
  applyEv(ev, true, true);
  Q.push(ev);
  publishAlert(ev);
  scheduleFlush(t === 'results' ? 50 : 600);
  if (t !== 'filters') scheduleRender();
  return ev;
}
function scheduleFlush(ms) {
  if (flushTimer) return;
  flushTimer = setTimeout(function () { flushTimer = null; flush(); }, Math.max(ms, backoffUntil - Date.now()));
}
var pubCbs = {};
window.__appPubCb = function (id, code) { var f = pubCbs[id]; if (f) { delete pubCbs[id]; f(code); } };
function flush() {
  if (!S || inflight || !Q.length) return;
  if (!A.isOnline()) { scheduleFlush(4000); return; }
  var batch = [], size = 60;
  while (Q.length) {
    var strip = Object.assign({}, Q[0]); delete strip.u; delete strip.n;
    var b = bytes(JSON.stringify(strip)) + 1;
    if (batch.length && size + b > 3700) break;
    batch.push(strip); size += b; Q.shift();
  }
  var body = JSON.stringify({ v: 2, u: me.id, n: me.name, ev: batch });
  inflight = true;
  var id = 'p' + (++seq), topic = S.topic;
  pubCbs[id] = function (code) {
    inflight = false;
    if (code === 200) { if (Q.length) scheduleFlush(300); return; }
    Q = batch.map(function (e) { return Object.assign({ u: me.id, n: me.name }, e); }).concat(Q);
    backoffUntil = Date.now() + (code === 429 ? 12000 : 5000);
    scheduleFlush(code === 429 ? 12000 : 5000);
  };
  A.syncPublish(id, topic, body);
}
window.__syncState = function (s) { syncStatus = s; renderHeader(); if (s === 'live' && Q.length) scheduleFlush(200); };
window.__syncBatch = function (lines) { (lines || []).forEach(function (l) { window.__syncMsg(l, true); }); scheduleRender(); };
window.__syncMsg = function (line, batched) {
  if (!S) return;
  var o, m;
  try { o = JSON.parse(line); m = JSON.parse(o.message); } catch (e) { return; }
  if (!m || m.v !== 2 || !Array.isArray(m.ev) || o.topic && o.topic !== S.topic) return;
  S.lastId = o.id;
  var serverTs = (o.time || 0) * 1000, live = serverTs > Date.now() - 120000, changed = false;
  m.ev.forEach(function (ev) {
    if (!ev || !ev.id || S.seen[ev.id]) return;
    ev.u = String(m.u || '').slice(0, 20); ev.n = String(m.n || 'Someone').slice(0, 24);
    if (!ev.ts || ev.ts > Date.now() + 60000) ev.ts = serverTs || Date.now();
    applyEv(ev, false, live);
    changed = true;
  });
  if (changed && !batched) scheduleRender();
};
function persist(now) {
  if (!S) return;
  clearTimeout(persist._t);
  var save = function () { if (!S) return; lsSet('ge:s:' + S.code, { lastId: S.lastId, log: S.log.slice(-1500) }); };
  if (now) save(); else persist._t = setTimeout(save, 800);
}
function scheduleRender() { if (renderTimer) return; renderTimer = setTimeout(function () { renderTimer = null; renderAll(); }, 100); }

// ---- fold one event into state
var hooks = { pick: [], status: [] };
function applyEv(ev, mine, live) {
  if (S.seen[ev.id]) return;
  S.seen[ev.id] = 1;
  S.log.push(ev);
  persist();
  var st = S.st, u = ev.u, mem = st.members[u] || (st.members[u] = { id: u, name: ev.n, lastSeen: 0, caps: {}, diet: [] });
  mem.name = ev.n || mem.name; mem.lastSeen = Math.max(mem.lastSeen, ev.ts);
  switch (ev.t) {
    case 'hello':
      mem.caps = { g: !!ev.g, y: !!ev.y, na: !!ev.na, web: !!ev.web }; mem.diet = Array.isArray(ev.diet) ? ev.diet.slice(0, 8) : [];
      if (!mem.joined) { mem.joined = ev.ts; addFeed('sys', ev, ev.n + ' joined the table'); }
      if (u !== me.id) adoptShared(ev);
      break;
    case 'meta': if (ev.title) st.title = String(ev.title).slice(0, 40); break;
    case 'filters':
      if (ev.ts >= st.filtersTs && ev.f) { st.filters = Object.assign(defaultFilters(), ev.f); st.filtersTs = ev.ts; st.filtersBy = u === me.id ? 'you' : ev.n; if (u !== me.id) S.filtersDirty = true; }
      break;
    case 'loc': if (typeof ev.lat === 'number') mem.loc = { lat: ev.lat, lng: ev.lng, ts: ev.ts, label: ev.label || '' }; break;
    case 'locoff': delete mem.loc; break;
    case 'searchReq':
      st.reqs[ev.rid] = { by: ev.n, u: u, ts: ev.ts, f: ev.f, at: ev.at };
      if (u !== me.id) addFeed('sys', ev, ev.n + ' searched ' + describe(ev.f, ev.at));
      if (live && u !== me.id) maybeFulfil(ev);
      break;
    case 'results':
      var s = st.searches[ev.rid];
      if (!s) {
        s = st.searches[ev.rid] = { rid: ev.rid, by: ev.n, u: u, ts: ev.ts, f: ev.f, at: ev.at, src: ev.src, forN: ev.forN, parts: {} };
        st.order.push(ev.rid);
        if (!mine) addFeed('sys', ev, (ev.forN ? ev.n + ' found places for ' + ev.forN : ev.n + ' shared new places') + ': ' + describe(ev.f, ev.at));
        if (S.waiting && S.waiting.rid === ev.rid) {
          clearTimeout(S.waiting.timer); S.waiting = null;
          setTimeout(function () { setSearching(false); scrollToResults(); }, 0);
        }
      }
      if (ev.f && !s.f) s.f = ev.f;
      if (ev.at && !s.at) s.at = ev.at;
      s.parts[ev.part || 0] = ev.items || [];
      (ev.items || []).forEach(function (p) { st.places[p.id] = p; });
      break;
    case 'vote':
      if (ev.p && ev.p.id && !st.places[ev.p.id]) st.places[ev.p.id] = ev.p;
      var v = st.votes[ev.pid] || (st.votes[ev.pid] = {});
      if (ev.v === 1 || ev.v === -1) v[u] = ev.v; else delete v[u];
      if (!mine && ev.v) addFeed('sys', ev, ev.n + (ev.v === 1 ? ' is in for ' : ' vetoed ') + ((st.places[ev.pid] || {}).n || 'a place'));
      break;
    case 'msg': addFeed(ev.ai ? 'ai' : 'msg', ev, String(ev.text || '').slice(0, 1200)); if (!mine) S.unseen++; break;
    case 'pick':
      st.pick = { pid: ev.pid, p: ev.p, by: ev.n, u: u, ts: ev.ts, auto: !!ev.auto, spin: ev.spin || null };
      if (ev.p && !st.places[ev.p.id]) st.places[ev.p.id] = ev.p;
      st.deadline = null;
      addFeed('sys', ev, (ev.auto ? 'Voting closed. The table picked ' : ev.n + ' picked ') + ((ev.p || {}).n || 'a place'));
      hooks.pick.forEach(function (f) { f(ev, mine, live); });
      break;
    case 'unpick': st.pick = null; addFeed('sys', ev, ev.n + ' reopened the decision'); break;
    case 'deadline': st.deadline = { at: ev.at, did: ev.id, by: ev.n, u: u, ts: ev.ts }; addFeed('sys', ev, ev.n + ' started a ' + Math.round((ev.at - ev.ts) / 60000) + '-minute vote'); break;
    case 'deadlineOff': if (st.deadline) { st.deadline = null; if (!ev.quiet) addFeed('sys', ev, ev.n + ' cancelled the vote timer'); } break;
    case 'status':
      mem.status = { s: ev.s, eta: ev.eta, wait: ev.wait, ts: ev.ts };
      if (ev.s === 'here') addFeed('sys', ev, ev.n + ' has arrived' + (ev.wait > 0 ? '. Wait is about ' + ev.wait + ' min' : ev.wait === 0 ? '. No wait' : ''));
      else if (ev.s === 'way') addFeed('sys', ev, ev.n + ' is on the way' + (ev.eta ? ', about ' + ev.eta + ' min' : ''));
      hooks.status.forEach(function (f) { f(ev, mine, live); });
      break;
    case 'rating':
      st.ratings[ev.pid] = st.ratings[ev.pid] || {};
      st.ratings[ev.pid][u] = { r: ev.r, note: ev.note || '' };
      addFeed('sys', ev, ev.n + ' rated ' + ((st.places[ev.pid] || {}).n || 'the place') + ' ' + ev.r + ' out of 5');
      break;
  }
}
function addFeed(kind, ev, text) { S.st.feed.push({ kind: kind, n: ev.n, u: ev.u, ts: ev.ts, text: text }); }
function adoptShared(ev) {
  var changed = false;
  if (ev.upd && !prefs.updateSrc && /^(https:\/\/|[\w.-]+\/[\w.-]+$)/.test(ev.upd)) { prefs.updateSrc = ev.upd; prefs.updAdopted = ev.n; changed = true; }
  if (ev.dl && !prefs.appLink && /^https:\/\//.test(ev.dl)) { prefs.appLink = ev.dl; changed = true; }
  if (ev.wl && !prefs.webLink && /^https:\/\//.test(ev.wl)) { prefs.webLink = ev.wl; changed = true; }
  if (changed) { lsSet('ge:prefs', prefs); setTimeout(function () { checkUpdate(false); }, 1500); }
}

// ================================================================ phone alerts (ntfy app, e.g. on iPhone)
// When anyone at the table turns on ntfy alerts, every phone also posts short, readable notifications
// to "<topic>-alerts", which the free ntfy app can subscribe to for real push notifications.
function alertTopic() { return S ? S.topic + '-alerts' : ''; }
function tableLink() { return prefs.webLink ? prefs.webLink.replace(/[?#].*$/, '') + '?t=' + S.code : ''; }
function publishAlert(ev) {
  if (!S || !A.syncAlert) return;
  var wanted = memberList().some(function (m) { return m.caps && m.caps.na; }) || lsGet('ge:ntfyAlerts', false);
  if (!wanted) return;
  var msg = null, tags = [];
  if (ev.t === 'msg') { msg = me.name + ': ' + String(ev.text || '').slice(0, 300); tags = ['speech_balloon']; }
  else if (ev.t === 'pick') { msg = (ev.auto ? 'Voting closed. The table picked ' : me.name + ' picked ') + ((ev.p || {}).n || 'a place'); tags = ['tada']; }
  else if (ev.t === 'deadline') { msg = me.name + ' started a ' + Math.round((ev.at - ev.ts) / 60000) + '-minute vote'; tags = ['alarm_clock']; }
  else if (ev.t === 'results' && !ev.part) { msg = me.name + (ev.forN ? ' found places for ' + ev.forN : ' shared new places') + ': ' + describe(ev.f, ev.at); tags = ['clipboard']; }
  else if (ev.t === 'status' && ev.s === 'here') { msg = me.name + ' has arrived' + (ev.wait > 0 ? ', about ' + ev.wait + ' min wait' : ''); tags = ['round_pushpin']; }
  else if (ev.t === 'hello' && ev.first) { msg = me.name + ' joined the table'; tags = ['wave']; }
  if (!msg) return;
  var o = { topic: alertTopic(), title: S.st.title || 'Group Eats', message: msg, tags: tags };
  if (tableLink()) o.click = tableLink();
  try { A.syncAlert(JSON.stringify(o)); } catch (e) {}
}

// ================================================================ votes
function tally(pid) {
  var v = (S && S.st.votes[pid]) || {}, up = [], down = [];
  Object.keys(v).forEach(function (u) {
    var m = S.st.members[u] || { id: u, name: 'Someone' };
    (v[u] === 1 ? up : v[u] === -1 ? down : []).push(m);
  });
  return { up: up, down: down, score: up.length - 2 * down.length, mine: v[me.id] || 0 };
}
function castVote(pid, val) {
  var p = S.st.places[pid]; if (!p) return;
  var cur = (S.st.votes[pid] || {})[me.id] || 0, next = cur === val ? 0 : val;
  emit('vote', { pid: pid, v: next, p: next ? p : undefined });
  return next;
}
function memberList() { return Object.keys(S.st.members).map(function (k) { return S.st.members[k]; }); }
function activeMembers() { return memberList().filter(function (m) { return Date.now() - m.lastSeen < 20 * 60000; }); }
function groupDiets() {
  var out = {};
  memberList().forEach(function (m) {
    var d = m.id === me.id ? me.diet : m.diet;
    (d || []).forEach(function (k) { (out[k] = out[k] || []).push(m.id === me.id ? 'you' : m.name); });
  });
  return out;
}
