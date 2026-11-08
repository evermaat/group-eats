/* Group Eats — rendering and interaction for the main screens. */
'use strict';

var tab = 'find';
function showScreen(name) { $('start').classList.toggle('hidden', name !== 'start'); $('session').classList.toggle('hidden', name !== 'session'); }
function setTab(t) {
  tab = t;
  ['find', 'map', 'list', 'group'].forEach(function (k) { $('tab-' + k).classList.toggle('hidden', k !== t); });
  document.querySelectorAll('.dock button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === t); });
  if (S && t === 'group') S.unseen = 0;
  renderBadges();
  window.scrollTo(0, 0);
  if (t === 'map') setTimeout(renderMap, 30);
}
function renderAll() {
  if (!S) return;
  renderHeader();
  if (S.filtersDirty) { S.filtersDirty = false; renderFilters('remote'); } else renderFilters(false);
  renderResults(); renderShortlist(); renderMembers(); renderFeed(); renderPick(); renderDeadline(); renderBadges();
  if (tab === 'map') renderMap();
}
function setSearching(on, msg) {
  if (S) S.searching = on ? msg : '';
  var b = $('searchBtn');
  b.disabled = !!on;
  b.innerHTML = on ? '<span class="spinner"></span>Searching' : 'Search with the group';
  $('searchNote').textContent = on ? msg : 'Everyone sees your filters and results as you go.';
}
function scrollToResults() { setTimeout(function () { var el = $('results'); if (el && el.firstChild) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80); }

// ================================================================ header + table strip
function renderHeader() {
  if (!S) return;
  $('sTitle').textContent = S.st.title || 'Our table';
  var n = memberList().length, on = activeMembers().length;
  $('sSub').textContent = (syncStatus === 'live' ? 'Live' : syncStatus === 'offline' ? 'Offline' : 'Connecting') + ', ' + n + (n === 1 ? ' person' : ' people') + (on > 1 ? ', ' + on + ' active' : '');
  $('syncDot').className = 'sync ' + (syncStatus === 'live' ? 'live' : syncStatus === 'offline' ? 'off' : '');
  var ms = memberList().sort(function (a, b) { return (b.id === me.id) - (a.id === me.id) || b.lastSeen - a.lastSeen; });
  $('tableStrip').innerHTML = ms.map(function (m) {
    var s = m.status && S.st.pick && m.status.ts > S.st.pick.ts ? m.status.s : '', cls = s === 'here' ? 'here' : s === 'way' ? 'way' : Date.now() - m.lastSeen < 20 * 60000 ? 'on' : '';
    var badge = s === 'here' ? '📍' : s === 'way' ? '🚶' : (m.caps && (m.caps.g || m.caps.y)) ? '🔑' : '';
    return '<div class="seat">' + avatar(m, cls).replace('</span>', (badge ? '<span class="st">' + badge + '</span>' : '') + '</span>') + '<span class="nm">' + esc(m.id === me.id ? 'You' : m.name) + '</span></div>';
  }).join('') + '<div class="seat" data-invite="1"><span class="av" style="background:rgba(255,255,255,.12)">＋</span><span class="nm">Invite</span></div>';
}

// ================================================================ filters (shared)
var filterTimer = null;
function pushFilters(now) {
  clearTimeout(filterTimer);
  var go = function () { if (S && S.localFiltersDirty) { S.localFiltersDirty = false; emit('filters', { f: S.st.filters }); } };
  if (now) go(); else filterTimer = setTimeout(go, 1500);
}
function setFilter(mut) {
  mut(S.st.filters);
  S.st.filtersTs = Date.now(); S.st.filtersBy = 'you'; S.localFiltersDirty = true;
  pushFilters(false); renderFilters(true);
}
var FILTER_CHIPS = [['open', 'Open now'], ['r4', '4.0★ and up'], ['r45', '4.5★ and up'], ['p2', '$ to $$'], ['p3', 'Up to $$$'],
  ['brunchMenu', 'Brunch menu'], ['outdoor', 'Outdoor seating'], ['groups', 'Good for groups'], ['reserve', 'Takes reservations'], ['diet', 'Respect diets']];
function chipOn(f, k) { return k === 'r4' ? f.minRating === 4 : k === 'r45' ? f.minRating === 4.5 : k === 'p2' ? f.priceMax === 2 : k === 'p3' ? f.priceMax === 3 : !!f[k]; }
function toggleChip(k) {
  setFilter(function (f) {
    if (k === 'r4') f.minRating = f.minRating === 4 ? 0 : 4;
    else if (k === 'r45') f.minRating = f.minRating === 4.5 ? 0 : 4.5;
    else if (k === 'p2') f.priceMax = f.priceMax === 2 ? 0 : 2;
    else if (k === 'p3') f.priceMax = f.priceMax === 3 ? 0 : 3;
    else f[k] = !f[k];
  });
}
function renderFilters(force) {
  if (!S) return;
  var f = S.st.filters, act = document.activeElement;
  document.querySelectorAll('#whereSeg button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-where') === f.where.mode); });
  $('placeRow').classList.toggle('hidden', f.where.mode !== 'place');
  if (act !== $('placeInput')) $('placeInput').value = f.where.label || '';
  if (act !== $('whatInput')) $('whatInput').value = f.text || '';
  $('whatChips').innerHTML = WHAT.map(function (w) { return '<button type="button" class="chip ' + (!f.text && f.what === w[0] ? 'pick' : '') + '" data-what="' + w[0] + '">' + w[1] + ' ' + w[0] + '</button>'; }).join('');
  var gd = groupDiets(), dk = Object.keys(gd);
  $('filterChips').innerHTML = FILTER_CHIPS.filter(function (c) { return c[0] !== 'diet' || dk.length; }).map(function (c) {
    var lbl = c[0] === 'open' ? (f.when.mode === 'at' ? 'Open at that time' : 'Open now') : c[1];
    return '<button type="button" class="chip ' + (chipOn(f, c[0]) ? 'on' : '') + '" data-chip="' + c[0] + '">' + lbl + '</button>';
  }).join('');
  $('dietLine').textContent = dk.length ? (f.diet ? 'Searching with ' : 'Not filtering for ') + dk.map(function (k) { return dietLabel(k).toLowerCase() + ' (' + gd[k].join(', ') + ')'; }).join(', ') : '';
  $('dietLine').classList.toggle('hidden', !dk.length);
  $('whenSel').value = f.when.mode; $('whenRow').classList.toggle('hidden', f.when.mode !== 'at');
  if (act !== $('whenDate')) $('whenDate').value = f.when.date || '';
  if (act !== $('whenTime')) $('whenTime').value = f.when.time || '';
  $('radiusSel').value = String(f.radius); $('sortSel').value = f.sort; $('partySel').value = f.party; $('modeSel').value = f.mode || 'walk';
  var rs = $('radiusSel'); var rl = rs.options[rs.selectedIndex] ? rs.options[rs.selectedIndex].text : '';
  $('moreSummary').textContent = [f.when.mode === 'at' ? niceWhen(f.when) : 'Now', rl, $('sortSel').options[$('sortSel').selectedIndex].text, 'party of ' + f.party].join(', ');
  renderWhere();
}
function renderWhere() {
  if (!S) return;
  var f = S.st.filters, t = '';
  if (f.where.mode === 'me') t = myLoc ? 'Near ' + (myLoc.label || 'your location') + (myLoc.acc > 0 ? ', accurate to ' + Math.round(myLoc.acc) + ' m' : '') : 'Uses your phone’s location when you search.';
  else if (f.where.mode === 'group') { var c = groupCenter(); t = c && c.n > 1 ? 'Halfway between ' + c.n + ' people' : 'Ask everyone to share their location on the Table tab.'; }
  else t = f.where.label ? '' : 'Any city, neighborhood or address in the world.';
  if (S.st.filtersBy && S.st.filtersBy !== 'you') t += (t ? ' ' : '') + '(Filters last changed by ' + S.st.filtersBy + ', ' + ago(S.st.filtersTs) + '.)';
  $('whereLabel').textContent = t;
}
function wireFilters() {
  $('whereSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var m = b.getAttribute('data-where');
    setFilter(function (f) { f.where = { mode: m, label: m === 'place' ? f.where.label : '' }; });
    if (m === 'me') refreshMyLoc(false).catch(function (er) { toast(er.message); });
    if (m === 'place') setTimeout(function () { $('placeInput').focus(); }, 50);
  });
  $('placeInput').addEventListener('input', function () { var v = this.value; setFilter(function (f) { f.where.label = v; }); });
  $('placeInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { this.blur(); startSearch(); } });
  $('whatChips').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var w = b.getAttribute('data-what'); setFilter(function (f) { f.what = w; f.text = ''; }); });
  $('whatInput').addEventListener('input', function () { var v = this.value; setFilter(function (f) { f.text = v; }); });
  $('whatInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { this.blur(); startSearch(); } });
  $('filterChips').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) toggleChip(b.getAttribute('data-chip')); });
  $('whenSel').addEventListener('change', function () {
    var v = this.value;
    setFilter(function (f) {
      f.when.mode = v;
      if (v === 'at' && !f.when.date) {
        var d = new Date(Date.now() + 3600000); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
        f.when.date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        f.when.time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      }
    });
  });
  $('whenDate').addEventListener('change', function () { var v = this.value; setFilter(function (f) { f.when.date = v; }); });
  $('whenTime').addEventListener('change', function () { var v = this.value; setFilter(function (f) { f.when.time = v; }); });
  $('radiusSel').addEventListener('change', function () { var v = +this.value; setFilter(function (f) { f.radius = v; }); });
  $('sortSel').addEventListener('change', function () {
    var v = this.value; setFilter(function (f) { f.sort = v; });
    if (v === 'fair' && originPoints().length < 2) toast('Fairest works best when everyone shares their location on the Table tab.');
  });
  $('modeSel').addEventListener('change', function () { var v = this.value; setFilter(function (f) { f.mode = v; }); });
  $('partySel').addEventListener('change', function () { var v = this.value; setFilter(function (f) { f.party = v; }); });
  $('searchBtn').addEventListener('click', startSearch);
}

