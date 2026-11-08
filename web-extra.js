/* Group Eats (web) — offline support and "add to home screen" prompts. */
(function () {
  'use strict';
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
    // reload once when a NEW version takes over (not on the very first install, which would drop invite links)
    var hadController = !!navigator.serviceWorker.controller, refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (!hadController || refreshed) return; refreshed = true; if (!window.S) location.reload(); });
  }
  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (standalone) return;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var snoozed = Date.now() - (lsGet('ge:installSnooze', 0) || 0) < 3 * 86400000;
  if (snoozed) return;
  var bar = null, deferred = null;
  function show(html, onGo) {
    if (bar) bar.remove();
    bar = document.createElement('div'); bar.className = 'installbar';
    bar.innerHTML = html + '<button class="x" aria-label="Not now">✕</button>';
    document.body.appendChild(bar);
    bar.querySelector('.x').onclick = function () { lsSet('ge:installSnooze', Date.now()); bar.remove(); };
    var g = bar.querySelector('.go'); if (g) g.onclick = onGo;
  }
  if (ios) {
    setTimeout(function () {
      show('<div class="grow"><b>Add Group Eats to your Home Screen</b><br>Tap <span aria-label="Share">Share ⬆︎</span> in Safari, then “Add to Home Screen”. It opens full screen like an app.</div>');
    }, 2500);
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    show('<div class="grow"><b>Install Group Eats</b><br>Adds it to your home screen like an app.</div><button class="go">Install</button>', function () {
      deferred.prompt(); deferred.userChoice.finally(function () { if (bar) bar.remove(); });
    });
  });
})();
