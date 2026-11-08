/* Group Eats — map, swipe, deadline + spin, arrival status, booking, details, favorites/history, settings, updates. */
'use strict';

// ================================================================ sheets
function openSheet(html) { $('sheetBody').innerHTML = html; $('sheet').classList.remove('hidden'); $('sheetBody').scrollTop = 0; }
function closeSheet() { $('sheet').classList.add('hidden'); $('sheetBody').innerHTML = ''; if (window.__onSheetClose) { var f = window.__onSheetClose; window.__onSheetClose = null; f(); } }
function sheetHead(title) { return '<div class="sheethead"><h2>' + esc(title) + '</h2><button class="closebtn" data-close="1" aria-label="Close">' + ic('x') + '</button></div>'; }
$('sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet' || e.target.closest('[data-close]')) closeSheet(); });
document.addEventListener('click', function (e) {
  var o = e.target.closest('[data-open]'); if (!o) return;
  var w = o.getAttribute('data-open'); if (w === 'settings') openSettings(); else if (w === 'saved') openSaved();
});

// ================================================================ map
var MAP = null, mapLayer = null, tileTrouble = '', legendBase = '', baseLayer = null, baseProv = '';
function setBaseLayer() {
  if (!MAP) return;
  var prov = info().hasCarto ? 'carto' : 'osm';
  if (baseLayer && prov === baseProv) return;
  if (baseLayer) MAP.removeLayer(baseLayer);
  baseProv = prov;
  var tileUrl = info().web ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' : location.origin + '/tiles/' + prov + '/{z}/{x}/{y}.png';
  baseLayer = L.tileLayer(tileUrl, {
    maxZoom: 19, keepBuffer: 4,
    attribution: prov === 'carto' ? '© OpenStreetMap contributors © CARTO' : '© OpenStreetMap contributors'
  }).on('tileload', function () { if (tileTrouble) { tileTrouble = ''; setLegend(); } }).addTo(MAP);
}
window.__tileError = function (code, online) {
  tileTrouble = !online ? 'You’re offline, so only map areas you’ve already viewed can show. Pins still work.'
    : 'The map servers didn’t respond' + (code ? ' (HTTP ' + code + ')' : '') + '. Pins still work. Try again in a moment.';
  setLegend();
};
function setLegend() { var el = $('mapLegend'); if (el) { el.textContent = tileTrouble || legendBase; el.style.color = tileTrouble ? 'var(--tomato-d)' : ''; } }
function renderMap() {
  if (!S || tab !== 'map' || !window.L) return;
  if (!MAP) {
    MAP = L.map('map', { zoomControl: false, attributionControl: true }).setView([40.75, -73.98], 13);
    L.control.zoom({ position: 'topright' }).addTo(MAP);
    setBaseLayer();
    mapLayer = L.layerGroup().addTo(MAP);
    $('map').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mact]'); if (!b) return;
      var pid = b.getAttribute('data-pid'), a = b.getAttribute('data-mact');
      if (a === 'up') { castVote(pid, 1); renderAll(); MAP.closePopup(); toast('Vote counted'); }
      else if (a === 'details') openDetails(pid);
    });
  }
  setTimeout(function () { MAP.invalidateSize(); }, 50);
  setBaseLayer();
  mapLayer.clearLayers();
  var s = latestSearch(), items = s ? searchItems(s) : [], seen = {}, pts = [];
  rankedShortlist().forEach(function (x) { if (!items.some(function (p) { return p.id === x.pid; })) items.push(x.p); });
  items.forEach(function (p, i) {
    if (seen[p.id]) return; seen[p.id] = 1;
    var t = tally(p.id), cls = S.st.pick && S.st.pick.pid === p.id ? 'pick' : t.down.length ? 'veto' : t.up.length ? 'up' : '';
    var m = L.marker([p.la, p.lo], { icon: L.divIcon({ className: '', html: '<div class="pin ' + cls + '"><b>' + (cls === 'pick' ? '★' : t.up.length || (i + 1)) + '</b></div>', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -30] }), zIndexOffset: cls === 'pick' ? 1000 : t.up.length * 10 });
    var r = ratingOf(p);
    m.bindPopup('<div class="popup"><h4>' + esc(p.n) + '</h4><div class="hint" style="margin:0">' + esc([p.c, r ? stars(r.r) + '★' : '', p.op === true ? 'Open' : p.op === false ? 'Closed' : ''].filter(Boolean).join(', ')) + '</div>' +
      '<div class="hint" style="margin:2px 0 0">' + (t.up.length ? t.up.length + ' in' : 'No votes yet') + (t.down.length ? ', ' + t.down.length + ' veto' : '') + '</div>' +
      '<div class="row"><button class="go" data-mact="up" data-pid="' + esc(p.id) + '">👍 I’m in</button><button data-mact="details" data-pid="' + esc(p.id) + '">Details</button></div></div>');
    m.addTo(mapLayer); pts.push([p.la, p.lo]);
  });
  memberList().forEach(function (mb) {
    var loc = mb.id === me.id ? (myLoc ? myLoc : null) : mb.loc;
    if (!loc) return;
    L.marker([loc.lat, loc.lng], { icon: L.divIcon({ className: '', html: '<div class="mpin" style="background:' + colorFor(mb.id) + '">' + esc(initials(mb.name)) + '</div>', iconSize: [34, 34], iconAnchor: [17, 17] }), zIndexOffset: 2000 })
      .bindTooltip(mb.id === me.id ? 'You' : mb.name).addTo(mapLayer);
    pts.push([loc.lat, loc.lng]);
  });
  if (s && s.at) { L.marker([s.at.lat, s.at.lng], { icon: L.divIcon({ className: '', html: '<div class="cpin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false }).addTo(mapLayer); pts.push([s.at.lat, s.at.lng]); }
  if (pts.length) MAP.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
  legendBase = items.length ? 'Green pins have votes, grey are vetoed, the star is your pick. Numbers show votes or rank. Circles are people.' : 'Search on the Find tab to see places here.';
  setLegend();
}

// ================================================================ swipe mode
var deck = [], deckIdx = 0;
function openSwipe() {
  var s = latestSearch(); if (!s) return;
  deck = searchItems(s).filter(function (p) { return !tally(p.id).mine; });
  deckIdx = 0;
  $('swipe').classList.remove('hidden');
  drawDeck();
}
function closeSwipe() { $('swipe').classList.add('hidden'); $('swipe').innerHTML = ''; renderAll(); }
function swipeCardHtml(p, back) {
  var r = ratingOf(p), s = latestSearch();
  return '<div class="scard ' + (back ? 'back' : '') + '"><div class="simg">' + (p.im ? '<img alt="" src="' + esc(p.im) + '" onerror="this.remove()">' : '') + '<div class="fallback">' + emojiFor(p) + '</div></div>' +
    '<span class="stamp yes">IN</span><span class="stamp no">NOPE</span>' +
    '<div class="sbody"><h3>' + esc(p.n) + '</h3>' + scoresHtml(p) +
    '<div class="facts">' + [p.c ? '<b>' + esc(p.c) + '</b>' : '', p.pr ? '$'.repeat(p.pr) : '', p.op === true ? 'Open' : p.op === false ? 'Closed' : ''].filter(Boolean).map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' +
    '<div class="travel">' + travelLine(p, s) + '</div>' +
    (p.rv && p.rv[0] ? '<div class="quote">“' + esc(p.rv[0][1]) + '”</div>' : p.es ? '<div class="quote">' + esc(p.es) + '</div>' : '') + '</div></div>';
}
function drawDeck() {
  var el = $('swipe');
  if (deckIdx >= deck.length) {
    el.innerHTML = '<div class="swipetop"><b>Swipe</b><button data-sw="close" aria-label="Close">' + ic('x') + '</button></div><div class="swipedone"><div class="big">All caught up.</div><p>See where the table stands on the Decide tab.</p><button class="btn tomato block" data-sw="decide">See the votes</button></div>';
  } else {
    el.innerHTML = '<div class="swipetop"><b>' + (deckIdx + 1) + ' of ' + deck.length + '</b><button data-sw="close" aria-label="Close">' + ic('x') + '</button></div>' +
      '<div class="deck">' + (deck[deckIdx + 1] ? swipeCardHtml(deck[deckIdx + 1], true) : '') + swipeCardHtml(deck[deckIdx], false) + '</div>' +
      '<div class="swipebtns"><button class="sno" data-sw="no" aria-label="Veto">👎</button><button class="spass" data-sw="pass" aria-label="Skip">' + ic('x') + '</button><button class="syes" data-sw="yes" aria-label="I’m in">👍</button></div>';
    bindDrag(el.querySelectorAll('.scard')[el.querySelectorAll('.scard').length - 1]);
  }
}
function decideCard(kind, card) {
  var p = deck[deckIdx]; if (!p) return;
  if (kind === 'yes') castVote(p.id, 1); else if (kind === 'no') castVote(p.id, -1);
  if (card) {
    var x = kind === 'yes' ? 600 : kind === 'no' ? -600 : 0, y = kind === 'pass' ? 700 : 0;
    card.style.transition = 'transform .3s ease-in'; card.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + (x / 20) + 'deg)';
  }
  deckIdx++;
  setTimeout(drawDeck, card ? 260 : 0);
}
function bindDrag(card) {
  if (!card) return;
  var sx = 0, sy = 0, dx = 0, dy = 0, drag = false, yes = card.querySelector('.stamp.yes'), no = card.querySelector('.stamp.no');
  card.addEventListener('pointerdown', function (e) { drag = true; sx = e.clientX; sy = e.clientY; card.setPointerCapture(e.pointerId); card.style.transition = 'none'; });
  card.addEventListener('pointermove', function (e) {
    if (!drag) return; dx = e.clientX - sx; dy = e.clientY - sy;
    card.style.transform = 'translate(' + dx + 'px,' + dy * 0.3 + 'px) rotate(' + dx / 18 + 'deg)';
    yes.style.opacity = Math.max(0, Math.min(1, dx / 90)); no.style.opacity = Math.max(0, Math.min(1, -dx / 90));
  });
  function end() {
    if (!drag) return; drag = false;
    if (dx > 100) decideCard('yes', card); else if (dx < -100) decideCard('no', card);
    else { card.style.transition = 'transform .25s'; card.style.transform = ''; yes.style.opacity = 0; no.style.opacity = 0; }
    dx = dy = 0;
  }
  card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
}
$('swipe').addEventListener('click', function (e) {
  var b = e.target.closest('[data-sw]'); if (!b) return;
  var a = b.getAttribute('data-sw'), cards = $('swipe').querySelectorAll('.scard'), top = cards[cards.length - 1];
  if (a === 'close') closeSwipe(); else if (a === 'decide') { closeSwipe(); setTab('list'); } else decideCard(a, top);
});

// ================================================================ vote timer + spin
function startDeadline(min) {
  if (!rankedShortlist().length) { toast('Vote on a few places first, then start the timer.'); return; }
  emit('deadline', { at: Date.now() + min * 60000 });
}
var resolvedDid = {};
function renderDeadline() {
  var d = S && S.st.deadline, el = $('deadlineBanner');
  if (!d || S.st.pick && S.st.pick.ts > d.ts) { el.classList.add('hidden'); return; }
  var left = Math.max(0, d.at - Date.now()), m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
  var lead = rankedShortlist()[0];
  el.innerHTML = '<span class="count">' + m + ':' + String(s).padStart(2, '0') + '</span><span class="grow">' + (left ? 'Voting closes soon' : 'Voting closed. Tallying') + (lead && lead.t.score > 0 ? '. Leading: ' + esc(lead.p.n) : '') + '</span><button data-dl="off">Cancel</button>';
  el.classList.remove('hidden');
  if (!left && !resolvedDid[d.did] && (d.u === me.id || Date.now() > d.at + 20000)) { resolvedDid[d.did] = 1; resolveDeadline(d); }
}
function resolveDeadline(d) {
  var list = rankedShortlist().filter(function (x) { return x.t.score > 0; });
  if (!list.length) { emit('deadlineOff', { quiet: true }); emit('msg', { text: 'The vote timer ended with no clear favorite. Keep voting.' }); return; }
  var top = list[0].t.score, tied = list.filter(function (x) { return x.t.score === top; });
  var win = tied.slice().sort(function (a, b) { return hash(d.did + a.pid) - hash(d.did + b.pid); })[0];
  emit('pick', { pid: win.pid, p: win.p, auto: true, spin: tied.length > 1 ? tied.map(function (x) { return x.pid; }) : undefined });
}
function spinPick() {
  var list = rankedShortlist().filter(function (x) { return x.t.down.length === 0; }).slice(0, 6), ids;
  if (list.length >= 2) ids = list.map(function (x) { return x.pid; });
  else { var s = latestSearch(); ids = s ? searchItems(s).filter(function (p) { return !tally(p.id).down.length; }).slice(0, 6).map(function (p) { return p.id; }) : []; }
  if (ids.length < 2) { toast('Search or vote on at least two places to spin.'); return; }
  var a = new Uint32Array(1); crypto.getRandomValues(a);
  var pid = ids[a[0] % ids.length];
  emit('pick', { pid: pid, p: S.st.places[pid], spin: ids });
}
hooks.pick.push(function (ev, mine, live) {
  if (!(mine || live) || !ev.spin || ev.spin.length < 2) return;
  var names = ev.spin.map(function (id) { return (S.st.places[id] || {}).n || '?'; }), win = (ev.p || {}).n || '?';
  $('spinTitle').textContent = ev.auto ? 'It’s a tie. Spinning to break it' : (ev.u === me.id ? 'You' : ev.n) + ' spun the wheel';
  $('spinSub').textContent = ''; $('spinClose').classList.add('hidden'); $('spin').classList.remove('hidden');
  var steps = 22 + (hash(ev.id) % names.length), i = 0, el = $('spinName');
  (function tick() {
    el.classList.remove('land');
    el.textContent = i < steps ? names[i % names.length] : win;
    if (i++ < steps) setTimeout(tick, 50 + Math.pow(i / steps, 3) * 320);
    else { el.classList.add('land'); $('spinSub').textContent = 'Out of ' + names.length + ' options.'; $('spinClose').classList.remove('hidden'); }
  })();
});
$('spinClose').onclick = function () { $('spin').classList.add('hidden'); };

// ================================================================ arrival status
function onStatus(kind) {
  var p = S.st.pick && S.st.places[S.st.pick.pid]; if (!p) return;
  if (kind === 'book') return openBook(p);
  if (kind === 'here') return emit('status', { s: 'here' });
  if (kind === 'way') {
    toast('Working out your arrival time…');
    return refreshMyLoc(true).then(function (l) {
      var mode = S.st.filters.mode || 'walk', eta = estimateMin(dist(l, ll(p)), mode);
      emit('status', { s: 'way', eta: eta, mode: mode });
    }).catch(function () { emit('status', { s: 'way' }); });
  }
  if (kind === 'wait') {
    openSheet(sheetHead('How long is the wait?') + '<p class="muted">Everyone at the table sees this right away.</p><div class="row">' +
      [0, 10, 20, 30, 45, 60].map(function (w) { return '<button class="btn soft" data-wait="' + w + '">' + (w ? (w === 60 ? '60+ min' : w + ' min') : 'No wait') + '</button>'; }).join('') + '</div>');
    $('sheetBody').querySelectorAll('[data-wait]').forEach(function (b) { b.onclick = function () { emit('status', { s: 'here', wait: +b.getAttribute('data-wait') }); closeSheet(); }; });
  }
}
// keep "on the way" arrival times fresh while the app is open
setInterval(function () {
  if (!S || !S.st.pick) return;
  var mine = S.st.members[me.id], st = mine && mine.status;
  if (!st || st.s !== 'way' || st.ts < S.st.pick.ts || Date.now() - st.ts < 3 * 60000) return;
  var p = S.st.places[S.st.pick.pid];
  refreshMyLoc(true).then(function (l) {
    var eta = estimateMin(dist(l, ll(p)), st.mode || 'walk');
    if (dist(l, ll(p)) < 60) emit('status', { s: 'here' });
    else if (Math.abs(eta - (st.eta || 0)) >= 2) emit('status', { s: 'way', eta: eta, mode: st.mode });
  }).catch(function () {});
}, 60000);

// ================================================================ booking
function bookWhen() {
  var f = S ? S.st.filters : defaultFilters(), d;
  if (f.when.mode === 'at' && f.when.date && f.when.time) d = new Date(f.when.date + 'T' + f.when.time);
  else { d = new Date(Date.now() + 30 * 60000); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); }
  var date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  var time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  return { d: d, date: date, time: time, party: parseInt(f.party, 10) || 4 };
}
function openBook(p) {
  var w = bookWhen(), nice = w.d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' at ' + w.d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  var alias = p.y && p.y[2] && (p.y[2].match(/\/biz\/([^/?#]+)/) || [])[1];
  var links = [
    ['OpenTable', 'Search tables for ' + w.party + ', ' + nice, 'https://www.opentable.com/s?covers=' + w.party + '&dateTime=' + enc(w.date + 'T' + w.time) + '&term=' + enc(p.n) + '&latitude=' + p.la + '&longitude=' + p.lo],
    alias ? ['Yelp Reservations', 'Party of ' + w.party + ', ' + nice, 'https://www.yelp.com/reservations/' + alias + '?covers=' + w.party + '&date=' + w.date + '&time=' + w.time.replace(':', '')] : null,
    ['Resy', 'Find this restaurant on Resy', 'https://www.google.com/search?q=' + enc('resy ' + p.n + ' ' + (p.a || ''))],
    ['Google Maps', 'Shows “Reserve a table” when the restaurant offers it', mapsUrl(p)],
    p.ph ? ['Call ' + p.ph, 'Talk to the restaurant directly', tel(p)] : null
  ].filter(Boolean);
  openSheet(sheetHead('Book ' + p.n) + '<p class="muted">Opens with your party size and time filled in where the site supports it. Change them in the filters under “When, distance and sorting”.</p>' +
    '<div class="booklist">' + links.map(function (l) { return '<a href="' + esc(l[2]) + '">' + ic(l[0].indexOf('Call') === 0 ? 'phone' : 'cal') + '<span>' + esc(l[0]) + '<small>' + esc(l[1]) + '</small></span></a>'; }).join('') + '</div>');
}

// ================================================================ details
function openDetails(pid) {
  var p = S.st.places[pid]; if (!p) return;
  var s = latestSearch(), t = tally(pid);
  var reviews = (p.rv || []).map(function (r) { return '<div class="review"><div class="rh"><b>' + r[0] + '★ on Google</b><span>' + esc(r[2]) + (r[3] ? ', ' + esc(r[3]) : '') + '</span></div>' + esc(r[1]) + (r[1].length >= 170 ? '…' : '') + '</div>'; }).join('');
  openSheet('<div class="detailph">' + (p.im ? '<img alt="" src="' + esc(p.im) + '">' : '<div class="ph" style="height:100%"><div class="fallback">' + emojiFor(p) + '</div></div>') + '</div>' +
    sheetHead(p.n) +
    '<div class="facts">' + [p.c ? '<b>' + esc(p.c) + '</b>' : '', p.pr ? '<span>' + '$'.repeat(p.pr) + '</span>' : '', p.a ? '<span>' + esc(p.a) + '</span>' : ''].join('') + '</div>' +
    scoresHtml(p) +
    '<div class="travel">' + travelLine(p, s) + '</div>' +
    (p.op != null || p.ht ? '<p class="muted">' + (p.op === true ? 'Open' : p.op === false ? 'Closed' : 'Hours') + (p.ht ? ': ' + esc(p.ht) : '') + '</p>' : '') +
    (p.es ? '<p>' + esc(p.es) + '</p>' : '') +
    ((p.tg || []).length ? '<div class="tags">' + p.tg.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>' : '') +
    reviews +
    '<p class="muted">' + (t.up.length ? esc(t.up.map(function (m) { return m.id === me.id ? 'You' : m.name; }).join(', ')) + ' ' + (t.up.length === 1 && t.up[0].id !== me.id ? 'is' : 'are') + ' in.' : 'No votes yet.') + (t.down.length ? ' Vetoed by ' + esc(t.down.map(function (m) { return m.name; }).join(', ')) + '.' : '') + '</p>' +
    '<div class="linkgrid">' +
      '<a href="' + esc(dirUrl(p)) + '">' + ic('route') + 'Directions</a><button data-d="book">' + ic('cal') + 'Book a table</button>' +
      '<a href="' + esc(menuUrl(p)) + '">' + ic('book') + 'Menu</a>' + (p.w ? '<a href="' + esc(p.w) + '">' + ic('globe') + 'Website</a>' : '<a href="' + esc(mapsUrl(p)) + '">' + ic('pin') + 'Google Maps</a>') +
      '<a href="' + esc(yelpUrl(p)) + '">' + ic('star') + 'Yelp</a>' + (p.ph ? '<a href="' + esc(tel(p)) + '">' + ic('phone') + 'Call</a>' : '<button data-d="share">' + ic('share') + 'Share</button>') +
      '<button data-d="fav">' + ic('star') + (isFav(pid) ? 'Saved' : 'Save to favorites') + '</button><button data-d="pick">' + ic('vote') + (S.st.pick && S.st.pick.pid === pid ? 'Our pick ✓' : 'Make our pick') + '</button>' +
    '</div>');
  $('sheetBody').querySelectorAll('[data-d]').forEach(function (b) {
    b.onclick = function () {
      var a = b.getAttribute('data-d');
      if (a === 'book') openBook(p);
      else if (a === 'share') A.share(p.n, p.n + '\n' + (p.a || '') + '\n' + mapsUrl(p));
      else if (a === 'fav') { toggleFav(p); openDetails(pid); renderAll(); }
      else if (a === 'pick') { if (S.st.pick && S.st.pick.pid === pid) emit('unpick', {}); else emit('pick', { pid: pid, p: p }); closeSheet(); setTab('list'); }
    };
  });
}

// ================================================================ favorites, history, ratings
var favs = lsGet('ge:favs', {}), hist = lsGet('ge:hist', []);
function isFav(pid) { return !!favs[pid]; }
function toggleFav(p) {
  if (favs[p.id]) { delete favs[p.id]; toast('Removed from favorites'); }
  else { favs[p.id] = Object.assign({}, p, { savedAt: Date.now() }); toast('Saved to favorites'); }
  lsSet('ge:favs', favs);
}
function historyFor(pid) { for (var i = hist.length - 1; i >= 0; i--) if (hist[i].p.id === pid) return hist[i]; return null; }
hooks.pick.push(function (ev) {
  if (!ev.p || !S) return;
  hist = hist.filter(function (h) { return !(h.code === S.code && h.ts > ev.ts - 6 * 3600000 && !h.rating); });
  hist.push({ id: rnd(6), p: ev.p, ts: ev.ts, title: S.st.title, code: S.code });
  hist = hist.slice(-60); lsSet('ge:hist', hist);
});
function maybeAskRating() {
  var h = hist.filter(function (x) { return !x.rating && !x.skip && Date.now() - x.ts > 90 * 60000 && Date.now() - x.ts < 4 * 86400000; }).pop();
  if (!h || !$('sheet').classList.contains('hidden')) return;
  var r = 0;
  openSheet(sheetHead('How was ' + h.p.n + '?') + '<p class="muted">' + esc(h.title || 'Your table') + ', ' + new Date(h.ts).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) + '. Your rating stays in your history' + (S && S.code === h.code ? ' and is shared with the table.' : '.') + '</p>' +
    '<div class="stars">' + [1, 2, 3, 4, 5].map(function (n) { return '<button data-r="' + n + '" aria-label="' + n + ' stars">' + ic('star') + '</button>'; }).join('') + '</div>' +
    '<input class="input" id="rateNote" maxlength="140" placeholder="Anything to remember? (optional)"><div class="row" style="margin-top:12px"><button class="btn tomato" id="rateSave">Save rating</button><button class="btn soft" id="rateSkip">Not now</button></div>');
  $('sheetBody').querySelectorAll('[data-r]').forEach(function (b) {
    b.onclick = function () { r = +b.getAttribute('data-r'); $('sheetBody').querySelectorAll('[data-r]').forEach(function (x) { x.classList.toggle('on', +x.getAttribute('data-r') <= r); }); };
  });
  $('rateSave').onclick = function () {
    if (!r) { toast('Tap the stars to rate it.'); return; }
    h.rating = r; h.note = $('rateNote').value.trim(); lsSet('ge:hist', hist);
    if (S && S.code === h.code) emit('rating', { pid: h.p.id, r: r, note: h.note });
    closeSheet(); toast('Saved to your history');
  };
  $('rateSkip').onclick = function () { h.skip = true; lsSet('ge:hist', hist); closeSheet(); };
}
function openSaved(which) {
  which = which || 'fav';
  var list = which === 'fav' ? Object.keys(favs).map(function (k) { return favs[k]; }).sort(function (a, b) { return b.savedAt - a.savedAt; }) : hist.slice().reverse();
  var body = list.length ? list.map(function (x) {
    var p = which === 'fav' ? x : x.p;
    var sub = which === 'fav' ? [p.c, p.a].filter(Boolean).join(', ') : (x.title || 'Table') + ', ' + new Date(x.ts).toLocaleDateString([], { month: 'short', day: 'numeric' }) + (x.rating ? '. You gave it ' + x.rating + ' out of 5' : '') + (x.note ? ': “' + x.note + '”' : '');
    return '<div class="saveditem" data-sid="' + esc(which === 'fav' ? p.id : x.id) + '"><span class="av" style="background:' + colorFor(p.id) + ';box-shadow:none;width:40px;height:40px;font-size:18px">' + emojiFor(p) + '</span><div class="grow"><b>' + esc(p.n) + '</b><small>' + esc(sub) + '</small></div>' +
      (S ? '<button class="btn soft small" data-sv="add">Suggest</button>' : '') + '<a class="btn soft small" href="' + esc(dirUrl(p, 'walk')) + '">Go</a>' + (which === 'fav' ? '<button class="btn soft small" data-sv="rm" aria-label="Remove">' + ic('x') + '</button>' : '') + '</div>';
  }).join('') : '<div class="empty"><div class="big">' + (which === 'fav' ? 'No favorites yet.' : 'No history yet.') + '</div>' + (which === 'fav' ? 'Tap the star on any place to save it here.' : 'Places your tables pick show up here, and you can rate them afterwards.') + '</div>';
  openSheet(sheetHead('Saved places') + '<div class="tabsel"><button class="' + (which === 'fav' ? 'active' : '') + '" data-tabsel="fav">Favorites</button><button class="' + (which === 'hist' ? 'active' : '') + '" data-tabsel="hist">History</button></div>' + body);
  $('sheetBody').querySelectorAll('[data-tabsel]').forEach(function (b) { b.onclick = function () { openSaved(b.getAttribute('data-tabsel')); }; });
  $('sheetBody').querySelectorAll('[data-sv]').forEach(function (b) {
    b.onclick = function () {
      var sid = b.closest('[data-sid]').getAttribute('data-sid'), a = b.getAttribute('data-sv');
      var p = which === 'fav' ? favs[sid] : (hist.filter(function (h) { return h.id === sid; })[0] || {}).p;
      if (!p) return;
      if (a === 'rm') { delete favs[sid]; lsSet('ge:favs', favs); openSaved('fav'); }
      else if (a === 'add' && S) { var c = Object.assign({}, p); delete c.savedAt; S.st.places[c.id] = c; if (!tally(c.id).mine) castVote(c.id, 1); toast('Added to the table’s shortlist'); closeSheet(); setTab('list'); }
    };
  });
}

// ================================================================ settings
function openSettings() {
  var i = info(), ai = lsGet('ge:ai', {});
  if (i.web) return openWebSettings();
  openSheet(sheetHead('Settings') +
    '<label class="field"><span>Your name</span><input id="stName" maxlength="24" value="' + esc(me.name) + '"></label>' +
    '<div class="field"><span>Your dietary needs (searches respect everyone’s)</span><div class="checks">' + DIETS.map(function (d) { return '<label><input type="checkbox" data-diet="' + d[0] + '"' + (me.diet.indexOf(d[0]) >= 0 ? ' checked' : '') + '>' + d[1] + '</label>'; }).join('') + '</div></div>' +
    '<label class="field"><span>Google Places API key ' + (i.hasGoogle ? '<span class="keyok">saved</span>' : '') + '</span><input id="stG" type="password" autocomplete="off" placeholder="' + (i.hasGoogle ? 'Saved. Type to replace.' : 'AIza…') + '"></label>' +
    '<p class="hint">Live Google ratings, reviews, photos, prices, hours, brunch menus, outdoor seating, groups and reservations. Enable “Places API (New)”, plus “Routes API” for real travel times, in Google Cloud. Google bills per request.</p>' +
    '<label class="field"><span>Yelp API key ' + (i.hasYelp ? '<span class="keyok">saved</span>' : '') + '</span><input id="stY" type="password" autocomplete="off" placeholder="' + (i.hasYelp ? 'Saved. Type to replace.' : 'From the Yelp developer portal') + '"></label>' +
    '<p class="hint">Adds Yelp stars and review counts. Yelp offers a 30-day free trial (5,000 calls); a search uses about 1 to 9.</p>' +
    '<p class="hint">Only one person at the table needs keys. Searches by others run on that person’s phone while their app is open, and keys never leave it.</p>' +
    '<label class="field"><span>CARTO map key (optional) ' + (i.hasCarto ? '<span class="keyok">saved</span>' : '') + '</span><input id="stC" type="password" autocomplete="off" placeholder="' + (i.hasCarto ? 'Saved. Type to replace.' : 'Free from carto.com/basemaps/apikey') + '"></label>' +
    '<p class="hint">Maps use free OpenStreetMap tiles. Add a free CARTO key for CARTO’s cleaner “Voyager” map style instead.</p>' +
    '<label class="field"><span>App download link (added to invites)</span><input id="stLink" type="url" placeholder="Google Drive or Dropbox link to the APK" value="' + esc(prefs.appLink || '') + '"></label>' +
    '<label class="field"><span>Web app link (for iPhone and anyone without the app)</span><input id="stWeb" type="url" placeholder="https://you.github.io/group-eats/" value="' + esc(prefs.webLink || '') + '"></label>' +
    '<label class="field"><span>Get updates from</span><input id="stUpd" placeholder="GitHub owner/repo or a link to update.json" value="' + esc(prefs.updateSrc || '') + '"></label>' +
    '<p class="hint">' + (prefs.updAdopted ? 'Shared by ' + esc(prefs.updAdopted) + '. ' : '') + 'Friends at your tables pick this up automatically, so everyone gets prompted when there’s a new version.</p>' +
    '<div class="row" style="margin-top:12px"><button class="btn tomato" id="stSave">Save settings</button><button class="btn soft" id="stCheck">Check for update</button></div>' +
    '<div class="row" style="margin-top:8px">' + (i.hasGoogle ? '<button class="btn soft small" id="stDelG">Remove Google key</button>' : '') + (i.hasYelp ? '<button class="btn soft small" id="stDelY">Remove Yelp key</button>' : '') + (i.hasCarto ? '<button class="btn soft small" id="stDelC">Remove CARTO key</button>' : '') + '<button class="btn soft small" id="stAI">AI helper' + (ai.model ? ': ' + esc(ai.label || '') : '') + '</button></div>' +
    '<p class="hint" style="margin-top:16px">Group Eats ' + esc(i.version || '') + '. Sync by ntfy.sh. Maps © OpenStreetMap contributors. Ratings and photos © Google and Yelp.</p>');
  $('stSave').onclick = function () {
    var n = $('stName').value.trim(); if (n) me.name = n;
    me.diet = [].map.call($('sheetBody').querySelectorAll('[data-diet]:checked'), function (x) { return x.getAttribute('data-diet'); });
    saveMe();
    var g = $('stG').value.trim(), y = $('stY').value.trim();
    if (g) A.setKey('google', g); if (y) A.setKey('yelp', y);
    var ck = $('stC').value.trim(); if (ck) A.setKey('carto', ck);
    var link = $('stLink').value.trim(), upd = $('stUpd').value.trim(), wl = $('stWeb').value.trim();
    if (link && !/^https:\/\//.test(link)) { toast('The download link must start with https://'); return; }
    if (wl && !/^https:\/\//.test(wl)) { toast('The web app link must start with https://'); return; }
    prefs.webLink = wl;
    prefs.appLink = link; if (upd !== prefs.updateSrc) { prefs.updateSrc = upd; delete prefs.updAdopted; }
    lsSet('ge:prefs', prefs);
    closeSheet(); toast('Settings saved');
    if (S) { emit('hello', caps()); renderAll(); } else renderStart();
    if (upd) checkUpdate(true);
  };
  $('stCheck').onclick = function () { checkUpdate(true); };
  $('stAI').onclick = function () { closeSheet(); openAI(); };
  if ($('stDelG')) $('stDelG').onclick = function () { A.setKey('google', ''); if (S) emit('hello', caps()); openSettings(); };
  if ($('stDelC')) $('stDelC').onclick = function () { A.setKey('carto', ''); openSettings(); };
  if ($('stDelY')) $('stDelY').onclick = function () { A.setKey('yelp', ''); if (S) emit('hello', caps()); openSettings(); };
}

function openWebSettings() {
  openSheet(sheetHead('Settings') +
    '<label class="field"><span>Your name</span><input id="stName" maxlength="24" value="' + esc(me.name) + '"></label>' +
    '<div class="field"><span>Your dietary needs (searches respect everyone’s)</span><div class="checks">' + DIETS.map(function (d) { return '<label><input type="checkbox" data-diet="' + d[0] + '"' + (me.diet.indexOf(d[0]) >= 0 ? ' checked' : '') + '>' + d[1] + '</label>'; }).join('') + '</div></div>' +
    '<p class="hint">Live Google and Yelp scores come from a friend’s Android app with API keys: when you search, it runs on their phone and the results come back to the table. Without one, searches use OpenStreetMap.</p>' +
    '<label class="field"><span>Android app download link (added to invites)</span><input id="stLink" type="url" placeholder="Optional" value="' + esc(prefs.appLink || '') + '"></label>' +
    '<div class="row" style="margin-top:12px"><button class="btn tomato" id="stSave">Save settings</button><button class="btn soft" id="stAI">AI helper</button></div>' +
    '<p class="hint" style="margin-top:16px">Group Eats web ' + esc(info().version || '') + '. Sync by ntfy.sh. Maps © OpenStreetMap contributors.</p>');
  $('stSave').onclick = function () {
    var n = $('stName').value.trim(); if (n) me.name = n;
    me.diet = [].map.call($('sheetBody').querySelectorAll('[data-diet]:checked'), function (x) { return x.getAttribute('data-diet'); });
    saveMe();
    var link = $('stLink').value.trim();
    if (link && !/^https:\/\//.test(link)) { toast('The download link must start with https://'); return; }
    prefs.appLink = link; lsSet('ge:prefs', prefs);
    closeSheet(); toast('Settings saved');
    if (S) { emit('hello', caps()); renderAll(); } else renderStart();
  };
  $('stAI').onclick = function () { closeSheet(); openAI(); };
}

// ================================================================ invite
function inviteText() {
  var link = prefs.appLink, web = tableLink();
  return 'Join “' + (S.st.title || 'our table') + '” on Group Eats. We’re picking a place to eat together.\n\n' +
    (web ? 'Open on any phone, iPhone included: ' + web + '\n' : '') +
    (link ? 'Android app: ' + link + '\n' : '') +
    'Table code: ' + fmtCode(S.code) + (info().web ? '' : '\nApp link: groupeats://join/' + S.code);
}
function openInvite() {
  openSheet(sheetHead('Invite friends') + '<p class="muted">Everyone who joins sees the same filters, results, votes and chat, live.</p>' +
    '<div class="tile" style="text-align:center;background:var(--ink);color:#fff"><div class="hint" style="color:#C9D2E6;margin:0">Table code</div><div style="font:800 44px/1.1 var(--display);letter-spacing:.06em;font-stretch:85%">' + fmtCode(S.code) + '</div></div>' +
    (prefs.appLink ? '' : '<p class="hint">Tip: put the APK on Google Drive and add the link in Settings. It’s then included in every invite.</p>') +
    '<button class="btn tomato block big" id="ivShare">' + ic('share') + 'Share invite</button><button class="btn soft block" id="ivCopy">Copy invite text</button>');
  $('ivShare').onclick = function () { A.share('Join my Group Eats table', inviteText()); };
  $('ivCopy').onclick = function () { A.copy(inviteText()); };
}

// ================================================================ app updates
function cmpVer(a, b) {
  a = String(a).replace(/^v/i, '').split('.').map(Number); b = String(b).replace(/^v/i, '').split('.').map(Number);
  for (var i = 0; i < Math.max(a.length, b.length); i++) { var x = a[i] || 0, y = b[i] || 0; if (x !== y) return x > y ? 1 : -1; }
  return 0;
}
function checkUpdate(manual) {
  if (info().web) return;
  var src = (prefs.updateSrc || '').trim();
  if (!src) { if (manual) toast('Add where to get updates from first.'); return; }
  var last = lsGet('ge:updCheck', 0);
  if (!manual && Date.now() - last < 6 * 3600000) { showUpdate(lsGet('ge:updFound', null)); return; }
  lsSet('ge:updCheck', Date.now());
  var cur = info(), p;
  if (/^[\w.-]+\/[\w.-]+$/.test(src)) {
    p = reqJSON('GET', 'https://api.github.com/repos/' + src + '/releases/latest', { 'Accept': 'application/vnd.github+json' }).then(function (j) {
      var apk = (j.assets || []).filter(function (a) { return /\.apk$/i.test(a.name); })[0];
      return { ver: j.tag_name || j.name, url: apk ? apk.browser_download_url : j.html_url, notes: (j.body || '').slice(0, 300) };
    });
  } else if (/^https:\/\//.test(src)) {
    p = reqJSON('GET', src, { 'Accept': 'application/json' }).then(function (j) { return { ver: j.versionName || j.version, code: j.versionCode, url: j.apkUrl || j.url, notes: j.notes || '' }; });
  } else { if (manual) toast('Use a GitHub “owner/repo” or an https link.'); return; }
  p.then(function (u) {
    var newer = u.code ? u.code > (cur.versionCode || 0) : cmpVer(u.ver, cur.version) > 0;
    if (newer && u.url) { lsSet('ge:updFound', u); showUpdate(u); }
    else { lsSet('ge:updFound', null); showUpdate(null); if (manual) toast('You’re on the latest version (' + cur.version + ').'); }
  }).catch(function (e) { if (manual) toast('Update check failed: ' + e.message); });
}
function showUpdate(u) {
  var b = $('updBanner');
  if (!u || cmpVer(u.ver, info().version) <= 0 && !(u.code > (info().versionCode || 0)) || lsGet('ge:updSnooze', '') === u.ver) { b.classList.add('hidden'); $('startUpd').innerHTML = ''; return; }
  var html = '<div class="grow"><b>Version ' + esc(String(u.ver).replace(/^v/i, '')) + ' is ready.</b> Download it, then tap to install over this one.</div><button class="btn tomato small" data-upd="go">Get it</button><button class="btn soft small" data-upd="later">Later</button>';
  b.innerHTML = html; b.classList.remove('hidden');
  b.onclick = function (e) {
    var a = e.target.closest('[data-upd]'); if (!a) return;
    if (a.getAttribute('data-upd') === 'go') A.openUrl(u.url); else { lsSet('ge:updSnooze', u.ver); b.classList.add('hidden'); }
  };
}