// ================================================================ place cards
function mapsUrl(p) { return p.u || 'https://www.google.com/maps/search/?api=1&query=' + enc(p.n + ' ' + (p.a || '')) + (p.id.indexOf('g:') === 0 ? '&query_place_id=' + enc(p.id.slice(2)) : ''); }
function dirUrl(p, mode) { var m = { walk: 'walking', transit: 'transit', drive: 'driving' }[mode || (S && S.st.filters.mode) || 'walk']; return 'https://www.google.com/maps/dir/?api=1&destination=' + p.la + ',' + p.lo + (p.id.indexOf('g:') === 0 ? '&destination_place_id=' + enc(p.id.slice(2)) : '') + '&travelmode=' + m; }
function yelpUrl(p) { return p.y && p.y[2] ? p.y[2] : 'https://www.yelp.com/search?find_desc=' + enc(p.n) + '&find_loc=' + enc(p.a || (p.la + ',' + p.lo)); }
function menuUrl(p) { return p.w || 'https://www.google.com/search?q=' + enc(p.n + ' ' + (p.a || '') + ' menu'); }
function stars(r) { return r == null ? '' : (Math.round(r * 10) / 10).toFixed(1); }
function cnt(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n); }
function tel(p) { return 'tel:' + String(p.ph || '').replace(/[^+0-9]/g, ''); }
var MODE_WORD = { w: 'walk', t: 'by transit', d: 'drive' };
function travelLine(p, ctx) {
  if (p.tt) return ic('route') + 'Everyone there in ' + p.tt[0] + ' min or less, ' + p.tt[1] + ' min on average' + (p.tt[3] ? ' (estimate)' : '');
  var at = ctx && ctx.at, d = at ? dist(at, ll(p)) : p.d;
  if (d == null) return '';
  return ic('route') + fmtDist(d) + ', about ' + estimateMin(d, (ctx && ctx.f && ctx.f.mode) || 'walk') + ' min ' + MODE_WORD[MODE_CHAR[(ctx && ctx.f && ctx.f.mode) || 'walk']];
}
function photoBlock(p, rank, ctx, big) {
  var whenTxt = ctx && ctx.f && ctx.f.when && ctx.f.when.mode === 'at' ? ' at ' + niceWhen(ctx.f.when) : ' now';
  var open = p.op === true ? '<span class="open yes"><i></i>Open' + whenTxt + '</span>' : p.op === false ? '<span class="open no"><i></i>Closed' + whenTxt + '</span>' : '<span class="open"><i></i>Hours unknown</span>';
  var fav = isFav(p.id);
  return '<div class="ph" data-act="details">' +
    (p.im ? '<img loading="lazy" alt="" src="' + esc(p.im) + '" onerror="this.remove()">' : '') + '<div class="fallback">' + emojiFor(p) + '</div>' +
    (p.im ? '' : '') +
    (rank ? '<span class="rank">' + rank + '</span>' : '') +
    '<button class="fav ' + (fav ? 'on' : '') + '" data-act="fav" aria-label="' + (fav ? 'Remove from favorites' : 'Save to favorites') + '">' + ic('star') + '</button>' +
    open + (p.im && p.id.indexOf('g:') === 0 ? '<span class="credit">Photo: Google</span>' : '') + '</div>';
}
function scoresHtml(p) {
  var s = '';
  if (p.g) s += '<a class="score g" href="' + esc(mapsUrl(p)) + '"><span class="n">' + stars(p.g[0]) + '</span>Google <small>' + cnt(p.g[1]) + '</small></a>';
  if (p.y) s += '<a class="score y" href="' + esc(yelpUrl(p)) + '"><span class="n">' + stars(p.y[0]) + '</span>Yelp <small>' + cnt(p.y[1]) + '</small></a>';
  var h = historyFor(p.id);
  if (h && h.rating) s += '<span class="score mine"><span class="n">' + h.rating + '</span>You rated it</span>';
  if (!p.g && !p.y) s += '<span class="score na">No ratings yet. Add a Google or Yelp key to see them.</span>';
  return '<div class="scores">' + s + '</div>';
}
function placeCard(p, rank, ctx) {
  var t = tally(p.id), group = Math.max(1, memberList().length);
  var tags = (p.tg || []).map(function (x) { return '<span class="' + (/Veg|Vegan|Gluten|Halal|Kosher|Dairy/.test(x) ? 'diet' : /closed/i.test(x) ? 'warn' : '') + '">' + esc(x) + '</span>'; }).join('');
  var facts = [p.c ? '<b>' + esc(p.c) + '</b>' : '', p.pr ? '<span>' + '$'.repeat(p.pr) + '</span>' : '', p.a ? '<span>' + esc(p.a) + '</span>' : ''].filter(Boolean).join('');
  var rv = p.rv && p.rv[0] ? '<div class="quote"><b>' + p.rv[0][0] + '★</b> “' + esc(p.rv[0][1]) + (p.rv[0][1].length >= 170 ? '…' : '') + '” <span class="muted">' + esc(p.rv[0][2]) + '</span></div>' : p.es ? '<div class="quote">' + esc(p.es) + '</div>' : '';
  var voters = t.up.length ? '<span class="avs">' + t.up.slice(0, 5).map(function (m) { return avatar(m); }).join('') + '</span>' : '';
  return '<article class="place ' + (t.down.length ? 'vetoed' : '') + '" data-pid="' + esc(p.id) + '">' + photoBlock(p, rank, ctx) +
    '<div class="pbody"><h3 data-act="details">' + esc(p.n) + '</h3>' +
    '<div class="facts">' + facts + '</div>' + scoresHtml(p) +
    (travelLine(p, ctx) ? '<div class="travel">' + travelLine(p, ctx) + '</div>' : '') +
    (tags ? '<div class="tags">' + tags + '</div>' : '') + rv +
    '<div class="votebar"><button class="vbtn yes ' + (t.mine === 1 ? 'on' : '') + '" data-act="up">👍 ' + (t.mine === 1 ? 'I’m in' : 'I’d go') + (t.up.length ? ' · ' + t.up.length : '') + '</button>' +
    '<button class="vbtn no ' + (t.mine === -1 ? 'on' : '') + '" data-act="down" aria-label="Veto">👎' + (t.down.length ? ' ' + t.down.length : '') + '</button><span class="grow"></span>' + voters + '</div>' +
    '<div class="meter"><i style="width:' + Math.round(100 * t.up.length / group) + '%"></i><i class="no" style="width:' + Math.round(100 * t.down.length / group) + '%"></i></div>' +
    (t.down.length ? '<div class="vetonote">Vetoed by ' + esc(t.down.map(function (m) { return m.id === me.id ? 'you' : m.name; }).join(', ')) + '</div>' : '') +
    '<div class="acts"><a href="' + esc(dirUrl(p)) + '">' + ic('route') + 'Directions</a><button data-act="book">' + ic('cal') + 'Book</button>' +
    '<a href="' + esc(menuUrl(p)) + '">' + ic('book') + 'Menu</a><button data-act="details">' + ic('dots') + 'More</button></div>' +
    '</div></article>';
}
function onPlaceClick(e) {
  var b = e.target.closest('[data-act]'); if (!b) return;
  var card = e.target.closest('[data-pid]'), pid = card && card.getAttribute('data-pid'), p = pid && S.st.places[pid];
  if (!p) return;
  var act = b.getAttribute('data-act');
  e.preventDefault(); e.stopPropagation();
  if (act === 'up' || act === 'down') {
    var v = castVote(pid, act === 'up' ? 1 : -1);
    renderAll();
    var nb = document.querySelector('[data-pid="' + CSS.escape(pid) + '"] [data-act="' + act + '"]'); if (nb && v) { nb.classList.add('pop'); }
  } else if (act === 'fav') { toggleFav(p); renderAll(); }
  else if (act === 'book') openBook(p);
  else if (act === 'details') openDetails(pid);
  else if (act === 'pick') { if (S.st.pick && S.st.pick.pid === pid) emit('unpick', {}); else emit('pick', { pid: pid, p: p }); }
}

