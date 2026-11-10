/* Group Eats (web) — implements the AndroidApp bridge with browser APIs so the same app runs in Safari/Chrome. */
(function () {
  'use strict';
  if (window.AndroidApp) return;
  var NTFY = 'https://ntfy.sh/';
  var VERSION = '2.6-web';
  function cb(fn) { var a = [].slice.call(arguments, 1); setTimeout(function () { if (window[fn]) window[fn].apply(null, a); }, 0); }
  function ls(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }

  // ---------------------------------------------------------------- live sync over ntfy.sh (Server-Sent Events)
  var es = null, gen = 0, lastId = '', backoff = 2000, retryT = null, curTopic = null, myId = '', title = '';
  function startSync(topic, since, me, t) {
    myId = me || ''; title = t || '';
    if (topic === curTopic && es) return;
    stopSync();
    curTopic = topic; lastId = since || '';
    var g = ++gen;
    function open() {
      if (g !== gen) return;
      es = new EventSource(NTFY + topic + '/sse?since=' + (lastId || 'all'));
      es.onopen = function () { backoff = 2000; cb('__syncState', 'live'); };
      es.onmessage = function (e) {
        var o; try { o = JSON.parse(e.data); } catch (x) { return; }
        if (o.event && o.event !== 'message') return;
        lastId = o.id || lastId;
        if (window.__syncMsg) window.__syncMsg(e.data);
        maybeNotify(o);
      };
      es.onerror = function () {
        if (g !== gen) return;
        try { es.close(); } catch (x) {}
        es = null;
        cb('__syncState', navigator.onLine ? 'reconnecting' : 'offline');
        clearTimeout(retryT); retryT = setTimeout(open, backoff); backoff = Math.min(backoff * 2, 30000);
      };
    }
    open();
  }
  function stopSync() { gen++; curTopic = null; clearTimeout(retryT); if (es) { try { es.close(); } catch (x) {} es = null; } }
  var startedAt = Date.now();
  function maybeNotify(o) {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    if ((o.time || 0) * 1000 < startedAt) return;
    var m; try { m = JSON.parse(o.message); } catch (e) { return; }
    if (!m || m.u === myId || !Array.isArray(m.ev)) return;
    var lines = [];
    m.ev.forEach(function (ev) {
      if (ev.t === 'msg') lines.push(m.n + ': ' + ev.text);
      else if (ev.t === 'pick') lines.push('🎉 ' + (ev.auto ? 'Voting closed: ' : m.n + ' picked ') + ((ev.p || {}).n || 'a place'));
      else if (ev.t === 'results' && !ev.part) lines.push('📋 ' + m.n + ' shared new places');
      else if (ev.t === 'deadline') lines.push('⏰ ' + m.n + ' started a vote');
      else if (ev.t === 'status' && ev.s === 'here') lines.push('📍 ' + m.n + ' has arrived');
    });
    if (!lines.length || !navigator.serviceWorker) return;
    navigator.serviceWorker.ready.then(function (reg) { reg.showNotification(title || 'Group Eats', { body: lines.join('\n'), tag: 'groupeats', renotify: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' }); }).catch(function () {});
  }

  // ---------------------------------------------------------------- deep link: ?t=CODE or #CODE
  var pendingJoin = '';
  (function () {
    var q = new URLSearchParams(location.search), c = q.get('t') || q.get('join') || (location.hash || '').replace(/^#(join-)?/, '');
    if (c && /^[A-Za-z0-9-]{8,9}$/.test(c)) pendingJoin = c;
    if (q.get('t') || q.get('join') || pendingJoin) try { history.replaceState(null, '', location.pathname); } catch (e) {}
  })();

  window.AndroidApp = {
    share: function (t, text) {
      if (navigator.share) navigator.share({ title: t, text: text }).catch(function () {});
      else this.copy(text);
    },
    copy: function (text) {
      var done = function () { if (window.toast) window.toast('Copied'); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      else { fallbackCopy(text); done(); }
    },
    paste: function () { return ''; },
    pasteAsync: function () { return navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText().catch(function () { return ''; }) : Promise.resolve(''); },
    toast: function (m) { if (window.toast) window.toast(m); },
    openUrl: function (u) { window.open(u, '_blank', 'noopener'); },
    isOnline: function () { return navigator.onLine !== false; },
    pendingJoin: function () { var c = pendingJoin; pendingJoin = ''; return c; },
    pendingTab: function () { return ''; },
    appInfo: function () { return JSON.stringify({ version: VERSION, versionCode: 0, web: true, hasGoogle: false, hasYelp: false, hasCarto: false }); },
    setKey: function () {},
    setName: function () {},
    notificationsAllowed: function () { return 'Notification' in window && Notification.permission === 'granted'; },
    requestNotifications: function () {
      if ('Notification' in window && Notification.permission === 'default') try { Notification.requestPermission(); } catch (e) {}
    },
    request: function (id, method, url, headersJson, body, auth) {
      if (auth) { cb('__appHttpCb', id, -2, 'API keys live in the Android app'); return; }
      var h = {}; try { h = headersJson ? JSON.parse(headersJson) : {}; } catch (e) {}
      delete h.Referer; delete h['User-Agent'];
      var ctl = window.AbortController ? new AbortController() : null;
      if (ctl) setTimeout(function () { ctl.abort(); }, 40000);
      fetch(url, { method: method || 'GET', headers: h, body: body || undefined, signal: ctl ? ctl.signal : undefined })
        .then(function (r) { return r.text().then(function (t) { cb('__appHttpCb', id, r.status, t); }); })
        .catch(function (e) { cb('__appHttpCb', id, 0, String((e && e.message) || e)); });
    },
    syncStart: startSync,
    syncStop: stopSync,
    syncPublish: function (id, topic, body) {
      fetch(NTFY + topic, { method: 'POST', body: body })
        .then(function (r) { cb('__appPubCb', id, r.status); })
        .catch(function () { cb('__appPubCb', id, 0); });
    },
    syncAlert: function (json) { fetch(NTFY, { method: 'POST', body: json }).catch(function () {}); },
    getLocation: function (id) {
      if (!navigator.geolocation) { cb('__appLoc', id, JSON.stringify({ ok: false, error: 'This browser can’t share location.' })); return; }
      navigator.geolocation.getCurrentPosition(function (p) {
        cb('__appLoc', id, JSON.stringify({ ok: true, lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, age: Math.round((Date.now() - p.timestamp) / 1000) }));
      }, function (e) {
        var msg = e.code === 1 ? 'Location is blocked. On iPhone: Settings → Privacy & Security → Location Services → Safari Websites → While Using.' : 'Couldn’t get your location. Try again outdoors or near a window.';
        cb('__appLoc', id, JSON.stringify({ ok: false, error: msg }));
      }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
    },
    aiUsage: function () { return 0; },
    aiHas: function () { return false; },
    aiClear: function () {
      if (window.caches) caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return /transformers|onnx/i.test(k); }).map(function (k) { return caches.delete(k); })); }).then(function () { cb('__aiCleared'); });
    }
  };
  function fallbackCopy(text) {
    var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove();
  }

  // ---------------------------------------------------------------- lifecycle → same hooks the Android shell calls
  document.addEventListener('visibilitychange', function () { if (!document.hidden && window.__appResume) window.__appResume(); });
  window.addEventListener('online', function () { if (window.__appNet) window.__appNet(true); });
  window.addEventListener('offline', function () { if (window.__appNet) window.__appNet(false); });
  window.addEventListener('load', function () { if (!navigator.onLine && window.__appNet) window.__appNet(false); });
})();
