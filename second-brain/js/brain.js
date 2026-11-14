import { createOrb } from './orb.js?v=26';
import { mountVistas } from './vistas.js?v=4';
const UI = window.UI, B = UI.B, { icon, esc, CAT_COLOR, fnum, fusd } = UI;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- cabecera ----------
$('#logo').innerHTML = icon('hexagon', 'logo');
$('#back').innerHTML = icon('arrow-left') + 'Volver al OS';
$('#menuBtn').innerHTML = icon('menu') + 'Menú';
$('#motionBtn').innerHTML = icon('orbit') + 'Movimiento';
$('#reload').innerHTML = icon('refresh-cw');
$('#reload').onclick = () => UI.rescan($('#reload'));

const tip = $('#tip');
function showTip(html, x, y) {
  if (!html) { tip.classList.remove('show'); return; }
  tip.innerHTML = html; tip.classList.add('show');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(x + 16, innerWidth - w - 10) + 'px';
  tip.style.top = Math.min(y + 16, innerHeight - h - 10) + 'px';
}
const nodeTip = n => `${n.thumb ? `<img class="tipimg" src="${esc(UI.urlOf(n.thumb))}" alt="">` : ''}<b>${esc(n.title)}</b><div class="p">${esc(n.path)}</div><div class="p" style="color:${CAT_COLOR[n.cat]}">${esc(B.catLabel[n.cat] || '')} · ${(UI.ADJ[n.id] || []).length} conexiones · ${n.pieces.length} piezas</div>`;

// ---------- visor, ficha y esfera ----------
let view = 'orbs';
const viewer = UI.mountViewer({ onFly: n => { if (view !== 'orbs' && view !== 'map') setView('orbs'); select(n); } });
const drawer = UI.mountDrawer({
  onNav: n => select(n),
  onFull: n => viewer.open(n),
  onClose: () => { orb.clearSelection(); mapState.sel = null; }
});
UI.runs.bind(viewer);

const orb = createOrb($('#stage'), {
  mode: 'brain', labels: $('#labels'),
  onHover: (n, x, y) => {
    if (!n) return showTip(null);
    if (n.ring) {
      const r = n.ring;
      return showTip(r.kind === 'rutina'
        ? `<b>${esc(r.name)}</b><div class="p">Rutina · ${r.ref.unica ? 'única' : (r.ref.hora || 'sin horario') + ' h'} · ${r.ref.activa ? 'activa' : 'apagada'}</div>`
        : `<b>${esc(r.name)}</b><div class="p">${esc(r.ref.desc)}</div>`, x, y);
    }
    showTip(nodeTip(n) + '<div class="p">Doble clic: ver completo</div>', x, y);
  },
  onPick: n => select(n),
  onOpen: n => { select(n); viewer.open(n); },
  onRingPick: it => setView(it.kind === 'rutina' ? 'routines' : 'skills')
});

function select(n) {
  if (!n) return;
  drawer.open(n);
  if (view === 'orbs') orb.focus(n.id);
  if (view === 'map') { mapState.sel = n.id; centerMapOn(n.id); }
  history.replaceState(null, '', location.pathname + location.search + '#' + n.id);
}

// ---------- anillo de aplicaciones (hexágonos) ----------
const hexring = $('#hexring');
const stClass = s => ({ 'conectado': '', 'otra cuenta': 'st-otra', 'falla': 'st-falla', 'sin autorizar': 'st-off', 'fuera de Claude': 'st-fuera' })[s] ?? '';
const hexes = B.apps.map(a => {
  const el = document.createElement('div');
  el.className = 'hex ' + stClass(a.estado);
  el.innerHTML = icon(a.icono);
  el.onmousemove = e => showTip(`<b>${esc(a.nombre)}</b><div class="p">${esc(a.estado)}${a.nota ? ' · ' + esc(a.nota) : ''}${a.llamadas ? ' · ' + a.llamadas + ' llamadas' : ''}</div>`, e.clientX, e.clientY);
  el.onmouseleave = () => showTip(null);
  el.onclick = () => setView('apps');
  hexring.appendChild(el); return el;
});
const appsLabel = document.createElement('div'); appsLabel.className = 'ringlabel'; appsLabel.textContent = B.apps.length ? 'Aplicaciones' : ''; hexring.appendChild(appsLabel);
// El anillo se ajusta al espacio libre: no tapa el encabezado, la leyenda, las cifras ni la ficha.
// El hexágono que aun así choque con un panel (por ejemplo al acercar la esfera) se oculta.
let panels = [], panelsAt = 0;
const panelRects = () => {
  if (performance.now() - panelsAt > 400) {
    panelsAt = performance.now();
    panels = ['.top .left', '.top .right', '#legend', '#stats', '.drawer.open'].map(s => document.querySelector(s))
      .filter(e => e && e.getClientRects().length).map(e => e.getBoundingClientRect()).filter(r => r.width && r.height);   // los paneles fijos no tienen offsetParent
  }
  return panels;
};
const placeHexes = () => {
  if (view !== 'orbs') return;
  const f = orb.screenFrame(), P = panelRects();
  const head = Math.max(0, ...P.filter(r => r.top < 40).map(r => r.bottom)), leg = P.find(r => r.left < 60 && r.top > 120);
  const Ry = Math.max(f.R * 1.06, Math.min(f.R * 1.41, f.cy - head - 40));
  const Rx = Math.max(f.R * 1.18, Math.min(f.R * 1.72, f.cx - (leg ? leg.right : 0) - 40, innerWidth - f.cx - 56));
  const hit = (x, y, w, h) => x - w < 4 || x + w > innerWidth - 4 || y - h < head + 8 || y + h > innerHeight - 4
    || P.some(r => x + w + 6 > r.left && x - w - 6 < r.right && y + h + 6 > r.top && y - h - 6 < r.bottom);
  const n = hexes.length, a0 = Math.PI * 0.62, span = Math.PI * 1.76;
  hexes.forEach((el, i) => {
    const a = a0 + (n > 1 ? i / (n - 1) : 0.5) * span, x = f.cx + Math.cos(a) * Rx, y = f.cy + Math.sin(a) * Ry;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.classList.toggle('hid', hit(x, y, 22, 25));
  });
  const la = a0 + span * 0.86, lx = f.cx + Math.cos(la) * Rx + 84, ly = f.cy + Math.sin(la) * Ry;
  appsLabel.style.left = lx + 'px'; appsLabel.style.top = ly + 'px';
  appsLabel.classList.toggle('hid', hit(lx, ly, 46, 10));
};
orb.onFrame(placeHexes); setTimeout(placeHexes, 400);
window.addEventListener('resize', () => setTimeout(placeHexes, 60));