// ================================================================ results
function latestSearch() {
  var best = null; (S ? S.st.order : []).forEach(function (rid) { var s = S.st.searches[rid]; if (!best || s.ts > best.ts) best = s; });
  return best;
}
function searchItems(s) {
  var items = []; Object.keys(s.parts).sort(function (a, b) { return a - b; }).forEach(function (k) { items = items.concat(s.parts[k]); });
  return items.map(function (p) { return S.st.places[p.id] || p; });
}
function renderResults() {
  var s = latestSearch(), el = $('results');
  if (!s) {
    var i = info();
    el.innerHTML = '<div class="empty"><div class="big">Pick a craving and search.</div>Results appear on everyone’s phone at the same moment.' +
      (!i.hasGoogle && !i.hasYelp ? '<p class="hint">This phone has no Google or Yelp key, so searches use OpenStreetMap (hours, no ratings). If someone at the table has keys, your searches run through their phone automatically.</p>' : '') + '</div>';
    return;
  }
  var items = searchItems(s);
  el.innerHTML = '<div class="reshead"><div><h2>' + items.length + ' places</h2><div class="by">' + esc(describe(s.f, s.at)) + '<br>Found by ' + esc((s.u === me.id ? 'you' : s.by) + (s.forN ? ' for ' + s.forN : '')) + ' at ' + clock(s.ts) + ' with ' + esc(s.src || '') + '</div></div>' +
    (items.length ? '<div class="tools"><button class="btn ink small" id="swipeBtn">' + ic('cards') + 'Swipe</button></div>' : '') + '</div>' +
    (items.length ? items.map(function (p, i) { return placeCard(p, i + 1, s); }).join('')
      : '<div class="empty"><div class="big">Nothing matched.</div>Try a bigger distance, a different time, or turn off a filter or two.</div>');
  var sb = $('swipeBtn'); if (sb) sb.onclick = openSwipe;
}

