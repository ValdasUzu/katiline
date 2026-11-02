// Katiline programele: MQTT per WebSocket (TLS) prie debesu brokerio (EMQX Cloud Serverless).
// Temos (ESP Katiline_ESP): <prefix>/<irenginys>/{state,meta,avail,stm} <- ; {set/<raktas>,cmd} ->
'use strict';

const U = ['NON', 'HP', 'DUJ', 'KK'];
// raktas: [grupe, pavadinimas, vienetai arba pasirinkimai]
const P = {
  pk1_tkset: ['Kontūras 1', 'Kambario temperatūra', '°C'], pk1_tkhys: ['Kontūras 1', 'Histerezė', '°C'],
  pk2_tkset: ['Kontūras 2', 'Kambario temperatūra', '°C'], pk2_tkhys: ['Kontūras 2', 'Histerezė', '°C'],
  pk3_tkset: ['Kontūras 3 (grindys)', 'Kambario temperatūra', '°C'], pk3_tkhys: ['Kontūras 3 (grindys)', 'Histerezė', '°C'],
  pbo_tkset: ['Boileris', 'Temperatūra', '°C'], pbo_tkhys: ['Boileris', 'Histerezė', '°C'],
  pga_swtem: ['Valdymas', 'HP/DUJ perjungimo lauko temp.', '°C'], pga_swhys: ['Valdymas', 'HP/DUJ perjungimo histerezė', '°C'],
  pga_oftem: ['Valdymas', 'Šildymo stop lauko temp.', '°C'], pga_ofhys: ['Valdymas', 'Šildymo stop histerezė', '°C'],
  pga_autoe: ['Valdymas', 'Automatinis šaltinio parinkimas', ['Ne', 'Taip']], pga_actun: ['Valdymas', 'Šildymo šaltinis', U],
};
const $ = i => document.getElementById(i);
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const T = (v, d) => v === undefined || v === null ? '–' : (d ? Number(v).toFixed(d) : String(v));
const R = (n, v) => `<div class="r"><span>${n}</span><span class="v">${v}</span></div>`;

const KEY = 'katiline-app';
let cfg = null, client = null, base = '';
let st = null, meta = null, avail = '', stmLink = '', stateAt = 0, built = '', last = {}, authFailed = false;

function loadCfg() {
  let c = null;
  try { c = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* privati narsykle */ }
  return c;
}
function saveCfg(c, remember) {
  try { if (remember) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY); } catch (e) { /* nera saugyklos */ }
}
// Atsijungus ar esant blogam slaptazodziui pamirstamas tik slaptazodis (brokeris, irenginys, vartotojas lieka)
function forgetPass() {
  cfg.pass = '';
  try { const c = loadCfg(); if (c) { c.pass = ''; localStorage.setItem(KEY, JSON.stringify(c)); } } catch (e) { /* nera saugyklos */ }
}

function showLogin(text) {
  const q = new URLSearchParams(location.search), c = cfg || {};
  $('l_host').value = c.host || q.get('h') || '';
  $('l_dev').value = c.dev || q.get('d') || '';
  $('l_prefix').value = c.prefix || q.get('p') || 'katiline';
  $('l_port').value = c.port || q.get('w') || 8084;
  $('l_user').value = c.user || '';
  $('l_pass').value = '';
  $('lmsg').textContent = text || '';
  $('login').classList.remove('hide');
  $('app').classList.add('hide');
  $('out').classList.add('hide');
  link('Atsijungta', '');
}

function link(text, cls) { $('lnk').textContent = text; $('lnk').className = 'st ' + cls; }

function updLink() {
  if (!client || !client.connected) return link('Jungiamasi…', 'warn');
  if (avail === 'offline') return link('Katilinė neprisijungusi', 'off');
  if (stmLink === 'offline') return link('Valdiklis neatsako', 'off');
  if (avail === 'online') return link('Prisijungta', 'on');
  link('Laukiama duomenų…', 'warn');
}

