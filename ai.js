/* Group Eats — on-device AI helper (Hugging Face model via transformers.js, runs entirely on the phone). */
'use strict';

var AI_MODELS = [
  { id: 'HuggingFaceTB/SmolLM2-360M-Instruct', label: 'SmolLM2 360M', size: 'about 300 MB', note: 'Fastest. Good for quick picks on most phones.' },
  { id: 'onnx-community/Qwen2.5-0.5B-Instruct', label: 'Qwen2.5 0.5B', size: 'about 500 MB', note: 'Better reasoning. Slower, needs more memory.' },
  { id: 'HuggingFaceTB/SmolLM2-135M-Instruct', label: 'SmolLM2 135M', size: 'about 120 MB', note: 'Tiny and quick. Simpler answers.' }
];
var AI = { T: null, gen: null, loading: false, model: null, device: '', files: {}, err: '', busy: false };
var aiCfg = lsGet('ge:ai', {});

window.__aiProgress = function (name, loaded, total) {
  if (loaded < 0) { AI.files[name] = { loaded: 0, total: 0, failed: total }; }
  else AI.files[name] = { loaded: loaded, total: total || loaded };
  renderAIProgress();
};
window.__aiError = function (m) { AI.err = m; renderAIProgress(); };
window.__aiCleared = function () { toast('AI files deleted'); if (!$('sheet').classList.contains('hidden')) openAI(); };

function aiProgressText() {
  var L = 0, T = 0, cur = '';
  Object.keys(AI.files).forEach(function (k) { var f = AI.files[k]; L += f.loaded; T += f.total; if (f.total && f.loaded < f.total) cur = k.split('/').pop(); });
  return { pct: T ? Math.min(100, Math.round(100 * L / T)) : 0, text: (L / 1048576).toFixed(0) + ' of ' + (T / 1048576).toFixed(0) + ' MB' + (cur ? ', ' + cur : '') };
}
function renderAIProgress() {
  var bar = $('aiBar'), txt = $('aiProg'); if (!bar) return;
  var p = aiProgressText(); bar.style.width = p.pct + '%'; txt.textContent = AI.err || ('Downloading ' + p.text);
}

function loadRuntime() {
  if (AI.T) return Promise.resolve(AI.T);
  return import('./ai-runtime.js').then(function (T) {
    var env = T.env;
    env.allowLocalModels = false;
    AI.T = T;
    if (info().web) return T;          // browser: default Hugging Face host, jsDelivr runtime, Cache Storage
    env.remoteHost = location.origin + '/ai/hf/';
    env.useBrowserCache = false;
    if ('useWasmCache' in env) env.useWasmCache = false;
    var onnx = env.backends && env.backends.onnx;
    if (onnx && onnx.wasm) {
      var ver = (onnx.versions && onnx.versions.web) || '1.31.0-dev.20260914-8d85527a0';
      var base = location.origin + '/ai/cdn/onnxruntime-web@' + ver + '/dist/';
      onnx.wasm.wasmPaths = { mjs: base + 'ort-wasm-simd-threaded.asyncify.mjs', wasm: base + 'ort-wasm-simd-threaded.asyncify.wasm' };
      onnx.wasm.numThreads = 1;
      onnx.wasm.proxy = false;
    }
    AI.T = T; return T;
  });
}
function hasWebGPU() {
  if (!navigator.gpu) return Promise.resolve(false);
  return navigator.gpu.requestAdapter().then(function (a) { return !!a; }).catch(function () { return false; });
}
function loadModel(modelId) {
  if (AI.gen && AI.model === modelId) return Promise.resolve(AI.gen);
  AI.loading = true; AI.err = ''; AI.files = {};
  return loadRuntime().then(function (T) {
    return hasWebGPU().then(function (gpu) {
      var tries = gpu ? [['webgpu', 'q4f16'], ['wasm', 'q4'], ['wasm', 'q8']] : [['wasm', 'q4'], ['wasm', 'q8']];
      var i = 0, lastErr = null;
      function attempt() {
        if (i >= tries.length) throw lastErr || new Error('Couldn’t load the model');
        var t = tries[i++];
        var opts = { device: t[0], dtype: t[1] };
        if (info().web) opts.progress_callback = function (p) { if (p && p.status === 'progress' && p.file) window.__aiProgress(p.file, p.loaded || 0, p.total || 0); };
        return T.pipeline('text-generation', modelId, opts).then(function (g) {
          AI.gen = g; AI.model = modelId; AI.device = t[0] === 'webgpu' ? 'phone GPU' : 'phone CPU';
          return g;
        }).catch(function (e) { lastErr = e; return attempt(); });
      }
      return attempt();
    });
  }).then(function (g) {
    AI.loading = false;
    aiCfg.model = modelId; aiCfg.ready = true;
    var m = AI_MODELS.filter(function (x) { return x.id === modelId; })[0]; aiCfg.label = m ? m.label : modelId.split('/').pop();
    lsSet('ge:ai', aiCfg);
    return g;
  }).catch(function (e) {
    AI.loading = false;
    AI.err = 'Couldn’t start the model: ' + (e && e.message ? e.message : e) + '. Check your connection and storage, or try a smaller model.';
    throw e;
  });
}