// ================================================================ decide (shortlist)
function rankedShortlist() {
  var ids = Object.keys(S.st.votes).filter(function (pid) { return Object.keys(S.st.votes[pid]).length && S.st.places[pid]; });
  return ids.map(function (pid) { return { pid: pid, t: tally(pid), p: S.st.places[pid] }; })
    .sort(function (a, b) { return b.t.score - a.t.score || b.t.up.length - a.t.up.length || ((ratingOf(b.p) || {}).r || 0) - ((ratingOf(a.p) || {}).r || 0); });
}
function renderShortlist() {
  var list = rankedShortlist(), s = latestSearch(), group = Math.max(1, memberList().length), dl = S.st.deadline;
  $('votePanel').innerHTML = '<h2>' + (S.st.pick ? 'Decided.' : list.length ? 'Time to decide?' : 'No votes yet') + '</h2>' +
    '<p>' + (S.st.pick ? 'Change your mind any time by picking another place.' : list.length ? 'Start a timer and the top place wins, or let chance or the AI helper decide.' : 'Tap 👍 on places you’d go to and 👎 on any you can’t. Or swipe through results.') + '</p>' +
    '<div class="row">' +
    (dl ? '<button class="b2" data-dl="off">' + ic('clock') + 'Cancel timer</button>' : '<button class="b1" data-dl="5">' + ic('clock') + '5-min vote</button><button class="b2" data-dl="10">10 min</button><button class="b2" data-dl="15">15 min</button>') +
    '<button class="b3" data-spin="1">' + ic('dice') + 'Spin</button><button class="b2" data-ai="1">' + ic('spark') + 'Ask AI</button></div>';
  if (!list.length) { $('shortlist').innerHTML = ''; return; }
  var lead = list[0].t.score > 0 ? list[0].t.score : null;
  $('shortlist').innerHTML = '<div class="board">' + list.map(function (x, i) {
    return '<div class="brow ' + (lead != null && x.t.score === lead ? 'lead' : '') + '" data-pid="' + esc(x.pid) + '"><div class="pos">' + (i + 1) + '</div><div><div class="nm" data-act="details">' + esc(x.p.n) + (S.st.pick && S.st.pick.pid === x.pid ? ' 🎉' : '') + '</div>' +
      '<div class="bar"><i style="width:' + Math.round(100 * x.t.up.length / group) + '%"></i><i class="no" style="width:' + Math.round(100 * x.t.down.length / group) + '%"></i></div></div>' +
      '<div class="ct">' + x.t.up.length + '/' + group + '<small>' + (x.t.down.length ? x.t.down.length + ' veto' : 'in') + '</small></div></div>';
  }).join('') + '</div>' + list.map(function (x, i) {
    return placeCard(x.p, i + 1, { at: s && s.at, f: s && s.f }).replace('<div class="acts">', '<div class="row" style="margin-top:12px"><button class="btn ' + (S.st.pick && S.st.pick.pid === x.pid ? 'ink' : 'tomato') + ' small" data-act="pick">' + (S.st.pick && S.st.pick.pid === x.pid ? 'Our pick ✓' : 'Make this our pick') + '</button></div><div class="acts">');
  }).join('');
}