// ---------- búsqueda ----------
const total = B.nodes.length + B.memory.length;
let query = '';
const search = UI.mountSearch($('#search'), {
  placeholder: `Buscar en ${total.toLocaleString('es-MX')} archivos…`,
  onPick: n => select(n),
  onQuery: q => {
    query = q; const set = UI.matchSet(q);
    orb.setFilter(set); mapState.filter = set; if (view === 'timeline') renderTimeline();
  }
});
// Buscar con /: el buscador pasa al centro, grande, y lo demás se apaga. Una búsqueda nueva cierra la ficha abierta.
// Esc o un clic fuera lo regresan a su lugar; lo escrito se queda como filtro.
search.input.addEventListener('focus', () => {
  if (view !== 'orbs' && view !== 'map' && view !== 'timeline') return;
  if (drawer.isOpen) drawer.close();
  $('#menu').classList.remove('open'); showTip(null);
  document.body.classList.add('sfocus');
});
search.input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== search.input) document.body.classList.remove('sfocus'); }, 160));

// ---------- leyenda, cifras, menú ----------
// Si la leyenda no cabe, la lista se desplaza dentro de la caja con un degradado que avisa que hay más.
const catOff = new Set();
function renderLegend() {
  const cats = [...UI.CAT_ORDER, 'memoria'];
  const prev = ($('#legend .lgscroll') || {}).scrollTop || 0;
  $('#legend').innerHTML = `<div class="lgscroll"><div class="lgh">Zonas</div>` + cats.map(c => {
    const n = c === 'memoria' ? B.memory.length : (B.cats[c] || 0);
    return `<button data-c="${c}" class="${catOff.has(c) ? 'off' : ''}"><span class="dot" style="color:${CAT_COLOR[c]}"></span><span class="lt">${esc(B.catLabel[c])}</span><span class="n">${n.toLocaleString('es-MX')}</span></button>`;
  }).join('') + '</div>';
  $('#legend').querySelectorAll('button').forEach(b => b.onclick = () => {
    const c = b.dataset.c; catOff.has(c) ? catOff.delete(c) : catOff.add(c);
    orb.setCatOff(catOff); if (mapState.built && !mapState.touched) fitMap(); renderLegend();
  });
  $('#legend .lgscroll').scrollTop = prev;
  legendFade();
}
// degradado arriba o abajo según lo que quede fuera de la vista
function legendFade() {
  const s = $('#legend .lgscroll'); if (!s) return;
  const upd = () => { s.classList.toggle('fade-b', s.scrollTop + s.clientHeight < s.scrollHeight - 2); s.classList.toggle('fade-t', s.scrollTop > 2); };
  s.onscroll = upd; upd();
}
window.addEventListener('resize', legendFade);
renderLegend();
const pieces = UI.ALL.reduce((s, n) => s + n.pieces.length, 0);
// Cada dato en un solo lugar: el desglose por zona y la memoria ya están en la leyenda.
// «archivos» cuenta lo mismo que el buscador: tu Knowledge más la memoria de Claude.
$('#stats').innerHTML = [
  [(B.nodes.length + B.memory.length).toLocaleString('es-MX'), 'archivos'], [pieces.toLocaleString('es-MX'), 'piezas'],
  [B.links.length.toLocaleString('es-MX'), 'conexiones'], [UI.fdatetime(B.generado), 'escaneado']
].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');