// ---------------------------------------------------------------- prompt building
function aiCandidates() {
  var list = rankedShortlist().map(function (x) { return x.p; });
  var s = latestSearch();
  if (list.length < 3 && s) searchItems(s).forEach(function (p) { if (list.length < 6 && list.indexOf(p) < 0 && !list.some(function (q) { return q.id === p.id; })) list.push(p); });
  return list.slice(0, 6);
}
function aiContext() {
  var f = S.st.filters, s = latestSearch(), gd = groupDiets(), lines = [];
  lines.push('Group: ' + memberList().length + ' people, party of ' + f.party + '. Looking for: ' + queryText(f) + (f.when.mode === 'at' ? ' at ' + niceWhen(f.when) : ' now') + '.');
  if (Object.keys(gd).length) lines.push('Dietary needs: ' + Object.keys(gd).map(function (k) { return dietLabel(k) + ' (' + gd[k].join(', ') + ')'; }).join('; ') + '.');
  lines.push('Options:');
  aiCandidates().forEach(function (p, i) {
    var t = tally(p.id), r = [];
    if (p.c) r.push(p.c);
    if (p.g) r.push('Google ' + stars(p.g[0]) + ' from ' + p.g[1] + ' reviews');
    if (p.y) r.push('Yelp ' + stars(p.y[0]) + ' from ' + p.y[1] + ' reviews');
    if (p.pr) r.push('$'.repeat(p.pr));
    r.push(p.op === true ? 'open' : p.op === false ? 'closed' : 'hours unknown');
    if (p.tt) r.push('everyone there within ' + p.tt[0] + ' min'); else if (s && s.at) r.push(fmtDist(dist(s.at, ll(p))) + ' away');
    if (p.tg && p.tg.length) r.push(p.tg.join(', '));
    r.push(t.up.length + (t.up.length === 1 ? ' vote' : ' votes') + ' for' + (t.up.length ? ' (' + t.up.map(function (m) { return m.id === me.id ? me.name : m.name; }).join(', ') + ')' : ''));
    if (t.down.length) r.push('VETOED by ' + t.down.map(function (m) { return m.name; }).join(', '));
    if (p.rv && p.rv[0]) r.push('a review says: "' + p.rv[0][1].slice(0, 110) + '"');
    lines.push((i + 1) + '. ' + p.n + ': ' + r.join('; ') + '.');
  });
  var chat = S.st.feed.filter(function (x) { return x.kind === 'msg'; }).slice(-4);
  if (chat.length) lines.push('Recent chat: ' + chat.map(function (x) { return x.n + ': ' + x.text.slice(0, 80); }).join(' | '));
  return lines.join('\n');
}
var AI_SYSTEM = 'You help a group of friends choose where to eat. Use only the facts given. Do not invent ratings, prices, dishes or details. Never pick a vetoed or closed place. Respect dietary needs. Prefer places with more votes, strong ratings from many reviews, and short travel for everyone. Reply in under 90 words in this format:\nPick: <exact name>\n<one or two sentences explaining why>\nRunner-up: <exact name>, <short reason>';
var AI_PROMPTS = ['Pick one for us', 'What works best for the whole group?', 'Which is the best value?', 'Compare the top three', 'Best for the dietary needs?'];

function aiAsk(question) {
  if (AI.busy) return;
  var out = $('aiOut'); if (!out) return;
  if (!aiCandidates().length) { out.textContent = 'Search or vote on a few places first, then ask again.'; return; }
  AI.busy = true; out.className = 'ai-out thinking'; out.textContent = 'Thinking on your phone…';
  $('aiActions').classList.add('hidden');
  var text = '';
  var messages = [{ role: 'system', content: AI_SYSTEM }, { role: 'user', content: aiContext() + '\n\nQuestion: ' + question }];
  var T = AI.T, streamer = new T.TextStreamer(AI.gen.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: function (t) { text += t; out.className = 'ai-out'; out.textContent = text; } });
  var t0 = Date.now();
  setTimeout(function () {
    AI.gen(messages, { max_new_tokens: 220, do_sample: false, repetition_penalty: 1.1, streamer: streamer }).then(function (res) {
      if (!text) { var g = res && res[0] && res[0].generated_text; text = Array.isArray(g) ? (g[g.length - 1] || {}).content || '' : String(g || ''); out.textContent = text; }
      text = text.trim();
      AI.busy = false; AI.last = text;
      $('aiMeta').textContent = 'Answered on your ' + AI.device + ' in ' + Math.round((Date.now() - t0) / 1000) + ' s. Small models make mistakes, so check the details on each card.';
      var pick = aiPickedPlace(text);
      $('aiActions').classList.remove('hidden');
      $('aiPickBtn').classList.toggle('hidden', !pick);
      if (pick) $('aiPickBtn').textContent = 'Make ' + pick.n + ' our pick';
      AI.lastPick = pick;
    }).catch(function (e) { AI.busy = false; out.className = 'ai-out'; out.textContent = 'The AI helper hit a problem: ' + (e.message || e); });
  }, 30);
}
function aiPickedPlace(text) {
  var m = text.match(/pick\s*:\s*\**\s*([^\n*]+)/i), name = m ? m[1].trim() : '';
  var c = aiCandidates();
  if (name) for (var i = 0; i < c.length; i++) if (nameMatch(c[i].n, name)) return c[i];
  var n = parseInt(name, 10); if (n >= 1 && n <= c.length) return c[n - 1];
  return null;
}