// ================================================================ table tab
function renderMembers() {
  if (!S) return;
  var ms = memberList().sort(function (a, b) { return b.lastSeen - a.lastSeen; });
  $('members').innerHTML = ms.map(function (m) {
    var on = Date.now() - m.lastSeen < 20 * 60000, isMe = m.id === me.id, parts = [];
    parts.push(on ? 'Active now' : 'Seen ' + ago(m.lastSeen));
    var st = m.status && S.st.pick && m.status.ts > S.st.pick.ts ? m.status : null;
    if (st) parts.push(st.s === 'here' ? 'Arrived' + (st.wait > 0 ? ', ' + st.wait + ' min wait' : st.wait === 0 ? ', no wait' : '') : 'On the way' + (st.eta ? ', about ' + st.eta + ' min' : ''));
    var loc = isMe ? (lsGet('ge:shareLoc', false) && myLoc ? 'Sharing location near ' + (myLoc.label || 'you') : 'Location not shared')
      : m.loc ? (myLoc ? fmtDist(dist(myLoc, m.loc)) + ' from you' : 'Location shared') + (m.loc.label ? ', near ' + m.loc.label : '') : 'Location not shared';
    var d = (isMe ? me.diet : m.diet) || [];
    var extra = [m.caps && (m.caps.g || m.caps.y) ? 'Has ' + [m.caps.g ? 'Google' : '', m.caps.y ? 'Yelp' : ''].filter(Boolean).join(' and ') + ' keys' : '', d.length ? d.map(dietLabel).join(', ') : ''].filter(Boolean).join('. ');
    return '<div class="member">' + avatar(m) + '<div class="who"><b>' + esc(isMe ? (m.name || 'You') + ' (you)' : m.name) + '</b><small>' + esc(parts.join('. ')) + '</small><small>' + esc(loc) + '</small>' + (extra ? '<small>' + esc(extra) + '</small>' : '') + '</div></div>';
  }).join('');
  $('shareLoc').checked = !!lsGet('ge:shareLoc', false);
  $('codeShow').textContent = fmtCode(S.code);
  renderAlerts();
}
function renderFeed() {
  var f = S.st.feed.slice(-100).reverse();
  $('feed').innerHTML = f.length ? f.map(function (x) {
    if (x.kind === 'msg' || x.kind === 'ai') {
      var mine = x.u === me.id;
      return '<div class="bub ' + (mine ? 'me ' : '') + (x.kind === 'ai' ? 'ai' : '') + '">' + (mine ? '' : '<span class="who">' + esc(x.n) + (x.kind === 'ai' ? ' · AI helper' : '') + '</span>') + esc(x.text) + '<span class="t">' + clock(x.ts) + '</span></div>';
    }
    return '<div class="sys">' + esc(x.text) + ', ' + clock(x.ts) + '</div>';
  }).join('') : '<p class="hint">No messages yet.</p>';
}
function renderBadges() {
  if (!S) return;
  var g = $('groupBadge'); g.textContent = S.unseen; g.classList.toggle('hidden', !S.unseen || tab === 'group');
  var n = rankedShortlist().filter(function (x) { return x.t.up.length; }).length;
  var l = $('listBadge'); l.textContent = n; l.classList.toggle('hidden', !n || tab === 'list');
}