const topFolders = Object.entries(B.folders).sort((a, b) => b[1] - a[1]).slice(0, 18);
$('#menu').innerHTML = `
  <h4 class="caps">Pantallas</h4>
  <a href="index.html">${icon('layout-dashboard')}Agentic OS</a>
  <button data-v="orbs">${icon('orbit')}Esfera 3D</button><button data-v="map">${icon('share-2')}Mapa 2D</button><button data-v="timeline">${icon('chart-gantt')}Línea de tiempo</button>
  <button data-v="routines">${icon('timer')}Rutinas</button><button data-v="skills">${icon('zap')}Skills</button><button data-v="apps">${icon('plug')}Aplicaciones y pendientes</button><button data-v="artifacts">${icon('inbox')}Artifacts</button>
  <h4 class="caps" style="margin-top:14px">Acciones</h4>
  <button data-act="ask">${icon('message-circle-question')}Preguntarle a mi Knowledge</button>
  <button data-act="pal">${icon('search')}Búsqueda global<span class="m">⌘K</span></button>
  <button data-act="scan">${icon('refresh-cw')}Actualizar desde Knowledge</button>
  <h4 class="caps" style="margin-top:14px">Carpetas con más archivos</h4>
  ${topFolders.map(([f, n]) => `<button data-q="${esc(f.split('/').pop())}">${icon(UI.folderIcon(f))}<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f)}</span><span class="m">${n}</span></button>`).join('')}`;
$('#menuBtn').onclick = () => $('#menu').classList.toggle('open');
// Esc cierra el menú. Si Esc ya cerró otra capa (ficha, visor…), el menú espera al siguiente Esc.
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !e.defaultPrevented && $('#menu').classList.contains('open')) { e.preventDefault(); $('#menu').classList.remove('open'); }
}, true);
$('#menu').querySelectorAll('[data-v]').forEach(b => b.onclick = () => { setView(b.dataset.v); $('#menu').classList.remove('open'); });
$('#menu').querySelectorAll('[data-q]').forEach(b => b.onclick = () => { if (view !== 'orbs' && view !== 'map' && view !== 'timeline') setView('orbs'); search.set(b.dataset.q); $('#menu').classList.remove('open'); });
$('#menu').querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
  $('#menu').classList.remove('open');
  if (b.dataset.act === 'ask') UI.runDialog(null);
  if (b.dataset.act === 'pal') palette.open();
  if (b.dataset.act === 'scan') UI.rescan($('#reload'));
});
document.addEventListener('click', e => { if (!e.target.closest('#menu,#menuBtn')) $('#menu').classList.remove('open'); });
// La rueda sobre el encabezado mueve la vista de abajo: el desplazamiento funciona en toda la pantalla.
$('.top').addEventListener('wheel', e => {
  const v = document.querySelector('.view.on');
  if (v && !e.target.closest('.results') && !document.body.classList.contains('sfocus')) v.scrollTop += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
}, { passive: true });

// ---------- motion ----------
let motion = 1;
function setMotion(m) {
  motion = clamp(m, 0, 1.5); orb.setMotion(motion);
  $('#slider i').style.width = (motion / 1.5 * 100) + '%'; $('#slider b').style.left = (motion / 1.5 * 100) + '%';
  $('#motionBtn').classList.toggle('on', motion > 0);
}
$('#motionBtn').onclick = () => setMotion(motion > 0 ? 0 : 1);
$('#slider').onpointerdown = e => {
  const r = e.currentTarget.getBoundingClientRect();
  const mv = ev => setMotion((ev.clientX - r.left) / r.width * 1.5);
  mv(e); window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => window.removeEventListener('pointermove', mv), { once: true });
};
setMotion(1);