// ---------------------------------------------------------------- sheet
function openAI() {
  if (!S) { toast('Open a table first.'); return; }
  var ready = AI.gen && AI.model;
  var head = '<div class="ai-hero"><h3>' + ic('spark') + 'Help us pick</h3><p>A small AI model that runs entirely on this phone. It reads your shortlist, votes, ratings, diets and travel times, then recommends a place. Nothing is sent to an AI service.</p></div>';
  if (AI.loading) {
    openSheet(sheetHead('AI helper') + head + '<div class="progress"><i id="aiBar"></i></div><p class="hint" id="aiProg">Starting…</p><p class="hint">The first download can take a few minutes. You can close this sheet. It keeps going.</p>');
    renderAIProgress(); return;
  }
  if (!ready) {
    var sel = aiCfg.model || AI_MODELS[0].id, custom = AI_MODELS.every(function (m) { return m.id !== sel; });
    openSheet(sheetHead('AI helper') + head +
      '<div class="ai-models">' + AI_MODELS.map(function (m) { return '<label><input type="radio" name="aim" value="' + esc(m.id) + '"' + (m.id === sel ? ' checked' : '') + '><span><b>' + esc(m.label) + '</b><small>' + esc(m.size) + '. ' + esc(m.note) + '</small></span></label>'; }).join('') +
      '<label><input type="radio" name="aim" value="custom"' + (custom ? ' checked' : '') + '><span><b>Another Hugging Face model</b><small>Any transformers.js-ready ONNX chat model</small><input class="input" id="aiCustom" placeholder="owner/model-name" value="' + esc(custom ? sel : '') + '" style="margin-top:6px"></span></label></div>' +
      '<p class="hint">' + (aiCfg.ready ? 'Downloaded before. It loads from this phone.' : 'Downloads once over the internet (Wi-Fi recommended), then works offline.' + (info().web ? ' In a browser, especially on iPhone, use the smallest model: browsers limit memory.' : ' Uses about ' + Math.round(A.aiUsage() / 1048576) + ' MB now.')) + '</p>' +
      (AI.err ? '<p class="hint" style="color:var(--tomato-d)">' + esc(AI.err) + '</p>' : '') +
      '<button class="btn tomato block big" id="aiLoad">' + (aiCfg.ready ? 'Start AI helper' : 'Download and start') + '</button>' +
      (A.aiUsage() > 0 ? '<button class="btn soft block" id="aiDel">Delete AI files (' + Math.round(A.aiUsage() / 1048576) + ' MB)</button>' : ''));
    $('aiLoad').onclick = function () {
      var v = ($('sheetBody').querySelector('input[name=aim]:checked') || {}).value;
      if (v === 'custom') v = $('aiCustom').value.trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(v || '')) { toast('Enter a model as owner/model-name.'); return; }
      loadModel(v).then(function () { if (!$('sheet').classList.contains('hidden')) openAI(); toast('AI helper is ready'); })
        .catch(function () { if (!$('sheet').classList.contains('hidden')) openAI(); });
      openAI();
    };
    if ($('aiDel')) $('aiDel').onclick = function () { if (confirm('Delete the downloaded AI model and engine?')) { aiCfg = {}; lsSet('ge:ai', aiCfg); A.aiClear(''); } };
    return;
  }
  openSheet(sheetHead('AI helper') + head +
    '<div class="ai-prompts">' + AI_PROMPTS.map(function (q) { return '<button class="chip" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>' +
    '<form id="aiForm" class="chatform"><input class="input" id="aiQ" placeholder="Ask anything about these places"><button class="btn ink">Ask</button></form>' +
    '<div class="ai-out" id="aiOut">Choose a question above. The AI looks at ' + aiCandidates().length + ' places.</div>' +
    '<p class="hint" id="aiMeta">Model: ' + esc(aiCfg.label || AI.model) + ', running on your ' + esc(AI.device) + '.</p>' +
    '<div class="row hidden" id="aiActions"><button class="btn tomato" id="aiShare">Share with the table</button><button class="btn ink hidden" id="aiPickBtn">Make it our pick</button></div>');
  $('sheetBody').querySelectorAll('[data-q]').forEach(function (b) { b.onclick = function () { aiAsk(b.getAttribute('data-q')); }; });
  $('aiForm').onsubmit = function (e) { e.preventDefault(); var q = $('aiQ').value.trim(); if (q) aiAsk(q); };
  $('aiShare').onclick = function () { if (AI.last) { emit('msg', { text: 'AI suggestion: ' + AI.last, ai: true }); toast('Shared with the table'); } };
  $('aiPickBtn').onclick = function () { var p = AI.lastPick; if (p) { emit('pick', { pid: p.id, p: p }); closeSheet(); setTab('list'); } };
}