// ================================================================ pick banner + arrival status
function renderPick() {
  var p = S.st.pick, el = $('pickBanner');
  if (!p || !S.st.places[p.pid]) { el.classList.add('hidden'); return; }
  var pl = S.st.places[p.pid];
  var sts = memberList().filter(function (m) { return m.status && m.status.ts > p.ts; }).map(function (m) {
    var s = m.status; return (m.id === me.id ? 'You' : m.name) + (s.s === 'here' ? ' arrived' + (s.wait > 0 ? ' (' + s.wait + ' min wait)' : s.wait === 0 ? ' (no wait)' : '') : ' on the way' + (s.eta ? ' (~' + s.eta + ' min)' : ''));
  });
  el.innerHTML = '<div class="pb-main"><div class="pb-kicker">' + (p.auto ? 'The table picked' : esc(p.u === me.id ? 'You picked' : p.by + ' picked')) + '</div><div class="pb-name">' + esc(pl.n) + '</div></div>' +
    '<a class="pb-go" href="' + esc(dirUrl(pl)) + '">' + ic('route') + 'Go</a>' +
    '<div class="pb-row"><button data-status="way">🚶 On my way</button><button data-status="here">📍 I’m here</button><button data-status="wait">⏳ Report wait</button><button data-status="book">📅 Book</button></div>' +
    (sts.length ? '<div class="pb-st">' + esc(sts.join(', ')) + '</div>' : '');
  el.classList.remove('hidden');
}