// ---------- vistas ----------
const NAMES = { orbs: 'Esfera 3D', map: 'Mapa 2D', timeline: 'Línea de tiempo', routines: 'Rutinas', skills: 'Skills', apps: 'Apps', artifacts: 'Artifacts' };
const LAYOUTS = [['force', 'Fuerza'], ['circle', 'Círculo'], ['hex', 'Hex'], ['rings', 'Anillos']];
function setView(v) {
  if (!NAMES[v]) v = 'orbs';
  view = v;
  document.body.dataset.view = v;
  if (v !== 'orbs' && v !== 'map' && v !== 'timeline' && document.activeElement === search.input) search.input.blur();
  $('#tabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $('#viewname').textContent = NAMES[v] + (v === 'map' ? ' · ' + LAYOUTS.find(l => l[0] === mapState.mode)[1] : '');
  orb.setPaused(v !== 'orbs');
  document.body.classList.toggle('scrollview', !(v === 'orbs' || v === 'map'));
  $('#stage').style.visibility = v === 'orbs' ? '' : 'hidden';
  hexring.style.display = v === 'orbs' ? '' : 'none';
  $('#map').classList.toggle('on', v === 'map');
  $('#mapzoom').classList.toggle('on', v === 'map');
  $('#legend').style.display = (v === 'orbs' || v === 'map') ? '' : 'none';
  legendFade();
  $('#stats').style.display = v === 'orbs' ? '' : 'none';
  $('#search').style.display = (v === 'orbs' || v === 'map' || v === 'timeline') ? '' : 'none';
  $('#vctl').innerHTML = v === 'map' ? `<div class="seg" id="layouts">${LAYOUTS.map(([k, l]) => `<button data-l="${k}" class="${mapState.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : '';
  if (v === 'map') $('#layouts').querySelectorAll('button').forEach(b => b.onclick = () => setLayout(b.dataset.l));
  ['timeline', 'routines', 'skills', 'apps', 'artifacts'].forEach(k => $('#v-' + k).classList.toggle('on', k === v));
  if (drawer.isOpen && !(v === 'orbs' || v === 'map')) drawer.close();
  if (v === 'map') startMap();
  if (v === 'timeline') renderTimeline(true);
  if (v === 'routines') renderRoutines(true);
  if (v === 'skills') renderSkills(true);
  if (v === 'apps') renderApps(true);
  if (v === 'artifacts') renderArtifacts();
  // Las flechas, Re Pág/Av Pág y la barra espaciadora desplazan la vista sin tener que dar clic en ella antes
  const sec = $('#v-' + v);
  if (sec && !UI.typing()) { sec.tabIndex = -1; sec.focus({ preventScroll: true }); }
  showTip(null);
}
$('#tabs').querySelectorAll('button').forEach(b => b.onclick = () => setView(b.dataset.v));

// =============== MAPA 2D ===============
const mapState = { sel: null, hover: null, filter: null, k: 0.55, x: 0, y: 0, built: false, ticks: 0, mode: 'force', touched: false, looping: false };
const canvas = $('#map'), ctx = canvas.getContext('2d');
const CATS8 = [...UI.CAT_ORDER, 'memoria'];
const HUB0 = {};
let MN = [], ME = [];

function buildMap() {
  const hubs = {};
  const hubFor = (key, label, cat, depth) => {
    if (!hubs[key]) { hubs[key] = { id: 'h:' + key, hub: true, title: label, cat, depth, r: 5 }; MN.push(hubs[key]); }
    return hubs[key];
  };
  CATS8.forEach((c, i) => {
    const a = (i / CATS8.length) * Math.PI * 2;
    const h = hubFor('cat:' + c, B.catLabel[c], c, 0); h.x = Math.cos(a) * 700; h.y = Math.sin(a) * 520; h.r = 11; HUB0[c] = h;
  });
  const idx = {};
  for (const n of UI.ALL) {
    const m = { id: n.id, n, cat: n.cat, title: n.title, r: 2.2 + Math.sqrt(n.deg || 0) * 0.55 };
    idx[n.id] = m; MN.push(m);
    let parent = HUB0[n.cat];
    if (n.cat !== 'memoria' && n.folder !== '(raíz)') {
      let key = '';
      n.folder.split('/').forEach((p, d) => {
        key += '/' + p;
        const h = hubFor(key, p.replace(/\s*\[MX\]/, ''), n.cat, d + 1);
        if (!h.linked) { ME.push([parent, h, 1]); h.linked = true; }
        parent = h;
      });
    }
    ME.push([parent, m, 1]);
  }
  for (const [a, b] of B.links) if (idx[a] && idx[b]) ME.push([idx[a], idx[b], 0]);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (const m of MN) {
    if (m.x == null) { const c = HUB0[m.cat]; m.x = c.x + rnd() * 300; m.y = c.y + rnd() * 300; }
    m.vx = 0; m.vy = 0;
  }
}
function tick() {
  // Repulsión solo entre vecinos: los nodos se reparten en casillas de 300 (el alcance de la fuerza) y cada uno
  // se compara con su casilla y las 8 de alrededor. Así el mapa aguanta miles de archivos sin congelarse.
  const n = MN.length, CELL = 300, grid = new Map();
  for (let i = 0; i < n; i++) {
    const a = MN[i]; a._i = i; a._cx = Math.floor(a.x / CELL); a._cy = Math.floor(a.y / CELL);
    const key = a._cx + ',' + a._cy; let cell = grid.get(key); if (!cell) grid.set(key, cell = []); cell.push(a);
  }
  for (let i = 0; i < n; i++) {
    const a = MN[i];
    for (let gx = a._cx - 1; gx <= a._cx + 1; gx++) for (let gy = a._cy - 1; gy <= a._cy + 1; gy++) {
      const cell = grid.get(gx + ',' + gy); if (!cell) continue;
      for (const b of cell) {
        if (b._i <= i) continue;
        let dx = a.x - b.x, dy = a.y - b.y; const d2 = dx * dx + dy * dy + 1;
        if (d2 > 90000) continue;
        const f = (a.hub || b.hub ? 900 : 260) / d2; dx *= f; dy *= f;
        a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
      }
    }
  }
  for (const [a, b, tree] of ME) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) + .01;
    const L = tree ? (a.hub && b.hub ? 70 : 34) : 140, k = tree ? 0.02 : 0.0025;
    const f = (d - L) * k, fx = dx / d * f, fy = dy / d * f;
    a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
  }
  for (const m of MN) {
    if (m.depth === 0 && m.hub) { m.vx = m.vy = 0; continue; }
    m.vx -= m.x * 0.0006; m.vy -= m.y * 0.0006;
    m.x += m.vx *= 0.82; m.y += m.vy *= 0.82;
  }
}