function connect() {
  base = (cfg.prefix || 'katiline') + '/' + cfg.dev;
  st = null; meta = null; avail = ''; stmLink = ''; built = ''; last = {}; authFailed = false;
  $('set').className = 'mu'; $('set').textContent = 'laukiama katilinės…';
  $('login').classList.add('hide');
  $('app').classList.remove('hide');
  $('out').classList.remove('hide');
  $('ttl').innerHTML = 'Katilinė <span class="mu">' + E(cfg.dev) + '</span>';
  render();
  const url = 'wss://' + cfg.host + ':' + (cfg.port || 8084) + '/mqtt';
  const connectFn = window.KATILINE_CONNECT || ((u, o) => mqtt.connect(u, o));   // testams galima pakeisti
  client = connectFn(url, {
    username: cfg.user, password: cfg.pass, clientId: 'katapp-' + Math.random().toString(16).slice(2, 10),
    clean: true, keepalive: 30, reconnectPeriod: 5000, connectTimeout: 15000, protocolVersion: 4,
  });
  updLink();
  client.on('connect', () => { client.subscribe(base + '/#', { qos: 0 }); updLink(); });
  client.on('reconnect', updLink);
  client.on('close', updLink);
  client.on('offline', updLink);
  client.on('error', err => {
    if (err && (err.code === 4 || err.code === 5)) {                 // CONNACK: blogas vartotojas / slaptazodis
      authFailed = true;
      client.end(true);
      client = null;
      forgetPass();
      showLogin('Neteisingas vartotojas arba slaptažodis.');
    }
  });
  client.on('message', (topic, payload) => {
    const t = topic.slice(base.length + 1), s = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
    if (t === 'state') { try { st = JSON.parse(s); stateAt = Date.now(); } catch (e) { return; } }
    else if (t === 'meta') { try { meta = JSON.parse(s); } catch (e) { return; } }
    else if (t === 'avail') avail = s;
    else if (t === 'stm') stmLink = s;
    else return;
    render();
  });
}

function disconnect() {
  if (client) client.end(true);
  client = null;
  forgetPass();
  showLogin('');
}

function build(p) {
  let h = '', g = '';
  for (const k of Object.keys(p)) {
    const d = P[k] || ['Kita', k, ''], r = p[k];
    if (d[0] !== g) { g = d[0]; h += `<div class="mu g">${E(g)}</div>`; }
    let i;
    if (Array.isArray(d[2])) i = `<select id="i_${k}">${d[2].map((o, n) => n >= r[0] && n <= r[1] ? `<option value="${n}">${E(o)}</option>` : '').join('')}</select>`;
    else i = `<input id="i_${k}" type="number" inputmode="decimal" step="${r[2]}" min="${r[0]}" max="${r[1]}"> ${E(d[2])}`;
    h += `<div class="r"><span>${E(d[1])}</span><span>${i} <button data-k="${k}">Nustatyti</button></span></div>`;
  }
  $('set').className = ''; $('set').innerHTML = h; last = {};
  for (const b of $('set').querySelectorAll('button')) b.onclick = () => save(b.dataset.k);
  built = Object.keys(p).join();
}

function fill() {
  if (!st || !meta) return;
  for (const k of Object.keys(meta.p)) {
    const el = $('i_' + k), d = P[k];
    let v = st[k];
    if (!el || v === undefined || document.activeElement === el || last[k] === v) continue;
    if (k === 'pga_actun') v = U.indexOf(v);
    el.value = v;
    last[k] = st[k];
  }
}