// ================================================================ start screen
function renderStart() {
  $('nameInput').value = me.name || '';
  if (!$('titleInput').value) { var f = defaultFilters(); $('titleInput').placeholder = new Date().toLocaleDateString([], { weekday: 'long' }) + ' ' + f.what.toLowerCase(); }
  $('recentPanel').innerHTML = recents.length ? '<h2>Your tables</h2>' + recents.map(function (r) {
    return '<div class="recent">' + avatar({ id: r.code, name: r.title }) + '<div class="grow"><b>' + esc(r.title) + '</b><div class="hint" style="margin:0">' + fmtCode(r.code) + ', ' + ago(r.ts) + '</div></div><button class="btn soft small" data-rejoin="' + r.code + '">Open</button></div>';
  }).join('') : '';
  $('recentPanel').classList.toggle('hidden', !recents.length);
}
function needName() {
  var n = $('nameInput').value.trim();
  if (!n) { toast('Add your name first.'); $('nameInput').focus(); return null; }
  me.name = n; saveMe(); return n;
}
function wireStart() {
  $('createBtn').onclick = function () {
    if (!needName()) return;
    var code = rnd(8, CODE_ALPHA), t = $('titleInput').value.trim() || $('titleInput').placeholder;
    openSession(code, t);
    setTimeout(openInvite, 250);
    refreshMyLoc(false).catch(function () {});
  };
  $('joinBtn').onclick = function () {
    if (!needName()) return;
    var c = normCode($('codeInput').value);
    if (!validCode(c)) { toast('Codes are 8 letters and numbers, like ABCD-2345.'); return; }
    openSession(c);
    refreshMyLoc(false).catch(function () {});
  };
  $('pasteBtn').onclick = function () {
    var use = function (t) {
      var m = String(t || '').toUpperCase().match(/([A-Z2-9]{4})-?([A-Z2-9]{4})/);
      if (m) $('codeInput').value = m[1] + '-' + m[2]; else toast('There’s no table code on your clipboard.');
    };
    if (A.pasteAsync) A.pasteAsync().then(use); else use(A.paste());
  };
  $('recentPanel').addEventListener('click', function (e) { var b = e.target.closest('[data-rejoin]'); if (b) { if (!me.name && !needName()) return; openSession(b.getAttribute('data-rejoin')); } });
}