// Celdas de un panal, en espiral desde el centro
function hexSpiral(n) {
  const out = [[0, 0]], dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (let k = 1; out.length < n; k++) {
    let q = -k, r = k;
    for (const [dq, dr] of dirs) for (let s = 0; s < k; s++) { out.push([q, r]); q += dq; r += dr; }
  }
  return out.slice(0, n);
}
function layoutTargets(mode) {
  const files = MN.filter(m => !m.hub);
  const byCat = {};
  for (const c of CATS8) byCat[c] = files.filter(m => m.cat === c).sort((a, b) => (a.n.folder || '').localeCompare(b.n.folder || '') || a.title.localeCompare(b.title));
  for (const m of MN) { m.hide = mode !== 'force' && m.hub && m.depth > 0; if (m.hub) { m.tx = m.x; m.ty = m.y; } }
  if (mode === 'circle') {
    const N = files.length, R = Math.max(420, N * 7.4 / (2 * Math.PI));
    let i = 0;
    for (const c of CATS8) {
      const i0 = i;
      for (const m of byCat[c]) { const a = (i / N) * Math.PI * 2 - Math.PI / 2; m.tx = Math.cos(a) * R; m.ty = Math.sin(a) * R; i++; }
      const mid = ((i0 + i) / 2 / N) * Math.PI * 2 - Math.PI / 2;
      HUB0[c].tx = Math.cos(mid) * (R + 86); HUB0[c].ty = Math.sin(mid) * (R + 60);
    }
  } else if (mode === 'hex') {
    const S = 22, radius = n => S * (Math.ceil((-3 + Math.sqrt(12 * Math.max(n, 1) - 3)) / 6) + 0.8);
    const outer = UI.CAT_ORDER.filter(c => byCat[c].length);
    const rs = outer.map(c => radius(byCat[c].length)), gap = 46;
    const rMem = radius(byCat.memoria.length);
    const totalArc = rs.reduce((s, r) => s + 2 * r + gap, 0);
    const Rc = Math.max(totalArc / (2 * Math.PI), rMem + Math.max(...rs) + gap);
    const place = (c, cx, cy, r) => {
      const arr = [...byCat[c]].sort((a, b) => (b.n.deg || 0) - (a.n.deg || 0));
      hexSpiral(arr.length).forEach(([q, rr], i) => { arr[i].tx = cx + S * (q + rr / 2); arr[i].ty = cy + S * 0.866 * rr; });
      HUB0[c].tx = cx; HUB0[c].ty = cy - r - 16;
    };
    place('memoria', 0, 0, rMem);
    let acc = 0;
    outer.forEach((c, i) => {
      const a = ((acc + rs[i] + gap / 2) / totalArc) * Math.PI * 2 - Math.PI / 2;
      acc += 2 * rs[i] + gap;
      place(c, Math.cos(a) * Rc, Math.sin(a) * Rc, rs[i]);
    });
  } else if (mode === 'rings') {
    // Anillos, como en la referencia: la memoria al centro y cada zona en su sector del anillo,
    // con sus archivos en arcos de adentro hacia afuera.
    const core = byCat.memoria;
    const r0 = core.length ? Math.max(40, Math.sqrt(core.length) * 8.4) : 0;
    core.forEach((m, i) => { const r = r0 * Math.sqrt((i + 0.5) / core.length), a = i * GOLD; m.tx = Math.cos(a) * r; m.ty = Math.sin(a) * r; });
    HUB0.memoria.tx = 0; HUB0.memoria.ty = 0; HUB0.memoria.dir = null;
    ringSectors(UI.CAT_ORDER.filter(c => byCat[c].length).map(c => ({ c, arr: byCat[c] })), r0 ? r0 + 30 : 46);
  }
}
const GOLD = Math.PI * (3 - Math.sqrt(5));
// Reparte las zonas en sectores: el ángulo crece con la raíz de sus puntos, con un mínimo para que quepa la etiqueta.
function ringSectors(zs, R1) {
  if (!zs.length) return;
  const GAP = zs.length > 1 ? 0.06 : 0, MIN = Math.min(0.24, (Math.PI * 2 - GAP * zs.length) / zs.length), TOT = Math.PI * 2 - GAP * zs.length;
  const w = zs.map(z => Math.sqrt(z.arr.length));
  let ang = w.map(v => TOT * v / w.reduce((s, x) => s + x, 0));
  for (let it = 0; it < 5; it++) {
    const small = ang.map(a => a <= MIN + 1e-9), rest = w.reduce((s, v, i) => s + (small[i] ? 0 : v), 0);
    ang = w.map((v, i) => small[i] ? MIN : (TOT - MIN * small.filter(Boolean).length) * v / (rest || 1));
  }
  const DR = 13, PITCH = 13;
  let a = -Math.PI / 2 - ang[0] / 2;
  zs.forEach((z, i) => {
    const a0 = a, a1 = a + ang[i];
    a = a1 + GAP;
    let r = R1, k = 0;
    while (k < z.arr.length) {
      const cap = Math.max(1, Math.floor((a1 - a0) * r / PITCH)), take = Math.min(cap, z.arr.length - k);
      for (let j = 0; j < take; j++) { const t = a0 + (j + 0.5) / take * (a1 - a0), m = z.arr[k++]; m.tx = Math.cos(t) * r; m.ty = Math.sin(t) * r; }
      r += DR;
    }
    const mid = (a0 + a1) / 2, h = HUB0[z.c];
    h.tx = Math.cos(mid) * (r + 6); h.ty = Math.sin(mid) * (r + 6); h.dir = [Math.cos(mid), Math.sin(mid)];
  });
}
const target = m => mapState.mode === 'force' ? [m.x, m.y] : [m.tx, m.ty];
function animate() {
  for (const m of MN) {
    const [tx, ty] = target(m), ex = tx - m.dx, ey = ty - m.dy;
    if (Math.abs(ex) + Math.abs(ey) > 0.4) { m.dx += ex * 0.16; m.dy += ey * 0.16; } else { m.dx = tx; m.dy = ty; }
  }
}
function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const toScreen = m => [innerWidth / 2 + (m.dx + mapState.x) * mapState.k, innerHeight / 2 + 46 + (m.dy + mapState.y) * mapState.k];
function fitMap() {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  for (const m of MN) {
    if (m.hide || catOff.has(m.cat)) continue;
    const [tx, ty] = target(m);
    x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx); y1 = Math.max(y1, ty); n++;
  }
  if (!n) return;
  // margen para las etiquetas de zona: en anillos van por fuera de su sector; en círculo y panal, centradas en su punto
  ctx.font = '600 13px "Red Hat Text", sans-serif';
  const lw = Math.max(0, ...CATS8.filter(c => !catOff.has(c)).map(c => ctx.measureText(B.catLabel[c] + ' · ' + (c === 'memoria' ? B.memory.length : (B.cats[c] || 0))).width));
  const padX = mapState.mode === 'rings' ? lw + 22 : mapState.mode === 'force' ? 24 : lw / 2 + 16, padY = 30;
  const fa = freeArea(), k = clamp(Math.min(Math.max(160, fa.x1 - fa.x0 - 2 * padX) / (x1 - x0 + 1), Math.max(160, fa.y1 - fa.y0 - 2 * padY) / (y1 - y0 + 1)) * 0.96, 0.1, 2.4);
  mapState.k = k;
  mapState.x = ((fa.x0 + fa.x1) / 2 - innerWidth / 2) / k - (x0 + x1) / 2;
  mapState.y = ((fa.y0 + fa.y1) / 2 - innerHeight / 2 - 46) / k - (y0 + y1) / 2;
}
// Lo que queda libre para el mapa: a la derecha de la leyenda, debajo del encabezado y, si está abierta, a la izquierda de la ficha.
function freeArea(withDrawer) {
  const lg = $('#legend'), r = lg && lg.getClientRects().length ? lg.getBoundingClientRect() : null;
  return { x0: r && r.width ? r.right + 28 : 40, x1: withDrawer && drawer.isOpen ? innerWidth - 450 : innerWidth - 40, y0: 176, y1: innerHeight - 50 };
}
function setLayout(mode) {
  if (!LAYOUTS.some(l => l[0] === mode)) return;
  mapState.mode = mode;
  if (mapState.built) { layoutTargets(mode); mapState.touched = false; fitMap(); }
  const seg = $('#layouts');
  if (seg) seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.l === mode));
  if (view === 'map') $('#viewname').textContent = 'Mapa 2D · ' + LAYOUTS.find(l => l[0] === mode)[1];
}
function hexPath(x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath();
}
function drawMap() {
  if (view !== 'map' || !mapState.built) return;
  const W = innerWidth, H = innerHeight, mode = mapState.mode, k = mapState.k;
  ctx.fillStyle = '#060607'; ctx.fillRect(0, 0, W, H);
  const focus = mapState.sel || mapState.hover;
  const nb = focus ? new Set([focus, ...(UI.ADJ[focus] || [])]) : null;
  const filter = mapState.filter;
  const vis = m => !m.hide && !catOff.has(m.cat) && (!filter || m.hub || filter.has(m.id));
  for (const m of MN) { const p = toScreen(m); m.px = p[0]; m.py = p[1]; }
  const cx = W / 2 + mapState.x * k, cy = H / 2 + 46 + mapState.y * k;
  ctx.lineWidth = 1;
  for (const [a, b, tree] of ME) {
    if (!vis(a) || !vis(b)) continue;
    if (tree && mode !== 'force') continue;
    const hot = nb && (a.id === focus || b.id === focus);
    if (!hot && mode === 'hex') continue;
    ctx.strokeStyle = hot ? 'rgba(255,200,170,.8)' : tree ? CAT_COLOR[a.cat] + (nb ? '10' : '26') : 'rgba(255,255,255,' + (nb || filter ? .012 : .032) + ')';
    ctx.beginPath(); ctx.moveTo(a.px, a.py);
    if (mode === 'circle' || mode === 'rings') {
      const mx = (a.px + b.px) / 2, my = (a.py + b.py) / 2;
      ctx.quadraticCurveTo(cx + (mx - cx) * 0.35, cy + (my - cy) * 0.35, b.px, b.py);
    } else ctx.lineTo(b.px, b.py);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const m of MN) {
    if (!vis(m)) continue;
    const c = CAT_COLOR[m.cat];
    const dim = nb && !nb.has(m.id) ? .22 : 1;
    if (m.hub) {
      if (mode !== 'force') continue;
      ctx.strokeStyle = c; ctx.globalAlpha = .7 * (nb ? .5 : 1); ctx.lineWidth = m.depth === 0 ? 2 : 1.2;
      ctx.beginPath(); ctx.arc(m.px, m.py, m.r * Math.max(.7, k * 1.3), 0, 7); ctx.stroke();
    } else if (mode === 'hex') {
      ctx.globalAlpha = dim * (m.id === focus ? 1 : .42 + Math.min(m.n.deg || 0, 24) / 24 * .5);
      hexPath(m.px, m.py, 10.2 * k); ctx.fillStyle = c; ctx.fill();
    } else if (MN.length > 1500) {   // con miles de archivos, punto sólido: el degradado por punto sale caro
      ctx.globalAlpha = dim * .85; ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(m.px, m.py, m.r * Math.max(.7, k * 1.3) * 1.2, 0, 7); ctx.fill();
    } else {
      const r = m.r * Math.max(.7, k * 1.3);
      const g = ctx.createRadialGradient(m.px, m.py, 0, m.px, m.py, r * 3);
      g.addColorStop(0, c); g.addColorStop(.35, c + '88'); g.addColorStop(1, c + '00');
      ctx.globalAlpha = dim * .92; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(m.px, m.py, r * 3, 0, 7); ctx.fill();
    }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // etiquetas de zona: primero las zonas más grandes; la que se enciman con otra no se dibuja
  const placed = [], cnt = c => c === 'memoria' ? B.memory.length : (B.cats[c] || 0);
  for (const m of [...MN].sort((a, b) => (b.hub && b.depth === 0 ? cnt(b.cat) : -1) - (a.hub && a.depth === 0 ? cnt(a.cat) : -1))) {
    if (!m.hub || !m.title || catOff.has(m.cat)) continue;
    if (m.depth === 0) {
      ctx.font = '600 13px "Red Hat Text", sans-serif';
      const label = mode === 'force' ? m.title : m.title + ' · ' + cnt(m.cat);
      const w = ctx.measureText(label).width;
      let lx = m.px, ly = mode === 'force' ? m.py - m.r * k * 1.3 - 8 : m.py;
      if (mode === 'rings' && m.dir) { lx += m.dir[0] * (w / 2 + 6); ly += m.dir[1] * 12 + 4; }   // por fuera de su sector
      if (placed.some(q => Math.abs(q.x - lx) < (q.w + w) / 2 + 10 && Math.abs(q.y - ly) < 24)) continue;
      placed.push({ x: lx, y: ly, w });
      if (mode !== 'force') { ctx.fillStyle = 'rgba(6,6,7,.82)'; ctx.fillRect(lx - w / 2 - 8, ly - 15, w + 16, 22); }
      ctx.fillStyle = CAT_COLOR[m.cat]; ctx.fillText(label, lx, ly);
    } else if (mode === 'force' && m.depth === 1 && k >= 0.9) {
      ctx.font = '500 12px "Red Hat Text", sans-serif'; ctx.fillStyle = 'rgba(236,232,225,.6)';
      ctx.fillText(m.title.slice(0, 26), m.px, m.py - m.r * k * 1.3 - 8);
    }
  }
  if (focus) {
    const m = MN.find(q => q.id === focus);
    if (m && vis(m)) {
      ctx.font = '500 13px "Red Hat Text", sans-serif';
      const t = m.title.slice(0, 60), w = ctx.measureText(t).width;
      ctx.fillStyle = 'rgba(6,6,7,.85)'; ctx.fillRect(m.px - w / 2 - 6, m.py - 30, w + 12, 18);
      ctx.fillStyle = '#fff'; ctx.fillText(t, m.px, m.py - 17);
    }
  }
}
function startMap() {
  sizeCanvas();
  if (!mapState.built) {
    buildMap(); mapState.built = true;
    for (let i = 0; i < 140; i++) tick();   // se acomoda antes del primer dibujo
    mapState.ticks = 140;
    for (const m of MN) { m.dx = m.x; m.dy = m.y; }
    layoutTargets(mapState.mode); fitMap();
  }
  drawMap();
  if (mapState.looping) return;
  mapState.looping = true;
  const loop = () => {
    if (view !== 'map') { mapState.looping = false; return; }
    if (mapState.mode === 'force' && mapState.ticks < 300) {
      tick(); tick(); mapState.ticks += 2;
      if (!mapState.touched && mapState.ticks % 20 === 0) fitMap();
    }
    animate(); drawMap(); requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
function centerMapOn(id) {
  const m = MN.find(q => q.id === id); if (!m) return;
  const [tx, ty] = target(m), fa = freeArea(true);
  mapState.k = Math.max(mapState.k, 1.1); mapState.touched = true;
  mapState.x = ((fa.x0 + fa.x1) / 2 - innerWidth / 2) / mapState.k - tx;
  mapState.y = ((fa.y0 + fa.y1) / 2 - innerHeight / 2 - 46) / mapState.k - ty;
}
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, ox: mapState.x, oy: mapState.y, moved: false }; canvas.style.cursor = 'grabbing'; });
window.addEventListener('pointerup', e => {
  if (drag && !drag.moved && view === 'map' && e.target === canvas) {
    hoverAt(e.clientX, e.clientY);
    const m = MN.find(q => q.id === mapState.hover);
    if (m && m.n) select(m.n);
  }
  if (drag) canvas.style.cursor = 'grab';
  drag = null;
});
function hoverAt(x, y) {
  let best = null, bd = 14;
  const filter = mapState.filter;
  for (const m of MN) {
    if (m.hub || catOff.has(m.cat) || (filter && !filter.has(m.id))) continue;
    const [sx, sy] = toScreen(m), d = Math.hypot(sx - x, sy - y);
    if (d < bd) { bd = d; best = m; }
  }
  mapState.hover = best ? best.id : null;
  return best;
}
canvas.addEventListener('pointermove', e => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.moved) { mapState.x = drag.ox + dx / mapState.k; mapState.y = drag.oy + dy / mapState.k; mapState.touched = true; }
    return;
  }
  const best = hoverAt(e.clientX, e.clientY);
  canvas.style.cursor = best ? 'pointer' : 'grab';
  best ? showTip(nodeTip(best.n), e.clientX, e.clientY) : showTip(null);
});
canvas.addEventListener('dblclick', e => { const best = hoverAt(e.clientX, e.clientY); if (best) { select(best.n); viewer.open(best.n); } });
canvas.addEventListener('pointerleave', () => { mapState.hover = null; showTip(null); });
function zoomAt(f, px, py) {
  const k0 = mapState.k, k1 = clamp(k0 * f, .1, 5);
  const cx = px - innerWidth / 2, cy = py - innerHeight / 2 - 46;
  mapState.x += cx / k1 - cx / k0; mapState.y += cy / k1 - cy / k0; mapState.k = k1; mapState.touched = true;
}
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * .0015), e.clientX, e.clientY); }, { passive: false });
$('#mapzoom').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !mapState.built) return;
  if (b.dataset.z === 'fit') { mapState.touched = false; fitMap(); }
  else zoomAt(b.dataset.z === 'in' ? 1.3 : 1 / 1.3, innerWidth / 2, innerHeight / 2 + 46);
  drawMap();
});
window.addEventListener('resize', () => { if (view === 'map') { sizeCanvas(); if (!mapState.touched) fitMap(); drawMap(); } });

