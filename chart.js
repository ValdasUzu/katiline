// Katilines 24 val. temperaturu grafikai (SVG, be biblioteku). Bendras failas: telefono programele ir ESP web puslapis
// (ESP32/Katiline_ESP/web_page.h CHART_JS - sio failo kopija). Duomenys is ESP istorijos:
// {"t0":<pirmo tasko pradzia, epoch s>,"step":300,"n":288,"s":{"bv":[523,...,null],"au":[1,1,2,...]}} - temperaturos 0.1 C,
// au - dirbantis saltinis 0..3 (NON HP DUJ KK), null - nera duomenu
'use strict';
const KChart = (() => {
  // eilutes id: [pavadinimas, [[raktas, serijos pavadinimas], ...]] - serijos spalva pagal eile (--s1, --s2, --s3)
  const ROWS = {
    lt: ['Lauko temperatūra', [['lt', 'Lauke']]],
    vv: ['Padavimas / grįžtamas', [['vo', 'Padavimas'], ['vi', 'Grįžtamas']]],
    k1: ['Kambarys K1', [['k1', 'K1']]],
    k2: ['Kambarys K2', [['k2', 'K2']]],
    k3: ['Kambarys K3 (grindys)', [['k3', 'K3']]],
    pp: ['Padavimas K1 / K2 / K3', [['p1', 'K1'], ['p2', 'K2'], ['p3', 'K3']]],
    bo: ['Boileris: viršus / apačia', [['bv', 'Viršus'], ['ba', 'Apačia']]],
    au: ['Dirba (šildymo šaltinis)', []],          // tik saltinio juosta
  };
  const UNITS = ['NON', 'HP', 'DUJ', 'KK'];         // au 0..3; spalvos --u0..--u3
  const REFRESH_MS = 60000;
  const CSS = `
:root{--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--u0:#c4c4bd;--u1:#6250d6;--u2:#eda100;--u3:#e87ba4}
@media(prefers-color-scheme:dark){:root{--s1:#3987e5;--s2:#d95926;--s3:#199e70;--u0:#4b5563;--u1:#9085e9;--u2:#c98500;--u3:#d55181}}
.kc-row{cursor:pointer;margin:0 -6px;padding-left:6px;padding-right:6px;border-radius:6px}
.kc-row:hover,.kc-row:focus-visible{background:var(--bg);outline:none}
.kc-ic{width:14px;height:14px;margin-left:6px;vertical-align:-2px;fill:none;stroke:var(--ac);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.kc{position:fixed;inset:0;z-index:10;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:12px}
.kc-hide{display:none}
.kc-box{background:var(--card);color:var(--tx);border:1px solid var(--bd);border-radius:12px;width:100%;max-width:760px;max-height:100%;overflow:auto;padding:12px 14px}
.kc-hd{display:flex;justify-content:space-between;align-items:center;gap:8px}
.kc-hd h2{font-size:16px;margin:0}
.kc-x{background:transparent;color:var(--tx);font-size:22px;line-height:1;padding:2px 8px}
.kc-lg{display:flex;flex-wrap:wrap;gap:4px 18px;margin:10px 0 4px;font-size:14px}
.kc-lg b{margin:0 4px}
.kc-sw{display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}
.kc-sq{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.kc-u{margin-left:10px;white-space:nowrap}
.kc-pl{position:relative;margin-top:4px}
.kc-pl svg{display:block;width:100%;height:auto;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.kc-gr{stroke:var(--bd);stroke-width:1}
.kc-ax{fill:var(--mu);font-size:11px}
.kc-cr{stroke:var(--mu);stroke-width:1}
.kc-tip{position:absolute;top:0;pointer-events:none;background:var(--card);color:var(--tx);border:1px solid var(--bd);border-radius:8px;padding:6px 8px;font-size:13px;line-height:1.5;box-shadow:0 2px 8px rgba(0,0,0,.18);white-space:nowrap}
.kc-tip .kc-tt{color:var(--mu);font-size:12px}
.kc-msg{min-height:18px;padding:6px 0}
`;
  const ICON = '<svg class="kc-ic" viewBox="0 0 16 16" aria-hidden="true"><polyline points="1,13 5,8 9,10 15,3"/></svg>';
  const NS = 'http://www.w3.org/2000/svg';
  let load = null, cur = null, data = null, token = 0, timer = 0, pushed = false, closing = false, pendingOpen = null, el = {};

  const fmt = (v, d) => v.toFixed(d);
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const sw = c => { const s = node('span', 'kc-sw'); s.style.background = c; return s; };
  const sq = u => { const s = node('span', 'kc-sq'); s.style.background = `var(--u${u})`; return s; };
  const dur = m => m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min';

  function when(t) {
    const d = new Date(t * 1000), now = new Date(), day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const dd = Math.round((day(now) - day(d)) / 864e5);
    return (dd === 0 ? 'šiandien ' : dd === 1 ? 'vakar ' : d.toLocaleDateString('lt-LT') + ' ') + hm;
  }

  // eilute su grafiko zenkleliu (paspaudus - grafikas)
  function row(name, value, id) {
    return `<div class="r kc-row" data-h="${id}" role="button" tabindex="0" title="Rodyti 24 val. grafiką"><span>${name}${ICON}</span><span class="v">${value}</span></div>`;
  }

  function msg(t) { el.msg.textContent = t || ''; }

  function open(id) {
    if (!ROWS[id] || !load) return;
    if (closing) { pendingOpen = id; return; }          // dar vykdomas "atgal" nuo ankstesnio grafiko
    cur = ROWS[id];
    data = null;
    el.t.textContent = cur[0];
    el.lg.replaceChildren();
    el.pl.replaceChildren();
    el.pl.style.minHeight = cur[1].length ? '190px' : '60px';   // saltinio juosta - zema
    msg('Kraunama…');
    el.box.classList.remove('kc-hide');
    if (!pushed) { history.pushState({ kc: 1 }, ''); pushed = true; }    // telefono "atgal" uzdaro grafika
    el.x.focus();
    refresh();
    clearInterval(timer);
    timer = setInterval(refresh, REFRESH_MS);
  }

  function hideUi() {
    cur = null; data = null; token++;
    clearInterval(timer);
    el.box.classList.add('kc-hide');
  }

  function close() {
    if (!cur) return;
    hideUi();
    if (pushed) { pushed = false; closing = true; history.back(); }
  }

  function refresh() {
    if (!cur) return;
    const my = ++token;
    const keys = cur[1].map(s => s[0]);
    keys.push('au');                                 // saltinio juosta prie kiekvieno grafiko (esp-0.6+)
    load(keys.join(',')).then(j => {
      if (my !== token || !cur) return;
      if (!j || j.err) { data = null; el.lg.replaceChildren(); el.pl.replaceChildren(); msg('Istorija dar nekaupiama' + (j && j.err ? ': ' + j.err : '') + '.'); return; }
      data = j;
      draw();
    }).catch(e => {
      if (my !== token || !cur) return;
      if (!data) msg(typeof e === 'string' ? e : 'Istorijos gauti nepavyko.');
    });
  }

  function draw() {
    const ser = cur[1].map(([k, name], i) => ({ name, c: `var(--s${i + 1})`, v: (data.s && data.s[k] || []).map(x => x === null ? null : x / 10) }));
    const st = data.s && Array.isArray(data.s.au) ? data.s.au : null;              // dirbantis saltinis 0..3
    const n = data.n || (ser[0] ? ser[0].v.length : st ? st.length : 0), t0 = data.t0, step = data.step || 300;
    let lo = Infinity, hi = -Infinity;
    for (const s of ser) {
      s.last = null; s.min = Infinity; s.max = -Infinity;
      for (const x of s.v) if (x !== null) { s.last = x; s.min = Math.min(s.min, x); s.max = Math.max(s.max, x); }
      lo = Math.min(lo, s.min); hi = Math.max(hi, s.max);
    }
    const lines = ser.length > 0, hasSt = !!st && st.some(x => x !== null && x !== undefined);
    const runs = [], cnt = [0, 0, 0, 0];                                            // saltinio juostos atkarpos [busena, nuo, iki]
    let stLast = null;
    if (hasSt) st.forEach((u, i) => {
      if (u === null || u === undefined || u < 0 || u > 3) return;
      const r = runs[runs.length - 1];
      if (r && r[0] === u && r[2] === i - 1) r[2] = i; else runs.push([u, i, i]);
      cnt[u]++;
      stLast = u;
    });

    // legenda: dabartine reiksme ir 24 val. min / max; saltiniai - kiek laiko dirbo (tekstu - spalva ne vienintelis skirtumas)
    const lg = ser.map(s => {
      const d = node('div');
      if (ser.length > 1) d.append(sw(s.c));
      d.append(s.name, node('b', '', s.last === null ? '–' : fmt(s.last, 1) + ' °C'),
        node('span', 'mu', s.last === null ? '' : 'min ' + fmt(s.min, 1) + ' · max ' + fmt(s.max, 1)));
      return d;
    });
    if (hasSt) {
      const d = node('div');
      d.append(lines ? 'Dirba' : 'Dabar', node('b', '', stLast === null ? '–' : UNITS[stLast]));
      cnt.forEach((c, u) => { if (c) { const x = node('span', 'mu kc-u'); x.append(sq(u), UNITS[u] + ' ' + dur(Math.round(c * step / 60))); d.append(x); } });
      lg.push(d);
    }
    el.lg.replaceChildren(...lg);
    if ((lines ? lo === Infinity : !hasSt) || n < 2) { el.pl.replaceChildren(); msg('Duomenų dar nėra – istorija kaupiama 5 min vidurkiais.'); return; }
    msg('');

    const W = Math.max(280, Math.round(el.pl.clientWidth || 600));
    const L = 38, Rm = 8, Tm = 8, B = 22, pw = W - L - Rm, SH = lines ? 10 : 28;
    const ph = lines ? Math.round(Math.min(270, Math.max(170, W * 0.42))) : 0;
    const sy = Tm + ph + (lines ? 8 : 0), base = hasSt ? sy + SH : Tm + ph, H = base + B;   // juostos virsus, x asis
    const ys = [0.5, 1, 2, 5, 10, 20, 50].find(s => Math.ceil(hi / s) - Math.floor(lo / s) <= 5) || 100;
    let y0 = Math.floor(lo / ys) * ys, y1 = Math.ceil(hi / ys) * ys;
    if (y1 === y0) { y0 -= ys; y1 += ys; }
    const X = i => L + i * pw / (n - 1), Y = v => Tm + (y1 - v) * ph / (y1 - y0), r1 = v => v.toFixed(1);

    let g = '';
    if (lines) for (let v = y0; v <= y1 + 1e-9; v += ys)
      g += `<line class="kc-gr" x1="${L}" x2="${W - Rm}" y1="${r1(Y(v))}" y2="${r1(Y(v))}"/><text class="kc-ax" x="${L - 6}" y="${r1(Y(v) + 4)}" text-anchor="end">${fmt(v, ys < 1 ? 1 : 0)}</text>`;
    const hs = W < 480 ? 6 : 3, tEnd = t0 + (n - 1) * step;
    for (let t = Math.ceil(t0 / 3600) * 3600; t <= tEnd; t += 3600) {
      const d = new Date(t * 1000), h = d.getHours(), x = r1(L + (t - t0) / step * pw / (n - 1));
      if (h === 0) g += `<line class="kc-gr" x1="${x}" x2="${x}" y1="${Tm}" y2="${base}" stroke-dasharray="3 3"/>`;   // vidurnaktis
      if (h % hs || d.getMinutes()) continue;
      g += `<line class="kc-gr" x1="${x}" x2="${x}" y1="${base}" y2="${base + 4}"/><text class="kc-ax" x="${x}" y="${H - 5}" text-anchor="middle">${String(h).padStart(2, '0')}:00</text>`;
    }
    if (hasSt) {
      const half = pw / (n - 1) / 2;
      if (lines) g += `<text class="kc-ax" x="${L - 6}" y="${r1(sy + SH / 2 + 4)}" text-anchor="end">Dirba</text>`;
      for (const [u, a, b] of runs) {
        const x0 = Math.max(L, X(a) - half), x1 = Math.min(L + pw, X(b) + half);
        g += `<rect x="${r1(x0)}" y="${sy}" width="${r1(Math.max(1, x1 - x0 - 1))}" height="${SH}" rx="2" style="fill:var(--u${u})"/>`;
      }
    }
    for (const s of ser) {
      let d = '';
      s.v.forEach((v, i) => {
        if (v === null) return;
        const p = s.v[i - 1] === null || i === 0, q = i === n - 1 || s.v[i + 1] === null;
        if (p && q) g += `<circle cx="${r1(X(i))}" cy="${r1(Y(v))}" r="2" style="fill:${s.c}"/>`;   // pavienis taskas
        d += (p ? 'M' : 'L') + r1(X(i)) + ' ' + r1(Y(v));
      });
      if (d) g += `<path d="${d}" fill="none" style="stroke:${s.c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    g += `<g visibility="hidden"><line class="kc-cr" y1="${Tm}" y2="${base}"/>`
      + ser.map(s => `<circle r="4" style="fill:${s.c};stroke:var(--card)" stroke-width="2"/>`).join('') + '</g>';

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', cur[0] + ' – paskutinės 24 val.');
    svg.innerHTML = g;
    const tip = node('div', 'kc-tip kc-hide'), hv = svg.lastChild, cr = hv.firstChild, dots = [...hv.querySelectorAll('circle')];
    el.pl.replaceChildren(svg, tip);

    // kryzmukas + viena uzuomina su visomis serijomis ir saltiniu
    const hover = ev => {
      const b = svg.getBoundingClientRect();
      if (!b.width) return;
      const i = Math.max(0, Math.min(n - 1, Math.round(((ev.clientX - b.left) * W / b.width - L) / pw * (n - 1))));
      const x = X(i);
      cr.setAttribute('x1', x); cr.setAttribute('x2', x);
      ser.forEach((s, k) => {
        const v = s.v[i];
        dots[k].setAttribute('visibility', v === null ? 'hidden' : 'visible');
        if (v !== null) { dots[k].setAttribute('cx', x); dots[k].setAttribute('cy', Y(v)); }
      });
      hv.setAttribute('visibility', 'visible');
      const rows = ser.map(s => {
        const d = node('div');
        if (ser.length > 1) d.append(sw(s.c));
        d.append(s.name + ' ', node('b', '', s.v[i] === null ? '–' : fmt(s.v[i], 1) + ' °C'));
        return d;
      });
      if (hasSt) {
        const u = st[i], ok = u !== null && u !== undefined && u >= 0 && u <= 3, d = node('div');
        if (ok) d.append(sq(u));
        d.append('Dirba ', node('b', '', ok ? UNITS[u] : '–'));
        rows.push(d);
      }
      tip.replaceChildren(node('div', 'kc-tt', when(t0 + i * step)), ...rows);
      tip.classList.remove('kc-hide');
      const px = x * b.width / W, tw = tip.offsetWidth;
      tip.style.left = (px + 12 + tw <= b.width ? px + 12 : Math.max(0, px - 12 - tw)) + 'px';
    };
    const leave = () => { hv.setAttribute('visibility', 'hidden'); tip.classList.add('kc-hide'); };
    svg.addEventListener('pointermove', hover);
    svg.addEventListener('pointerdown', hover);
    svg.addEventListener('pointerleave', leave);
  }

  // loadFn(keys "bv,ba") -> Promise su istorijos JSON (programele - per MQTT, ESP puslapis - /api/hist)
  function init(loadFn) {
    load = loadFn;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    const box = node('div', 'kc kc-hide');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'kc_t');
    box.innerHTML = '<div class="kc-box"><div class="kc-hd"><h2 id="kc_t"></h2><button type="button" class="kc-x" aria-label="Uždaryti">✕</button></div>'
      + '<div class="mu">Paskutinės 24 val., 5 min vidurkiai</div><div class="kc-lg"></div><div class="kc-pl"></div><div class="kc-msg mu"></div></div>';
    document.body.appendChild(box);
    el = { box, t: box.querySelector('h2'), x: box.querySelector('.kc-x'), lg: box.querySelector('.kc-lg'), pl: box.querySelector('.kc-pl'), msg: box.querySelector('.kc-msg') };
    el.x.onclick = close;
    box.addEventListener('click', e => { if (e.target === box) close(); });
    document.addEventListener('click', e => { const r = e.target.closest && e.target.closest('[data-h]'); if (r) open(r.dataset.h); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && cur) { close(); return; }
      const r = e.target.closest && e.target.closest('[data-h]');
      if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(r.dataset.h); }
    });
    window.addEventListener('popstate', () => {
      if (closing) {                                          // musu close() "atgal" ivykdytas
        closing = false;
        if (pendingOpen) { const id = pendingOpen; pendingOpen = null; open(id); }
        return;
      }
      if (pushed) { pushed = false; hideUi(); }               // telefono "atgal"
    });
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (cur && data) draw(); }, 150); });
  }

  return { init, row, open, close };
})();