// ================================================================ session wiring
function wireSession() {
  document.querySelector('.dock').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setTab(b.getAttribute('data-tab')); });
  ['results', 'shortlist'].forEach(function (id) { $(id).addEventListener('click', onPlaceClick); });
  $('tableStrip').addEventListener('click', function (e) { if (e.target.closest('[data-invite]')) openInvite(); else setTab('group'); });
  $('inviteBtn').onclick = openInvite; $('invite2').onclick = openInvite;
  $('copyCode').onclick = function () { A.copy(fmtCode(S.code)); };
  $('leaveBtn').onclick = function () { if (confirm('Leave this table? You can reopen it later from Your tables.')) closeSession(false); };
  $('chatForm').addEventListener('submit', function (e) { e.preventDefault(); var t = $('chatInput').value.trim(); if (!t) return; emit('msg', { text: t }); $('chatInput').value = ''; });
  $('shareLoc').addEventListener('change', function () {
    var on = this.checked; lsSet('ge:shareLoc', on);
    if (on) { lastLocSent = null; refreshMyLoc(true).then(maybeShareLoc).catch(function (e) { toast(e.message); $('shareLoc').checked = false; lsSet('ge:shareLoc', false); }); }
    else emit('locoff', {});
    renderMembers();
  });
  $('votePanel').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.getAttribute('data-dl')) { var v = b.getAttribute('data-dl'); if (v === 'off') emit('deadlineOff', {}); else startDeadline(+v); }
    else if (b.getAttribute('data-spin')) spinPick();
    else if (b.getAttribute('data-ai')) openAI();
  });
  $('pickBanner').addEventListener('click', function (e) { var b = e.target.closest('[data-status]'); if (b) onStatus(b.getAttribute('data-status')); });
  $('deadlineBanner').addEventListener('click', function (e) { if (e.target.closest('[data-dl="off"]')) emit('deadlineOff', {}); else setTab('list'); });
  wireFilters();
}

// ================================================================ phone alerts tile
function renderAlerts() {
  var el = $('alertsTile'); if (!el || !S) return;
  var on = lsGet('ge:ntfyAlerts', false), web = !!info().web;
  el.innerHTML = '<h2>' + (web ? 'Get notifications' : 'Alerts for iPhone friends') + '</h2>' +
    '<p class="hint">' + (web ? 'Web pages can’t notify you reliably when closed, especially on iPhone. Install the free ntfy app and subscribe to this table’s alerts to get real push notifications for chat, picks, results and arrivals.'
      : 'Friends on iPhone (or using the web version) can get real push notifications through the free ntfy app. Turning this on makes the table post short alerts they can subscribe to.') + '</p>' +
    '<label class="switch"><input type="checkbox" id="ntfyToggle"' + (on ? ' checked' : '') + '><span class="track"></span><span>Post alerts for this table</span></label>' +
    (on || web ? '<div class="field"><span>Topic to subscribe to in the ntfy app</span><div class="codebox" style="margin-top:0"><input readonly value="' + esc(alertTopic()) + '" style="font-size:14px;letter-spacing:0;text-transform:none"><button class="btn soft" id="ntfyCopy">Copy</button></div></div>' +
      '<p class="hint">In ntfy: tap +, paste the topic, keep the server as ntfy.sh, and subscribe.</p><div class="row"><a class="btn soft small" href="https://apps.apple.com/app/ntfy/id1625396347">ntfy for iPhone</a><a class="btn soft small" href="https://play.google.com/store/apps/details?id=io.heckel.ntfy">ntfy for Android</a></div>' : '');
  $('ntfyToggle').onchange = function () { lsSet('ge:ntfyAlerts', this.checked); emit('hello', caps()); renderAlerts(); };
  if ($('ntfyCopy')) $('ntfyCopy').onclick = function () { A.copy(alertTopic()); };
}

// ================================================================ location sharing
var lastLocSent = null;
function maybeShareLoc() {
  if (!S || !myLoc || !lsGet('ge:shareLoc', false)) return;
  if (lastLocSent && Date.now() - lastLocSent.ts < 5 * 60000 && dist(lastLocSent, myLoc) < 150) return;
  lastLocSent = { lat: myLoc.lat, lng: myLoc.lng, ts: Date.now() };
  emit('loc', { lat: +myLoc.lat.toFixed(4), lng: +myLoc.lng.toFixed(4), label: myLoc.label || '' });
}

// collapse the table strip while scrolling (with hysteresis so it doesn't flicker)
window.addEventListener('scroll', function () {
  var y = window.scrollY, b = document.body;
  if (y > 140 && !b.classList.contains('scrolled')) b.classList.add('scrolled');
  else if (y < 24 && b.classList.contains('scrolled')) b.classList.remove('scrolled');
}, { passive: true });