// =============== LÍNEA DE TIEMPO, RUTINAS, SKILLS Y APPS ===============
// Viven en js/vistas.js (el mismo archivo en las dos copias del panel). Aquí solo se conectan.
const V = mountVistas({ showTip, nodeTip, viewer, query: () => query, setView: v => setView(v) });
function renderTimeline(fresh) { V.timeline($('#v-timeline'), fresh); }
function renderRoutines(fresh) { V.routines($('#v-routines'), fresh); }
function renderSkills(fresh) { V.skills($('#v-skills'), fresh); }
function renderApps(fresh) { V.apps($('#v-apps'), fresh); }

// =============== ARTIFACTS ===============
// La vista vive en js/vistas.js; aquí van las pestañas y los textos propios de este panel.
function renderArtifacts() {
  V.artifacts($('#v-artifacts'), {
    order: ['Knowledge', 'CC', 'Video', 'claude.ai'],
    foot: 'Todo lo que Claude te ha hecho, en un solo lugar: entregables de tu Knowledge y lo publicado en claude.ai. Lo que está en los dos lados va en una sola tarjeta. Clic en una tarjeta para verla.',
    empty: ['Tu bandeja está vacía', 'Aquí aparece solo lo que Claude te entrega: entregables de tu Knowledge y lo publicado en claude.ai.']
  });
}

