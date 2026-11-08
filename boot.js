/* Group Eats — lifecycle hooks and startup. */
'use strict';

window.__appResume = function () {
  checkUpdate(false);
  if (!S) return;
  A.syncStart(S.topic, S.lastId || '', me.id, S.st.title || '');
  if (Date.now() - lastHello > 10 * 60000) { lastHello = Date.now(); emit('hello', caps()); }
  if (lsGet('ge:shareLoc', false)) refreshMyLoc(false).catch(function () {});
  renderAll();
  setTimeout(maybeAskRating, 1200);
};
window.__appNet = function (on) { $('netBanner').classList.toggle('hidden', !!on); if (on && Q.length) scheduleFlush(500); };
window.__appBack = function () {
  if (!$('spin').classList.contains('hidden')) { $('spin').classList.add('hidden'); return true; }
  if (!$('swipe').classList.contains('hidden')) { closeSwipe(); return true; }
  if (!$('sheet').classList.contains('hidden')) { closeSheet(); return true; }
  if (S && tab !== 'find') { setTab('find'); return true; }
  if (window.scrollY > 300) { window.scrollTo({ top: 0, behavior: 'smooth' }); return true; }
  return false;
};
window.__appJoin = function (code) {
  code = normCode(code); if (!validCode(code) || (S && S.code === code)) return;
  if (!me.name) { closeSession(true); showScreen('start'); renderStart(); $('codeInput').value = fmtCode(code); toast('Add your name, then tap Join table.'); return; }
  openSession(code);
};
window.__appOpenTab = function (t) { if (S && ['find', 'map', 'list', 'group'].indexOf(t) >= 0) setTab(t); };

// live clock for the vote timer and "last seen" labels
setInterval(function () { if (S && S.st.deadline) renderDeadline(); }, 1000);
setInterval(function () { if (S) { renderHeader(); renderMembers(); } }, 60000);

(function boot() {
  wireStart(); wireSession();
  try { A.setName(me.name || ''); } catch (e) {}
  var pj = normCode(A.pendingJoin()), last = lsGet('ge:last', '');
  if (pj && validCode(pj)) {
    if (me.name) openSession(pj); else { showScreen('start'); renderStart(); $('codeInput').value = fmtCode(pj); toast('Add your name, then tap Join table.'); }
  } else if (last && validCode(last) && me.name) openSession(last);
  else { showScreen('start'); renderStart(); }
  var pt = ''; try { pt = A.pendingTab(); } catch (e) {}
  if (pt) window.__appOpenTab(pt);
  if (S) refreshMyLoc(false).catch(function () {});
  checkUpdate(false);
  setTimeout(maybeAskRating, 2500);
})();