function save(k) {
  const d = P[k] || ['', k, ''], el = $('i_' + k), r = meta && meta.p[k];
  let v = el.value;
  if (Array.isArray(d[2])) v = k === 'pga_actun' ? U[parseInt(v, 10)] : String(parseInt(v, 10));
  else {
    const f = parseFloat(String(v).replace(',', '.'));
    if (isNaN(f)) return;
    if (r && (f < r[0] || f > r[1])) { $('msg').textContent = `${d[0]} – ${d[1]}: leidžiama ${r[0]} … ${r[1]} ${d[2]}`; return; }
    v = String(f);
  }
  if (!client || !client.connected) { $('msg').textContent = 'Nėra ryšio – pabandykite vėliau.'; return; }
  client.publish(base + '/set/' + k, v, { qos: 1 });
  $('msg').textContent = `${d[0]} – ${d[1]}: išsiųsta. Reikšmė atsinaujins, kai katilinė patvirtins (iki 1 min).`;
  delete last[k];
}

function render() {
  updLink();
  const s = st || {}, m = meta || {};
  $('g0').innerHTML = R('Lauko temperatūra', T(s.lt) + ' °C') + R('Dirba', E(s.au || '–'))
    + R('Padavimas / grįžtamas', T(s.vo) + ' / ' + T(s.vi) + ' °C') + R('Šilumos poreikis', T(s.ps)) + R('Eko lygis dabar', T(s.ek));
  $('g1').innerHTML = R('K1', T(s.k1, 1) + ' °C <span class="mu">(nust. ' + T(s.pk1_tkset, 1) + ')</span>')
    + R('K2', T(s.k2, 1) + ' °C <span class="mu">(nust. ' + T(s.pk2_tkset, 1) + ')</span>')
    + R('K3 (grindys)', T(s.k3, 1) + ' °C <span class="mu">(nust. ' + T(s.pk3_tkset, 1) + ')</span>')
    + R('Padavimas K1 / K2 / K3', T(s.p1) + ' / ' + T(s.p2) + ' / ' + T(s.p3) + ' °C');
  $('g2').innerHTML = R('Viršus / apačia', T(s.bv) + ' / ' + T(s.ba) + ' °C') + R('Nustatyta', T(s.pbo_tkset) + ' °C')
    + R('Šildomas', s.b1 ? 'iš HP' : s.b2 ? 'iš DUJ' : 'ne') + R('Heat Now', s.hn ? 'vykdomas' : '–') + R('Boilerio langas', T(s.eb));
  if (m.p && built !== Object.keys(m.p).join()) build(m.p);
  fill();
  const age = stateAt ? Math.round((Date.now() - stateAt) / 1000) : null;
  $('dev').innerHTML = R('Įrenginys', E(cfg ? cfg.dev : '–')) + R('Brokeris', E(cfg ? cfg.host : '–'))
    + R('Katilinė (ESP)', avail === 'online' ? 'prisijungusi' : avail === 'offline' ? 'neprisijungusi' : '–')
    + R('Valdiklis (STM)', stmLink === 'online' ? 'veikia' : stmLink === 'offline' ? 'neatsako' : '–')
    + R('Duomenys gauti', age === null ? '–' : age < 5 ? 'ką tik' : 'prieš ' + age + ' s')
    + R('Programos', E((m.esp || '–') + ' / STM ' + (m.stm || '–')));
}

$('lf').onsubmit = e => {
  e.preventDefault();
  cfg = {
    host: $('l_host').value.trim().replace(/^(wss?|mqtts?|https?):\/\//, '').replace(/[:/].*$/, ''),
    dev: $('l_dev').value.trim(), prefix: $('l_prefix').value.trim() || 'katiline', port: parseInt($('l_port').value, 10) || 8084,
    user: $('l_user').value.trim(), pass: $('l_pass').value,
  };
  saveCfg(cfg, $('l_rem').checked);
  connect();
};
$('out').onclick = disconnect;
$('hn').onclick = () => {
  if (!client || !client.connected) { $('msg').textContent = 'Nėra ryšio – pabandykite vėliau.'; return; }
  client.publish(base + '/cmd', 'heatnow', { qos: 1 });
  $('msg').textContent = 'Heat Now išsiųsta.';
};
setInterval(() => { if (client) render(); }, 5000);

cfg = loadCfg();
if (cfg && cfg.host && cfg.dev && cfg.user && cfg.pass) connect(); else showLogin('');

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