// ---------- búsqueda global ----------
const palette = UI.mountPalette({
  slash: true,   // en las vistas sin buscador (rutinas, skills, apps, artifacts), / abre la búsqueda global
  actions: [
    { icon: 'layout-dashboard', label: 'Ir al Agentic OS', run: () => { location.href = 'index.html'; } },
    { icon: 'orbit', label: 'Vista Esfera 3D', keys: 'esfera orbs', run: () => setView('orbs') },
    { icon: 'share-2', label: 'Vista Mapa 2D', keys: 'fuerza circulo hex anillos', run: () => setView('map') },
    { icon: 'chart-gantt', label: 'Vista Línea de tiempo', keys: 'timeline', run: () => setView('timeline') },
    { icon: 'timer', label: 'Vista Rutinas', keys: 'tokens gasto', run: () => setView('routines') },
    { icon: 'zap', label: 'Vista Skills', keys: 'correr', run: () => setView('skills') },
    { icon: 'plug', label: 'Aplicaciones y pendientes', keys: 'mayordomo conectar', run: () => setView('apps') },
    { icon: 'inbox', label: 'Vista Artifacts', keys: 'bandeja entregables', run: () => setView('artifacts') },
    { icon: 'message-circle-question', label: 'Preguntarle a mi Knowledge', keys: 'claude correr', run: () => UI.runDialog(null) },
    { icon: 'refresh-cw', label: 'Actualizar desde Knowledge', keys: 'reescanear escanear', run: () => UI.rescan($('#reload')) }
  ],
  onFile: n => { if (view !== 'orbs' && view !== 'map') setView('orbs'); select(n); },
  onArtifact: a => UI.openArtifact(a, viewer),
  onSkill: s => s.run !== false ? UI.runDialog(s) : UI.copy('/' + s.id, '/' + s.id + ' copiado: pégalo en Claude')
});

// ---------- arranque desde la URL ----------
document.body.dataset.view = view;
const params = new URLSearchParams(location.search);
if (params.get('layout')) mapState.mode = LAYOUTS.some(l => l[0] === params.get('layout')) ? params.get('layout') : 'force';
if (params.get('f')) V.setArtFilter(params.get('f'));
if (params.get('view')) setView(params.get('view'));
if (params.get('q')) search.set(params.get('q'));
if (params.get('focus') === 'search') setTimeout(() => search.input.focus(), 300);
const startId = location.hash.slice(1);
if (startId && UI.BYID[startId]) setTimeout(() => { select(UI.BYID[startId]); if (params.get('open')) viewer.open(UI.BYID[startId]); }, 500);

// Para revisar el estado desde la consola del navegador
window.MOCA = { mapState, orb, viewer, palette, setView, setLayout, drawMap, startMap, fitMap, settle() { for (let i = 0; i < 80; i++) animate(); drawMap(); }, get nodes() { return MN; } };
