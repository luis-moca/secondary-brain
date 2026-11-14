// Vistas de Second Brain: línea de tiempo, rutinas, apps y skills.
// El mismo archivo vive en las dos copias del panel. Zonas, colores y etiquetas salen de UI
// (ZONE_* en la portátil, CAT_* en la original); aquí no hay nombres, rutas ni zonas fijas.
const UI = window.UI, B = UI.B;
const { icon, esc } = UI;

const ZORDER = UI.ZONE_ORDER || UI.CAT_ORDER || [];
const ZCOLOR = UI.ZONE_COLOR || UI.CAT_COLOR || {};
const zlabel = k => k === 'memoria' ? 'Memoria' : (UI.zlabel ? UI.zlabel(k) : ((B.catLabel || {})[k] || k));
const zcolor = k => ZCOLOR[k] || '#cfcac2';
const G = { app: 'var(--g-app)', rut: 'var(--g-rut)', skill: 'var(--g-skill)' };

// ---------- utilidades ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const p2 = n => String(n).padStart(2, '0');
const dkey = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;   // fecha local, igual que uso.py
const sod = d => { d = new Date(d); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d, n) => { d = new Date(d); d.setDate(d.getDate() + n); return d; };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const SEMANA = [[1, 'L'], [2, 'M'], [3, 'M'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']];
const nInt = n => Math.round(+n || 0).toLocaleString('es-MX');
const tk = n => UI.fnum(n);
const usd = v => { v = +v || 0; if (!v) return '$0'; if (v < 0.01) return '<$0.01'; if (v < 100) return '$' + v.toFixed(2); return '$' + Math.round(v).toLocaleString('es-MX'); };
const usdx = v => { v = +v || 0; return v ? '$' + v.toFixed(v < 1 ? 4 : 2) : '$0'; };
const fday = d => `${DIAS[d.getDay()]} ${d.getDate()} ${UI.MES[d.getMonth()]}`;
const plural = (n, a, b) => `${nInt(n)} ${n === 1 ? a : b}`;
const short = id => String(id).split(':').pop();
const tipAttr = html => ` data-tip="${esc(html)}"`;
const vEmpty = (ic, t, s) => `<div class="vs-empty">${icon(ic)}<b>${esc(t)}</b><span>${s}</span></div>`;
const seg = (id, opts, cur) => `<div class="seg vs-seg" data-seg="${id}">${opts.map(([v, l, t]) => `<button data-v="${esc(v)}" class="${String(cur) === String(v) ? 'on' : ''}"${t ? tipAttr(t) : ''}>${l}</button>`).join('')}</div>`;
const sumLine = (label, parts) => `<div class="vs-sum"><span class="vs-k">${label}</span>${parts.filter(Boolean).map(([v, u, t]) => `<span class="vs-v"${t ? tipAttr(t) : ''}><b>${v}</b>${u ? ' ' + u : ''}</span>`).join('<i>·</i>')}</div>`;
// Origen de una skill, aparte de su nombre corto: el plugin (lo que va antes de «:»), «tuya» si su SKILL.md
// está en tus archivos, o «comando» si solo se vio en tus sesiones. Así «/schedule» se distingue de «/schedule».
const skOrigin = s => String(s.id).includes(':') ? String(s.id).split(':')[0] : s.nodo ? 'tuya' : 'comando';
const skName = s => `/${esc(short(s.id))}<span class="org"> · ${esc(skOrigin(s))}</span>`;
const words = s => (UI.norm ? UI.norm(s) : String(s || '').toLowerCase()).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter(w => w.length > 3);

// Vacío de un filtro que no encontró nada: misma línea que las ilustraciones del inicio (UI.illus): una lupa sobre tarjetas vacías.
const ILL_NORES = `<svg class="illus" viewBox="0 0 220 96" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <rect class="il-s il-dim" x="18" y="22" width="58" height="44" rx="7"/><rect class="il-s il-dim" x="84" y="22" width="58" height="44" rx="7"/>
  <path class="il-s il-dim" d="M28 54h26M94 54h20"/><path class="il-dash" d="M28 32h30M94 32h34"/>
  <circle class="il-s" cx="170" cy="46" r="20"/><path class="il-s" d="M184.5 60.5L200 76"/><path class="il-s" d="M163 39l14 14M177 39l-14 14"/></svg>`;
const emptyFilter = (title, text, btn) => `<div class="empty-ill big vs-nores">${ILL_NORES}<b>${esc(title)}</b><span>${text}</span><button class="btn" data-clear>${icon('x')}${esc(btn || 'Limpiar filtro')}</button></div>`;

// ---------- rótulos de burbuja: se mide el texto real (no se cuentan letras) ----------
// En orden: nombre y cifra; nombre en dos renglones y cifra; la cifra corta; solo el nombre (uno o dos renglones);
// el nombre recortado si caben al menos cinco letras; o nada (el detalle sale al pasar el cursor). Nunca fuera de la figura.
const MEAS = document.createElement('canvas').getContext('2d');
const LFONT = { bn: '600 12.5px "Red Hat Text", sans-serif', bo: '500 12px "Red Hat Text", sans-serif', bm: '500 12px "Red Hat Display", sans-serif' };
const textW = (t, cls) => { MEAS.font = LFONT[cls]; return MEAS.measureText(t).width; };
const LH = 15;
// medio ancho útil de la figura a la altura y: círculo, hexágono con punta arriba o cuadrado
const halfW = (shape, r, y) => {
  y = Math.abs(y); if (y >= r) return 0;
  if (shape === 'hex') return y <= r / 2 ? r * 0.866 : (r - y) * 1.732;
  if (shape === 'square') return y <= r * 0.84 ? r * 0.84 : 0;
  return Math.sqrt(r * r - y * y);
};
// el corte (espacio, guion, dos puntos, punto medio) que deja el renglón más largo lo más corto posible
function split2(t) {
  let best = null;
  for (let i = 1; i < t.length - 1; i++) {
    const ch = t[i]; if (!/[\s\-_:·./]/.test(ch)) continue;
    const a = (ch === ' ' ? t.slice(0, i) : t.slice(0, i + 1)).trim(), b = t.slice(i + 1).trim();
    if (a.length < 2 || b.length < 2) continue;
    const w = Math.max(textW(a, 'bn'), textW(b, 'bn'));
    if (!best || w < best.w) best = { a, b, w };
  }
  return best;
}
function fitLabel(c, r) {
  const line = (t, cls) => ({ t, cls, w: textW(t, cls) });
  const fits = lines => {
    const H = lines.length * LH;
    return lines.every((l, i) => { const top = -H / 2 + i * LH + 1, bot = top + 12.5; return l.w <= 2 * Math.min(halfW(c.shape, r, top), halfW(c.shape, r, bot)) - 10; });
  };
  const sp = split2(c.name), names = [[line(c.name, 'bn')], sp && [line(sp.a, 'bn'), line(sp.b, 'bn')]].filter(Boolean);
  const mets = [c.metric, c.metricShort].filter((m, i, a) => m && a.indexOf(m) === i).map(m => line(m, 'bm'));
  const subs = c.sub ? [[line(c.sub, 'bo')], []] : [[]];
  const tries = [];
  for (const s of subs) {
    for (const m of mets) for (const n of names) tries.push([...n, ...s, m]);
    for (const n of names) tries.push([...n, ...s]);
  }
  let best = tries.find(fits);
  for (let k = c.name.length - 1; !best && k >= 5; k--) { const t = [line(c.name.slice(0, k).replace(/[\s\-_:·./]+$/, '') + '…', 'bn')]; if (fits(t)) best = t; }
  if (!best) return '';
  const H = best.length * LH;
  return best.map((l, i) => `<text class="${l.cls}" y="${(-H / 2 + i * LH + 11).toFixed(1)}">${esc(l.t)}</text>`).join('');
}
// La medida necesita la letra ya cargada: si una vista se dibuja antes, se vuelve a dibujar al llegar.
let fontsOk = !document.fonts;
const fontsReady = document.fonts ? Promise.all(Object.values(LFONT).map(f => document.fonts.load(f))).catch(() => {}).then(() => { fontsOk = true; }) : Promise.resolve();

// Suma de un registro porDia dentro de los últimos `n` días (hoy incluido). Valor numérico o arreglo [a, b, c].
function lastDays(n) { const t = sod(new Date()), out = new Set(); for (let i = 0; i < n; i++) out.add(dkey(addDays(t, -i))); return out; }
function sumDays(porDia, keys) {
  let out = null;
  for (const [k, v] of Object.entries(porDia || {})) {
    if (!keys.has(k)) continue;
    if (Array.isArray(v)) { out = out || v.map(() => 0); v.forEach((x, i) => { out[i] += +x || 0; }); } else out = (out || 0) + (+v || 0);
  }
  return out;
}

// ---------- acomodo de burbujas (círculos tangentes, el más grande al centro) ----------
function pack(cs, pad, ax) {
  const placed = [];
  const dist = (x, y) => (x / ax) * (x / ax) + y * y;
  for (const c of [...cs].sort((a, b) => b.r - a.r)) {
    if (!placed.length) { c.x = 0; c.y = 0; placed.push(c); continue; }
    if (placed.length === 1) { const a = placed[0]; c.x = a.x + a.r + c.r + pad; c.y = 0; placed.push(c); continue; }
    const cands = [];
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const A = placed[i], P = placed[j], da = A.r + c.r + pad, db = P.r + c.r + pad;
      const dx = P.x - A.x, dy = P.y - A.y, d = Math.hypot(dx, dy);
      if (!d || d > da + db || d < Math.abs(da - db)) continue;
      const a = (da * da - db * db + d * d) / (2 * d), h = Math.sqrt(Math.max(0, da * da - a * a));
      const mx = A.x + a * dx / d, my = A.y + a * dy / d;
      cands.push([mx - h * dy / d, my + h * dx / d], [mx + h * dy / d, my - h * dx / d]);
    }
    cands.sort((p, q) => dist(p[0], p[1]) - dist(q[0], q[1]));
    let best = cands.find(([x, y]) => placed.every(o => Math.hypot(o.x - x, o.y - y) >= o.r + c.r + pad - 0.01));
    if (!best) { const R = Math.max(...placed.map(o => Math.hypot(o.x, o.y) + o.r)); best = [R + c.r + pad, 0]; }
    c.x = best[0]; c.y = best[1]; placed.push(c);
  }
  return placed;
}
// Las que no tienen uso van en anillos alrededor del grupo, como en la referencia.
function ring(cs, placed, pad, q) {
  let t = 0, i = 0, n = 0;
  q = clamp(q || 1, 1, 1.5);
  for (const c of placed) t = Math.max(t, Math.hypot((Math.abs(c.x) + c.r) / q, Math.abs(c.y) + c.r));   // la elipse encierra a todo el grupo
  let rx = placed.length ? t * q + pad * 2 : 0, ry = placed.length ? t + pad * 2 : 0;
  while (i < cs.length) {
    const r = cs[i].r, a1 = rx + r + pad, b1 = ry + r + pad;
    const per = Math.PI * (3 * (a1 + b1) - Math.sqrt((3 * a1 + b1) * (a1 + 3 * b1)));
    const take = Math.min(Math.max(6, Math.floor(per / (2 * r + pad))), cs.length - i);
    for (let j = 0; j < take; j++) { const a = -Math.PI / 2 + (j + (n % 2) * 0.5) / take * Math.PI * 2; cs[i + j].x = Math.cos(a) * a1; cs[i + j].y = Math.sin(a) * b1; }
    i += take; n++; rx = a1 + r; ry = b1 + r;
  }
}
const hexPts = r => [...Array(6)].map((_, i) => { const a = Math.PI / 6 + i * Math.PI / 3; return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`; }).join(' ');
function shapeSVG(shape, r) {
  if (shape === 'hex') return `<polygon class="sh" points="${hexPts(r)}"/>`;
  if (shape === 'square') { const s = r * 0.84; return `<rect class="sh" x="${-s}" y="${-s}" width="${2 * s}" height="${2 * s}" rx="${(r * 0.22).toFixed(1)}"/>`; }
  return `<circle class="sh" r="${r.toFixed(1)}"/>`;
}
// Dibuja burbujas ya acomodadas dentro de un área W×H. items: {r, shape, name, metric, dim, i}
function bubblesSVG(items, W, H, color, gid) {
  if (!items.length) return '';
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of items) { x0 = Math.min(x0, c.x - c.r); y0 = Math.min(y0, c.y - c.r); x1 = Math.max(x1, c.x + c.r); y1 = Math.max(y1, c.y + c.r); }
  const big = items.filter(c => c.cls !== 'zero'), maxR = big.length ? Math.max(...big.map(c => c.r)) : 0;
  const k = Math.min((W - 24) / (x1 - x0), (H - 24) / (y1 - y0), maxR ? Math.min(W, H) * 0.34 / maxR : 1.6);
  const cx = W / 2 - (x0 + x1) / 2 * k, cy = H / 2 - (y0 + y1) / 2 * k;
  const g = items.map((c, n) => {
    const r = c.r * k, x = cx + c.x * k, y = cy + c.y * k;
    const lab = c.cls === 'zero' || r < 12 ? '' : fitLabel(c, r);
    const aria = [c.name, c.sub, c.metric].filter(Boolean).join(' · ');
    return `<g class="vs-b ${c.dim ? 'dim' : ''} ${c.cls || ''}" data-i="${c.i}" aria-label="${esc(aria)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><g class="vs-pop" style="--i:${Math.min(n, 30)}">${shapeSVG(c.shape, r)}${lab}</g></g>`;
  }).join('');
  return `<svg class="vs-bub" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="color:${color}">
    <defs><radialGradient id="${gid}" cx="50%" cy="42%" r="62%"><stop offset="0" stop-color="currentColor" stop-opacity=".2"/><stop offset="1" stop-color="currentColor" stop-opacity=".04"/></radialGradient></defs>
    <g style="--gfill:url(#${gid})">${g}</g></svg>`;
}

// ============================================================================
export function mountVistas(ctx) {
  const st = {
    tl: { range: 60, off: new Set() },
    rut: { filter: 'activas', sort: 'hora', dir: 1 },
    app: { filter: 'todas', win: 30, order: 'mas' },
    sk: { sort: 'costo', win: 30, used: 'todas', open: null },
    art: { filter: 'todos', q: '' }
  };
  const tip = (h, x, y) => ctx.showTip(h, x, y);
  // si la vista se dibujó antes de que llegara la letra, se vuelve a dibujar con la medida buena
  const afterFonts = (el, fn) => { if (fontsOk || el._vsFontWait) return; el._vsFontWait = true; fontsReady.then(() => { el._vsFontWait = false; if (el.classList.contains('on')) fn(el); }); };

  // Ayudas de interacción comunes: tooltips con data-tip y animación solo al entrar a la vista.
  function wire(el, fresh) {
    el.classList.toggle('vs-anim', !!fresh);
    if (el._vsWired) return;
    el._vsWired = true;
    el.addEventListener('mousemove', e => {
      if (e.target.closest('.vs-tl svg, .vs-bub, .vs-week')) return;   // esas zonas manejan su propio tooltip
      const t = e.target.closest('[data-tip]');
      t ? tip(t.dataset.tip, e.clientX, e.clientY) : (el._vsTipOn && tip(null));
      el._vsTipOn = !!t;
    });
    el.addEventListener('mouseleave', () => tip(null));
  }
  const onSeg = (el, id, fn) => el.querySelectorAll(`[data-seg="${id}"] button`).forEach(b => b.onclick = () => fn(b.dataset.v));

  // =============== LÍNEA DE TIEMPO ===============
  function timeline(el, fresh) {
    const q = (ctx.query && ctx.query()) || '';
    const set = q ? UI.matchSet(q) : null;
    const D = st.tl.range, today = sod(new Date()), t0 = addDays(today, -(D - 1));
    const days = [...Array(D)].map((_, i) => addDays(t0, i));
    const idx = new Map(days.map((d, i) => [dkey(d), i])), k0 = dkey(t0);
    const dayOfKey = k => idx.has(k) ? idx.get(k) : (k < k0 ? -1 : D - 1);
    const dayOf = iso => { const t = new Date(iso); return isNaN(t) ? -1 : dayOfKey(dkey(t)); };
    const zones = [...ZORDER.filter(k => UI.ALL.some(n => n.cat === k)), ...(B.memory.length ? ['memoria'] : [])];
    const hasUse = B.apps.some(a => a.porDia && Object.keys(a.porDia).length) || B.skills.some(s => s.uso) || B.routines.some(r => r.uso);
    if (!UI.ALL.length && !hasUse) {
      el.innerHTML = vEmpty('chart-gantt', 'Todavía no hay nada que poner en el tiempo', 'Guarda documentos en un espacio y presiona Actualizar. Aquí vas a ver qué cambió cada día, junto con las rutinas, skills y apps que usó Claude.');
      return;
    }

    // --- carriles ---
    // Cada carril trae su cifra dentro del rango: archivos que cambiaron, llamadas, corridas o usos.
    // Un clic en su nombre lo oculta (queda angosto y tenue) o lo vuelve a mostrar.
    const lanes = [];
    const apps = { id: 'g:apps', kind: 'icons', label: 'Apps', color: G.app, days: days.map(() => []), old: [], unit: ['llamada', 'llamadas'] };
    for (const a of B.apps) {
      let any = false;
      for (const [k, n] of Object.entries(a.porDia || {})) { const i = dayOfKey(k); if (i >= 0 && n) { apps.days[i].push({ t: 'app', a, n, k }); any = true; } }
      if (!any) apps.old.push({ t: 'app', a });
    }
    apps.days.forEach(arr => arr.sort((x, y) => y.n - x.n));
    const ruts = { id: 'g:rut', kind: 'icons', label: 'Rutinas', color: G.rut, days: days.map(() => []), old: [], unit: ['corrida', 'corridas'] };
    for (const r of B.routines) {
      const u = r.uso || {};
      let pd = u.porDia;
      if (!pd && u.runs) { pd = {}; for (const x of u.runs) if (x.ts) { const k = dkey(new Date(x.ts)); pd[k] = pd[k] || [0, 0, 0]; pd[k][0]++; pd[k][1] += x.tokens || 0; pd[k][2] += x.costo || 0; } }
      let any = false;
      for (const [k, v] of Object.entries(pd || {})) { const i = dayOfKey(k); if (i >= 0) { ruts.days[i].push({ t: 'rut', r, n: v[0], tok: v[1], cost: v[2], k }); any = true; } }
      if (!any) ruts.old.push({ t: 'rut', r });
    }
    const skills = { id: 'g:skills', kind: 'dots', label: 'Skills', color: G.skill, days: days.map(() => []), old: [], unit: ['uso', 'usos'] };
    for (const s of B.skills) for (const [k, v] of Object.entries((s.uso && s.uso.porDia) || {})) {
      const i = dayOfKey(k), rec = { t: 'skill', s, n: v[0], tok: v[1], cost: v[2], k };
      for (let j = 0; j < v[0]; j++) (i >= 0 ? skills.days[i] : skills.old).push(rec);
    }
    for (const z of zones) {
      const L = { id: 'z:' + z, kind: 'dots', zone: true, label: zlabel(z), color: zcolor(z), days: days.map(() => []), old: [], unit: ['archivo', 'archivos'] };
      for (const n of UI.ALL) {
        if (n.cat !== z || !n.mtime || (set && !set.has(n.id))) continue;
        const i = dayOf(n.mtime);
        (i >= 0 ? L.days[i] : L.old).push({ t: 'file', n, ts: +new Date(n.mtime) });
      }
      L.days.forEach(a => a.sort((x, y) => x.ts - y.ts)); L.old.sort((x, y) => y.ts - x.ts);
      lanes.push(L);
    }
    lanes.unshift(apps, ruts); lanes.push(skills);
    for (const L of lanes) {
      L.off = st.tl.off.has(L.id);
      L.n = L.days.reduce((s, a) => s + (L.kind === 'icons' ? a.reduce((t, x) => t + (+x.n || 0), 0) : a.length), 0);
    }
    const zon = lanes.filter(l => l.zone && !l.off), nOff = lanes.filter(l => l.off).length;
    const inRange = zon.reduce((s, l) => s + l.n, 0), older = zon.reduce((s, l) => s + l.old.length, 0);

    el.innerHTML = `<div class="vs-bar">
        ${sumLine(`Últimos ${D} días`, [[nInt(inRange), inRange === 1 ? 'archivo' : 'archivos'], [nInt(older), 'anteriores'], q ? [esc(q), 'filtro'] : null, nOff ? [nInt(nOff), nOff === 1 ? 'carril oculto' : 'carriles ocultos', 'Clic en su nombre para volver a mostrarlo'] : null])}
        <div class="vs-right">${seg('range', [[30, '30 días'], [60, '60 días'], [90, '90 días']], D)}</div></div>
      <div class="vs-tl vs-fade"><div class="vs-tlday"></div></div>
      <p class="vs-foot">Cada punto es un archivo en el día de su último cambio; los de antes se juntan en «Anteriores». Apps y rutinas salen de tus registros de Claude: un ícono por app o rutina usada ese día. Cada punto de skills es un uso. Clic en un punto lo abre; clic en el nombre de un carril lo oculta o lo vuelve a mostrar.</p>`;
    wire(el, fresh);
    onSeg(el, 'range', v => { st.tl.range = +v; timeline(el); });

    // --- medidas ---
    const box = el.querySelector('.vs-tl');
    const W = Math.max(640, box.clientWidth - 32);
    const LW = 176, OW = clamp(Math.round(W * 0.1), 116, 180), GAP = 18, X0 = LW + OW + GAP;
    const colW = (W - X0) / D, p = colW >= 18 ? 6 : 5, dr = p * 0.34;
    const cols = clamp(Math.floor((colW - 2) / p), 1, 4), ocols = Math.max(4, Math.floor((OW - 12) / p));
    const isz = clamp(Math.floor(colW - 3), 11, 16), ipitch = isz + 3, ochip = 22, ocolsI = Math.max(3, Math.floor((OW - 8) / (ochip + 3)));
    const HH = 52, PT = 15, PB = 8;
    const cxDay = i => X0 + i * colW + colW / 2;
    // Nombres de carril: botones que se miden ya puestos; el carril crece con su nombre (hasta dos renglones) y su cifra.
    box.insertAdjacentHTML('beforeend', lanes.map(L => {
      const u = L.n === 1 ? L.unit[0] : L.unit[1];
      const t = `<b>${esc(L.label)}</b><div class="p">${nInt(L.n)} ${u}${L.zone ? (L.n === 1 ? ' cambió' : ' cambiaron') : ''} en ${D} días · clic para ${L.off ? 'mostrar' : 'ocultar'}</div>`;
      return `<button class="vs-lab ${L.zone ? '' : 'g'} ${L.off ? 'off' : ''}" data-lane="${esc(L.id)}" style="width:${LW - 14}px"${tipAttr(t)}><span class="vs-lw"><span class="dot" style="color:${L.color}"></span>`
        + `<span class="vs-lt"><span class="t">${esc(L.label)}</span><span class="n"><b>${nInt(L.n)}</b> ${u} en ${D} días${L.off ? ' · oculto' : ''}</span></span></span></button>`;
    }).join(''));
    const labEls = [...box.querySelectorAll('.vs-lab')];
    labEls.forEach((b, i) => { lanes[i].lh = b.offsetHeight; });
    let y = HH;
    for (const L of lanes) {
      if (L.off) L.h = Math.max(30, L.lh + 10);
      else if (L.kind === 'dots') {
        const maxN = Math.max(0, ...L.days.map(a => a.length));
        L.rows = clamp(Math.max(Math.ceil(maxN / cols), Math.min(Math.ceil(L.old.length / ocols), 10)), 1, L.zone ? 12 : 8);
        // «+N» sobre los días que no caben: hasta tres alturas para que no se encimen; el de hoy no se sale por la derecha
        const cap = L.rows * cols, last = [-1e9, -1e9, -1e9];
        L.labs = [];
        L.days.forEach((arr, i) => {
          if (arr.length <= cap) return;
          const t = '+' + nInt(arr.length - cap), w = t.length * 7.2 + 2, x = Math.min(cxDay(i), W - w / 2);
          const lv = [0, 1, 2].find(l => x - w / 2 > last[l] + 4);
          if (lv == null) return;
          last[lv] = x + w / 2; L.labs.push({ x, t, lv });
        });
        L.h = Math.max(32, L.lh + 10, L.rows * p + PT + PB + Math.max(0, ...L.labs.map(l => l.lv)) * 15);
      } else {
        L.stack = clamp(Math.max(0, ...L.days.map(a => a.length)), 1, 6);
        L.orows = clamp(Math.ceil(L.old.length / ocolsI), 1, 4);
        L.h = Math.max(L.lh + 10, Math.max(L.stack * ipitch, L.orows * (ochip + 3)) + PT + PB);
      }
      L.y = y; y += L.h;
    }
    labEls.forEach((b, i) => { b.style.top = (lanes[i].y + 16) + 'px'; b.style.height = lanes[i].h + 'px'; });
    labEls.forEach(b => b.onclick = () => { const id = b.dataset.lane; st.tl.off.has(id) ? st.tl.off.delete(id) : st.tl.off.add(id); tip(null); timeline(el); });
    const H = y + 6;
    const hits = lanes.map(() => []);
    let s = '';
    // fondo: hoy, separadores de mes y la columna de anteriores
    s += `<rect class="today" x="${(X0 + (D - 1) * colW).toFixed(1)}" y="${HH - 22}" width="${colW.toFixed(1)}" height="${H - HH + 22}" rx="3"/>`;
    days.forEach((d, i) => { if (d.getDate() === 1 && i) s += `<line class="mline" x1="${(X0 + i * colW).toFixed(1)}" x2="${(X0 + i * colW).toFixed(1)}" y1="${HH - 40}" y2="${H}"/>`; });
    s += `<line class="oline" x1="${X0 - GAP / 2}" x2="${X0 - GAP / 2}" y1="${HH - 40}" y2="${H}"/>`;
    // encabezado: meses y días
    let m0 = 0;
    for (let i = 1; i <= D; i++) {
      if (i === D || days[i].getMonth() !== days[m0].getMonth()) {
        const w = (i - m0) * colW, d = days[m0], name = w > 170 ? `${MESES[d.getMonth()]} ${d.getFullYear()}` : w > 40 ? UI.MES[d.getMonth()] : '';
        if (name) s += `<text class="mo" x="${(X0 + m0 * colW + w / 2).toFixed(1)}" y="${HH - 30}" text-anchor="middle">${name}</text>`;
        m0 = i;
      }
    }
    const step = Math.max(1, Math.ceil(17 / colW)), todayX = cxDay(D - 1);
    let lastX = -1e9;
    days.forEach((d, i) => {
      const isToday = i === D - 1, x = cxDay(i);
      if (!isToday && ((d.getDate() - 1) % step || x - lastX < 18 || todayX - x < 18)) return;
      s += `<text class="dn ${isToday ? 'hoy' : ''}" x="${x.toFixed(1)}" y="${HH - 10}" text-anchor="middle">${d.getDate()}</text>`;
      lastX = x;
    });
    s += `<text class="mo" x="${LW + OW / 2}" y="${HH - 30}" text-anchor="middle">anteriores</text><text class="dn" x="${LW + OW / 2}" y="${HH - 10}" text-anchor="middle">antes del ${t0.getDate()} ${UI.MES[t0.getMonth()]}</text>`;
    // carriles
    lanes.forEach((L, li) => {
      const bot = L.y + L.h - PB;
      s += `<line class="lline" x1="0" x2="${W}" y1="${L.y}" y2="${L.y}"/><g class="vs-in" style="--i:${li}">`;
      if (L.off) { s += '</g>'; return; }
      if (!L.zone && !L.old.length && L.days.every(a => !a.length)) {
        const why = !(B.usage && B.usage.ok) ? `sin datos: ${((B.usage && B.usage.motivo) || 'no hay medición de uso').replace(/^./, c => c.toLowerCase())}. Salen de los registros de sesiones de Claude.`
          : L.id === 'g:skills' ? 'sin usos de skills registrados en tus sesiones' : L.id === 'g:apps' ? 'sin datos: anota tus apps en catalogo.json, sección apps' : 'sin datos: aún no hay rutinas';
        s += `<text class="nodata" x="${LW + 6}" y="${(L.y + L.h / 2 + 4).toFixed(1)}">${esc(why)}</text>`;
      }
      if (L.kind === 'dots') {
        const cap = L.rows * cols;
        L.days.forEach((arr, i) => {
          const n = arr.length, show = Math.min(n, cap);
          for (let k = 0; k < show; k++) {
            const x = cxDay(i) + ((k % cols) - (cols - 1) / 2) * p, yy = bot - Math.floor(k / cols) * p - p / 2, it = arr[k];
            const c = it.t === 'file' ? zcolor(it.n.cat) : L.color;
            s += `<circle cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="${dr.toFixed(2)}" style="fill:${c}"/>`;
            hits[li].push({ x, y: yy, r: p * 0.6, it, day: i });
          }
        });
        for (const l of L.labs) s += `<text class="more" x="${l.x.toFixed(1)}" y="${(bot - L.rows * p - 3 - l.lv * 15).toFixed(1)}" text-anchor="middle">${l.t}</text>`;
        const ocap = L.rows * ocols, on = Math.min(L.old.length, ocap);
        for (let k = 0; k < on; k++) {
          const x = LW + 6 + (k % ocols) * p + p / 2, yy = bot - Math.floor(k / ocols) * p - p / 2, it = L.old[k];
          s += `<circle class="old" cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="${dr.toFixed(2)}" style="fill:${it.t === 'file' ? zcolor(it.n.cat) : L.color}"/>`;
          hits[li].push({ x, y: yy, r: p * 0.6, it, day: -1 });
        }
        if (L.old.length > ocap) s += `<text class="more" x="${LW + OW - 2}" y="${(bot - L.rows * p - 3).toFixed(1)}" text-anchor="end">+${nInt(L.old.length - ocap)}</text>`;
      } else {
        L.days.forEach((arr, i) => {
          const show = Math.min(arr.length, L.stack);
          for (let k = 0; k < show; k++) {
            const it = arr[k], cx = cxDay(i), cy = bot - k * ipitch - isz / 2, ic = it.t === 'app' ? it.a.icono : it.r.icono;
            s += `<g class="chip" style="color:${L.color}"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(isz / 2).toFixed(1)}"/>${isz >= 13 ? icon(ic || 'circle', 'vs-ic', `x="${(cx - isz * 0.32).toFixed(1)}" y="${(cy - isz * 0.32).toFixed(1)}" width="${(isz * 0.64).toFixed(1)}" height="${(isz * 0.64).toFixed(1)}"`) : ''}</g>`;
            hits[li].push({ x: cx, y: cy, r: isz / 2 + 2, it, day: i });
          }
          if (arr.length > show) s += `<text class="more" x="${cxDay(i).toFixed(1)}" y="${(bot - show * ipitch - 3).toFixed(1)}" text-anchor="middle">+${arr.length - show}</text>`;
        });
        const ocap = L.orows * ocolsI;
        L.old.slice(0, ocap).forEach((it, k) => {
          const cx = LW + 6 + (k % ocolsI) * (ochip + 3) + ochip / 2, cy = bot - Math.floor(k / ocolsI) * (ochip + 3) - ochip / 2;
          const off = it.t === 'app' ? it.a.estado !== 'conectado' : !it.r.activa, ic = it.t === 'app' ? it.a.icono : it.r.icono;
          s += `<g class="chip ochip ${off ? 'off' : ''}" style="color:${L.color}"><circle cx="${cx}" cy="${cy}" r="${ochip / 2}"/>${icon(ic || 'circle', 'vs-ic', `x="${cx - 7}" y="${cy - 7}" width="14" height="14"`)}</g>`;
          hits[li].push({ x: cx, y: cy, r: ochip / 2 + 1, it, day: -1 });
        });
        if (L.old.length > ocap) s += `<text class="more" x="${LW + OW - 2}" y="${L.y + 13}" text-anchor="end">+${L.old.length - ocap}</text>`;
      }
      s += '</g>';
    });
    box.insertAdjacentHTML('beforeend', `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}</svg>`);

    // --- interacción ---
    const svg = box.querySelector('svg'), hl = box.querySelector('.vs-tlday');
    const laneAt = yy => lanes.findIndex(L => yy >= L.y && yy < L.y + L.h);
    const pick = e => {
      const r = svg.getBoundingClientRect(), x = e.clientX - r.left, yy = e.clientY - r.top, li = laneAt(yy);
      let best = null, bd = Infinity;
      if (li >= 0) for (const h of hits[li]) { const d = Math.hypot(h.x - x, h.y - yy); if (d <= Math.max(h.r, 4.5) && d < bd) { bd = d; best = h; } }
      const day = x >= X0 ? clamp(Math.floor((x - X0) / colW), 0, D - 1) : (x >= LW ? -1 : null);
      return { best, day, li };
    };
    const itemTip = it => {
      if (it.t === 'file') return ctx.nodeTip(it.n) + `<div class="p">${UI.fdatetime(it.n.mtime)} · clic para abrir</div>`;
      if (it.t === 'app') return `<b>${esc(it.a.nombre)}</b><div class="p">${it.k ? `${fday(new Date(it.k + 'T12:00'))} · ${plural(it.n, 'llamada', 'llamadas')}` : (it.a.porDia ? (it.a.ultimaLlamada ? `sin llamadas en ${D} días · última ${UI.fdate(it.a.ultimaLlamada)}` : 'sin llamadas registradas') : 'sin medición: no pasa por un conector de Claude')}</div><div class="p">${esc(it.a.estado)}</div>`;
      if (it.t === 'rut') return `<b>${esc(it.r.nombre)}</b><div class="p">${it.k ? `${fday(new Date(it.k + 'T12:00'))} · ${plural(it.n, 'corrida', 'corridas')} · ${nInt(it.tok)} tokens · ${usd(it.cost)}` : `sin corridas en ${D} días${it.r.ultima ? ' · última ' + UI.fdate(it.r.ultima) : ''}`}</div><div class="p">${it.r.activa ? 'activa' : 'pausada'}${it.r.nodo ? ' · clic: ver instrucciones' : ''}</div>`;
      if (it.t === 'skill') return `<b>${skName(it.s)}</b><div class="p">${fday(new Date(it.k + 'T12:00'))} · ${plural(it.n, 'uso', 'usos')} · ${nInt(it.tok)} tokens · ${usd(it.cost)}</div>${it.s.nodo ? '<div class="p">clic: ver SKILL.md</div>' : ''}`;
      return '';
    };
    const dayTip = i => {
      if (i < 0) return `<b>Anteriores</b><div class="p">${plural(older, 'archivo', 'archivos')} sin cambios desde antes del ${UI.fdate(t0)}</div>`;
      const d = days[i], parts = [];
      const files = zon.reduce((a, l) => a + l.days[i].length, 0);
      if (files) parts.push(plural(files, 'archivo', 'archivos'));
      if (!skills.off && skills.days[i].length) parts.push(plural(skills.days[i].length, 'uso de skills', 'usos de skills'));
      const rr = ruts.off ? 0 : ruts.days[i].reduce((a, x) => a + x.n, 0); if (rr) parts.push(plural(rr, 'corrida', 'corridas'));
      const aa = apps.off ? 0 : apps.days[i].reduce((a, x) => a + x.n, 0); if (aa) parts.push(plural(aa, 'llamada a apps', 'llamadas a apps'));
      return `<b>${fday(d)}${i === D - 1 ? ' · hoy' : ''}</b><div class="p">${parts.join(' · ') || 'sin actividad registrada'}</div>`;
    };
    svg.onmousemove = e => {
      const { best, day } = pick(e);
      if (day != null && day >= 0) { hl.style.cssText = `display:block;left:${16 + X0 + day * colW}px;width:${colW}px;top:${16 + HH - 22}px;height:${H - HH + 22}px`; }
      else if (day === -1) hl.style.cssText = `display:block;left:${16 + LW}px;width:${OW}px;top:${16 + HH - 22}px;height:${H - HH + 22}px`;
      else hl.style.display = 'none';
      svg.style.cursor = best && (best.it.t === 'file' || best.it.t === 'app' || (best.it.t === 'rut' && best.it.r.nodo) || (best.it.t === 'skill' && best.it.s.nodo)) ? 'pointer' : '';
      if (best) tip(itemTip(best.it), e.clientX, e.clientY);
      else if (day != null) tip(dayTip(day), e.clientX, e.clientY);
      else tip(null);
    };
    svg.onmouseleave = () => { hl.style.display = 'none'; tip(null); };
    svg.onclick = e => {
      const { best } = pick(e); if (!best) return;
      const it = best.it; tip(null);
      if (it.t === 'file') ctx.viewer.open(it.n);
      else if (it.t === 'app') ctx.setView('apps');
      else if (it.t === 'rut' && it.r.nodo && UI.BYID[it.r.nodo]) ctx.viewer.open(UI.BYID[it.r.nodo]);
      else if (it.t === 'skill' && it.s.nodo && UI.BYID[it.s.nodo]) ctx.viewer.open(UI.BYID[it.s.nodo]);
    };
  }

  // =============== RUTINAS ===============
  const hhmm = r => r.hora || (r.unica ? r.unica.slice(11, 16) : null);
  function routines(el, fresh) {
    const k7 = lastDays(7);
    const w7 = r => {
      const u = r.uso || {};
      if (u.porDia) { const v = sumDays(u.porDia, k7) || [0, 0, 0]; return { n: v[0], tok: v[1], cost: v[2] }; }
      return { n: null, tok: u.tokens7d || 0, cost: u.costo7d || 0 };
    };
    const all = B.routines.map(r => ({ r, w: w7(r) }));
    const nAct = all.filter(x => x.r.activa).length;
    const F = { activas: x => x.r.activa, pausadas: x => !x.r.activa, todas: () => true };
    if (!F[st.rut.filter]) st.rut.filter = 'activas';
    if (st.rut.filter === 'activas' && !nAct && all.length) st.rut.filter = 'todas';
    const S = {
      hora: (a, b) => (hhmm(a.r) || '99').localeCompare(hhmm(b.r) || '99'),
      nombre: (a, b) => a.r.nombre.localeCompare(b.r.nombre, 'es'),
      dias: (a, b) => ((b.r.dias || []).length - (a.r.dias || []).length),
      tokens: (a, b) => b.w.tok - a.w.tok,
      costo: (a, b) => b.w.cost - a.w.cost
    };
    const list = all.filter(F[st.rut.filter]).sort((a, b) => S[st.rut.sort](a, b) * st.rut.dir || a.r.nombre.localeCompare(b.r.nombre, 'es'));
    const tok7 = all.reduce((s, x) => s + x.w.tok, 0), cost7 = all.reduce((s, x) => s + x.w.cost, 0);
    const runs7 = all.reduce((s, x) => s + (x.w.n || 0), 0), allTok = B.usage && B.usage.ok ? B.usage.tokens7d : 0;
    const arrow = k => st.rut.sort === k ? (st.rut.dir > 0 ? ' ↑' : ' ↓') : '';
    const row = ({ r, w }, i) => {
      const u = r.uso || {}, nx = UI.nextRun(r);
      const when = r.dias ? `<span class="vs-days">${SEMANA.map(([d, l]) => `<i class="${r.dias.includes(d) ? 'on' : ''}">${l}</i>`).join('')}</span>`
        : r.unica ? `<span class="vs-sub">única · ${UI.fdate(r.unica)}</span>` : `<span class="vs-sub">sin horario anotado</span>`;
      const t = `<b>${esc(r.nombre)}</b><div class="p">${esc(r.id)}</div><div class="p">${r.activa ? 'activa' : 'pausada'}${hhmm(r) ? ' · ' + hhmm(r) + ' h' : ''}${nx ? ' · siguiente ' + UI.fdatetime(nx) : ''}</div>`
        + `<div class="p">7 días: ${w.n != null ? plural(w.n, 'corrida', 'corridas') + ' · ' : ''}${nInt(w.tok)} tokens · ${usdx(w.cost)}</div>`
        + `<div class="p">desde que hay registro: ${plural(u.corridas || 0, 'corrida', 'corridas')} · ${nInt(u.tokens || 0)} tokens · ${usd(u.costo || 0)}${r.ultima ? ' · última ' + UI.fdatetime(r.ultima) : ''}</div>`
        + (r.nodo ? '<div class="p">clic: ver instrucciones</div>' : '');
      return `<div class="vs-rrow vs-in ${r.activa ? '' : 'off'}" style="--i:${Math.min(i, 24)}" data-r="${esc(r.id)}"${tipAttr(t)}>
        <span class="vs-ri" style="color:${G.rut}">${icon(r.icono || 'alarm-clock')}</span>
        <div class="vs-rm"><div class="vs-rn">${esc(r.nombre)}</div><div class="vs-rw">${hhmm(r) ? `<span class="vs-hr">${hhmm(r)}</span>` : ''}${when}</div></div>
        <div class="vs-rv"><b>${w.tok ? tk(w.tok) : '—'}</b><span>tok/sem</span></div>
        <div class="vs-rv"><b>${w.tok || w.cost ? usd(w.cost) : '—'}</b><span>/sem</span></div></div>`;
    };
    const hist = ((B.usage && B.usage.rutinasHistoricas) || []).filter(h => /[\p{L}\p{N}]/u.test(h.id || ''));
    el.innerHTML = `${all.length ? `<div class="vs-bar">
        ${seg('rf', [['activas', `Activas <span class="c">${nAct}</span>`], ['pausadas', `Pausadas <span class="c">${all.length - nAct}</span>`], ['todas', `Todas <span class="c">${all.length}</span>`]], st.rut.filter)}
        ${sumLine('Últimos 7 días', [[tk(tok7), 'tokens', `${nInt(tok7)} tokens en ${plural(runs7, 'corrida', 'corridas')} de rutinas`], [usd(cost7), 'a precio de API', `${usdx(cost7)}: el costo que Claude Code anotó en cada corrida. Con suscripción no se cobra aparte, pero consume tu límite.`], allTok ? [(tok7 / allTok * 100).toFixed(1) + '%', 'de tu uso', `${nInt(tok7)} de ${nInt(allTok)} tokens de Claude en 7 días`] : null])}
        <div class="vs-sort"><span class="vs-k">Ordenar</span>${seg('rs', [['hora', 'Hora' + arrow('hora')], ['nombre', 'Nombre' + arrow('nombre')], ['dias', 'Días' + arrow('dias')], ['tokens', 'Tokens' + arrow('tokens')], ['costo', 'Costo' + arrow('costo')]], st.rut.sort)}</div></div>` : ''}
      ${all.length ? (list.length ? `<div class="vs-rgrid">${list.map(row).join('')}</div>` : `<div class="vs-none">Ninguna rutina en este filtro.</div>`)
        : vEmpty('timer', 'Aún no hay rutinas', B.memoriaActiva === false ? 'El espacio de Claude está apagado en la configuración: sin él no se leen rutinas ni se mide el uso.' : 'Una rutina es una tarea que Claude corre sola a su hora. Créala en Claude con «programa una tarea» y aparece aquí al actualizar.')}
      ${all.length ? weekGrid() : ''}
      <p class="vs-foot">${hist.length ? `Ya no existen pero dejaron registro: ${hist.map(h => `${esc(h.id)} (${plural(h.corridas, 'corrida', 'corridas')}, ${usd(h.costo)})`).join(' · ')}. ` : ''}${esc((B.usage && B.usage.nota) || 'Sin medición de uso: los tokens salen de los registros de sesiones de Claude.')}</p>`;
    wire(el, fresh); rutEl = el;
    onSeg(el, 'rf', v => { st.rut.filter = v; routines(el); });
    onSeg(el, 'rs', v => { if (st.rut.sort === v) st.rut.dir *= -1; else { st.rut.sort = v; st.rut.dir = 1; } routines(el); });
    el.querySelectorAll('.vs-rrow').forEach(d => d.onclick = () => {
      const r = B.routines.find(x => x.id === d.dataset.r);
      if (r && r.nodo && UI.BYID[r.nodo]) { tip(null); ctx.viewer.open(UI.BYID[r.nodo]); } else if (r && r.path) UI.copy(r.path, 'Ruta copiada');
    });
    wireWeek(el);
  }

  // Semana en rejilla: lunes a domingo, cada corrida o cada horario en su hora.
  // La línea de «ahora» solo sale si la semana incluye hoy, y la hora actual entra al rango de horas para que nunca
  // quede fuera de la rejilla. Avanza sola: cada minuto la semana se vuelve a dibujar, sin animación.
  let weekEvents = [], weekStamp = '', rutEl = null;
  function weekGrid(anim = true) {
    const now = new Date(), mon = addDays(sod(now), -((now.getDay() + 6) % 7));
    const days = [...Array(7)].map((_, i) => addDays(mon, i)), keys = days.map(dkey);
    const ev = [];
    for (const r of B.routines) {
      const runs = ((r.uso && r.uso.runs) || []).filter(x => x.ts && keys.includes(dkey(new Date(x.ts))));
      for (const x of runs) { const d = new Date(x.ts); ev.push({ r, day: keys.indexOf(dkey(d)), min: d.getHours() * 60 + d.getMinutes(), kind: 'ran', tok: x.tokens, cost: x.costo, ts: x.ts }); }
      const ranOn = new Set(runs.map(x => dkey(new Date(x.ts))));
      const slot = d => { const h = hhmm(r); if (!h) return; const [hh, mm] = h.split(':').map(Number), t = new Date(d); t.setHours(hh, mm, 0, 0); if (ranOn.has(dkey(d))) return; ev.push({ r, day: keys.indexOf(dkey(d)), min: hh * 60 + mm, kind: t > now ? 'next' : 'miss', ts: t }); };
      if (r.unica) { const d = new Date(r.unica); if (keys.includes(dkey(d))) slot(d); }
      else if (r.activa && r.dias && r.hora) days.forEach(d => { if (r.dias.includes(d.getDay())) slot(d); });
    }
    weekEvents = ev;
    const today = keys.indexOf(dkey(now)), nowMin = now.getHours() * 60 + now.getMinutes();
    weekStamp = dkey(now) + ' ' + nowMin;
    const head = `<div class="vs-wh"><span></span>${days.map((d, i) => `<span class="${i === today ? 'hoy' : ''}">${UI.DIA[d.getDay()]} <b>${d.getDate()}</b></span>`).join('')}</div>`;
    if (!ev.length) return `<div class="vs-week ${anim ? 'vs-in' : ''}">${head}<div class="vs-none">Sin corridas ni horarios esta semana.</div></div>`;
    const mins = ev.map(e => e.min).concat(today >= 0 ? [nowMin] : []);
    let h0 = Math.max(0, Math.floor(Math.min(...mins) / 60) - 1), h1 = Math.min(24, Math.ceil((Math.max(...mins) + 1) / 60) + 1);
    while (h1 - h0 < 6) { if (h0 > 0) h0--; if (h1 - h0 < 6 && h1 < 24) h1++; }
    const span = (h1 - h0) * 60, HPX = clamp((h1 - h0) * 34, 220, 440), top = m => (m - h0 * 60) / span * HPX;
    const stepH = h1 - h0 > 12 ? 2 : 1;
    const lines = [];
    for (let h = h0; h <= h1; h += stepH) lines.push(`<div class="hl" style="top:${top(h * 60)}px"><span>${p2(h)}:00</span></div>`);
    const byDay = days.map((_, i) => ev.map((e, j) => ({ e, j })).filter(x => x.e.day === i).sort((a, b) => a.e.min - b.e.min));
    const cols = byDay.map((arr, i) => {
      const groups = [];
      for (const x of arr) { const g = groups[groups.length - 1]; if (g && x.e.min - g.min < 45) g.items.push(x); else groups.push({ min: x.e.min, items: [x] }); }
      const chips = groups.map(g => {
        const e0 = g.items[0].e, more = g.items.length - 1, future = g.items.every(x => x.e.kind !== 'ran');
        return `<div class="vs-ev ${future ? 'dimt' : ''}" style="top:${top(e0.min) - 12}px">${g.items.map(({ e, j }) => `<i class="vs-evi ${e.kind}" data-e="${j}" style="color:${G.rut}">${icon(e.r.icono || 'alarm-clock')}</i>`).join('')}<span data-e="${g.items[0].j}">${p2(Math.floor(e0.min / 60))}:${p2(e0.min % 60)} ${esc(e0.r.nombre)}${more ? ` +${more}` : ''}</span></div>`;
      }).join('');
      const nowLine = i === today ? `<div class="now" style="top:${top(nowMin).toFixed(1)}px"></div>` : '';
      return `<div class="vs-wc ${i === today ? 'hoy' : ''}">${nowLine}${chips}</div>`;
    }).join('');
    return `<div class="vs-week ${anim ? 'vs-in' : ''}" style="--i:6">${head}<div class="vs-wb" style="height:${HPX}px"><div class="vs-wl">${lines.join('')}</div><span></span>${cols}</div>
      <div class="vs-wk"><span><i class="ran"></i>corrió</span><span><i class="next"></i>programada</span><span><i class="miss"></i>sin corrida registrada</span></div></div>`;
  }
  setInterval(() => {
    const w = rutEl && rutEl.classList.contains('on') && rutEl.querySelector('.vs-week'), d = new Date();
    if (!w || dkey(d) + ' ' + (d.getHours() * 60 + d.getMinutes()) === weekStamp) return;
    rutEl.classList.remove('vs-anim'); w.outerHTML = weekGrid(false); wireWeek(rutEl);
  }, 15000);
  function wireWeek(el) {
    const w = el.querySelector('.vs-week'); if (!w) return;
    w.onmousemove = e => {
      const c = e.target.closest('[data-e]'); if (!c) return tip(null);
      const x = weekEvents[+c.dataset.e], when = `${fday(new Date(x.ts))} · ${p2(Math.floor(x.min / 60))}:${p2(x.min % 60)}`;
      tip(`<b>${esc(x.r.nombre)}</b><div class="p">${when}</div><div class="p">${x.kind === 'ran' ? `corrió · ${nInt(x.tok)} tokens · ${x.cost != null ? usdx(x.cost) : 'sin costo anotado'}` : x.kind === 'next' ? 'programada' : 'tocaba a esta hora; no hay corrida registrada (la app de Claude debe estar abierta)'}</div>`, e.clientX, e.clientY);
    };
    w.onmouseleave = () => tip(null);
    w.onclick = e => { const c = e.target.closest('[data-e]'); if (!c) return; const r = weekEvents[+c.dataset.e].r; if (r.nodo && UI.BYID[r.nodo]) { tip(null); ctx.viewer.open(UI.BYID[r.nodo]); } };
  }

  // =============== APPS ===============
  const ST_TXT = { 'conectado': 'conectada', 'otra cuenta': 'en otra cuenta', 'falla': 'con falla', 'sin autorizar': 'sin autorizar', 'fuera de Claude': 'fuera de Claude' };
  const appShape = a => a.tipo ? ({ conector: 'circle', comando: 'square', 'linea de comandos': 'square', app: 'hex' })[String(a.tipo).toLowerCase()] || 'circle'
    : (a.mcp ? 'circle' : a.estado === 'fuera de Claude' ? 'square' : 'hex');
  const appKind = a => a.tipo || (a.mcp ? 'conector de Claude' : a.estado === 'fuera de Claude' ? 'fuera de Claude' : 'sin conector');
  const howTo = a => a.estado === 'sin autorizar' ? 'Se activa escribiendo /mcp en Claude Code.' : a.estado === 'conectado' ? '' : (a.nota || (a.estado === 'fuera de Claude' ? 'Claude no la alcanza todavía.' : ''));
  // Cada estado se dice una sola vez: se omite si el tipo («fuera de Claude») o el aviso («Conectado a otra cuenta») ya lo dicen.
  const appState = a => { const t = ST_TXT[a.estado] || a.estado || '', said = words(appKind(a) + ' ' + howTo(a)); return words(t).some(w => said.includes(w)) ? '' : t; };
  // Lo que pide atención (otra cuenta, falla) no se atenúa: su aviso va en su propio renglón, en ámbar.
  const appWarn = a => a.estado === 'otra cuenta' || a.estado === 'falla';
  function appsView(el, fresh) {
    const keys = lastDays(st.app.win);
    const F = { todas: () => true, conectadas: a => a.estado === 'conectado', sin: a => a.estado !== 'conectado' };
    const rows = B.apps.filter(F[st.app.filter] || F.todas).map((a, i) => ({ a, i, calls: a.porDia ? (sumDays(a.porDia, keys) || 0) : null }));
    const used = rows.filter(x => x.calls > 0).length, total = rows.reduce((s, x) => s + (x.calls || 0), 0);
    const nConn = B.apps.filter(a => a.estado === 'conectado').length;
    rows.sort((x, y) => (st.app.order === 'mas' ? 1 : -1) * ((y.calls ?? -1) - (x.calls ?? -1)) || x.a.nombre.localeCompare(y.a.nombre, 'es'));
    const max = Math.max(1, ...rows.map(x => x.calls || 0));
    const shapes = [...new Set(rows.map(x => appShape(x.a)))];
    const SHAPE_TXT = { circle: 'conector de Claude', square: 'fuera de Claude', hex: 'sin conector' };
    el.innerHTML = `${B.apps.length ? `<div class="vs-bar">
        ${seg('ao', [['mas', 'Más usadas'], ['menos', 'Menos usadas']], st.app.order)}
        ${sumLine(`Últimos ${st.app.win} días`, [[`${used} de ${rows.length}`, 'usadas'], [nInt(total), total === 1 ? 'llamada' : 'llamadas', 'Llamadas de Claude a cada conector, contadas en tus registros de sesiones'], [UI.fdatetime(B.generado), 'escaneo']])}
        <div class="vs-right">${seg('af', [['todas', `Todas <span class="c">${B.apps.length}</span>`], ['conectadas', `Conectadas <span class="c">${nConn}</span>`], ['sin', `Sin conectar <span class="c">${B.apps.length - nConn}</span>`]], st.app.filter)}${seg('aw', [[7, '7 días'], [30, '30 días']], st.app.win)}</div></div>` : ''}
      ${B.apps.length ? `<div class="vs-split"><div class="vs-bubwrap"></div><div class="vs-list">${rows.length ? rows.map((x, n) => {
        const a = x.a, warn = appWarn(a), off = a.estado !== 'conectado' && !warn, how = howTo(a), state = appState(a);
        const sub = [appKind(a), state, a.ultimaLlamada ? 'último uso ' + UI.ago(a.ultimaLlamada) : (a.mcp ? 'sin uso registrado' : 'sin medición')].filter(Boolean).join(' · ');
        const t = `<b>${esc(a.nombre)}</b><div class="p">${esc([appKind(a), state].filter(Boolean).join(' · '))}</div><div class="p">${x.calls == null ? 'Sin medición: no pasa por un conector de Claude' : `${nInt(x.calls)} llamadas en ${st.app.win} días · ${nInt(a.llamadas || 0)} desde que hay registro`}</div>${a.ultimaLlamada ? `<div class="p">última: ${UI.fdatetime(a.ultimaLlamada)}</div>` : ''}${how ? `<div class="p">${esc(how)}</div>` : ''}${a.estado === 'sin autorizar' ? '<div class="p">clic: copiar /mcp</div>' : ''}`;
        return `<div class="vs-row vs-in ${off ? 'off' : ''} ${warn ? 'warn' : ''}" data-i="${x.i}" style="--i:${Math.min(n, 24)}"${tipAttr(t)}><span class="vs-rk">${n + 1}</span>
          <div class="vs-rb"><div class="vs-rt"><span class="vs-ri" style="color:${G.app}">${icon(a.icono || 'plug')}</span><b>${esc(a.nombre)}</b><em>${x.calls == null ? '—' : plural(x.calls, 'llamada', 'llamadas')}</em></div>
          <div class="vs-meter"><i style="width:${x.calls ? Math.max(1.5, x.calls / max * 100) : 0}%;background:${G.app}"></i></div>
          <div class="vs-rs">${esc(sub)}${how && !warn ? ` · ${esc(how)}` : ''}</div>${how && warn ? `<div class="vs-warn how">${icon('triangle-alert')}<span>${esc(how)}</span></div>` : ''}</div></div>`;
      }).join('') : '<div class="vs-none">Ninguna app en este filtro.</div>'}</div></div>
      <div class="vs-shapes">${shapes.map(s => `<span><svg width="14" height="14" viewBox="-8 -8 16 16" style="color:${G.app}">${shapeSVG(s, 6.5)}</svg>${SHAPE_TXT[s]}</span>`).join('')}<span>tamaño: llamadas en ${st.app.win} días · tenue: sin conectar</span></div>`
        : vEmpty('plug', 'Aún no hay aplicaciones anotadas', 'Anota en catalogo.json, sección apps, los conectores de Claude y las herramientas que usas.')}
      <div class="vs-mayo"><div class="vs-k" style="color:var(--accent)">Para el modo mayordomo</div>${UI.checklistHTML()}</div>
      <p class="vs-foot">Las llamadas salen de tus registros de sesiones de Claude: cada vez que Claude usó una herramienta de ese conector. Las que no pasan por un conector no se pueden medir.</p>`;
    wire(el, fresh);
    onSeg(el, 'ao', v => { st.app.order = v; appsView(el); });
    onSeg(el, 'af', v => { st.app.filter = v; appsView(el); });
    onSeg(el, 'aw', v => { st.app.win = +v; appsView(el); });
    const wrap = el.querySelector('.vs-bubwrap'); if (!wrap) return;
    const Wb = wrap.clientWidth, Hb = wrap.clientHeight;
    const usedB = rows.filter(x => x.calls > 0), zero = rows.filter(x => !(x.calls > 0));
    const mx = Math.max(1, ...usedB.map(x => x.calls));
    const cs = usedB.map(x => ({ r: 14 + 86 * Math.sqrt(x.calls / mx), shape: appShape(x.a), name: x.a.nombre, metric: plural(x.calls, 'llamada', 'llamadas'), metricShort: nInt(x.calls), dim: x.a.estado !== 'conectado' && !appWarn(x.a), i: x.i }));
    const zs = zero.map(x => ({ r: 8, shape: appShape(x.a), name: x.a.nombre, dim: true, cls: 'zero', i: x.i }));
    ring(zs, pack(cs, 4, Wb / Math.max(1, Hb)), 6, Wb / Math.max(1, Hb));
    wrap.innerHTML = bubblesSVG([...cs, ...zs], Wb, Hb, G.app, 'vsg-app');
    afterFonts(el, appsView);
    linkBubbles(el, i => {
      const a = B.apps[i], x = rows.find(r => r.i === i), how = howTo(a), state = appState(a);
      return `<b>${esc(a.nombre)}</b><div class="p">${x && x.calls != null ? `${nInt(x.calls)} llamadas en ${st.app.win} días` : 'sin medición'}${state ? ' · ' + esc(state) : ''}</div>${a.ultimaLlamada ? `<div class="p">última: ${UI.fdatetime(a.ultimaLlamada)}</div>` : ''}${how ? `<div class="p">${esc(how)}</div>` : ''}`;
    }, i => { const a = B.apps[i]; if (a && a.estado === 'sin autorizar') UI.copy('/mcp', '/mcp copiado: pégalo en Claude Code para autorizar ' + a.nombre); });
  }

  // Burbujas y lista se iluminan juntas al pasar el cursor.
  function linkBubbles(el, tipFor, onPick) {
    const svg = el.querySelector('.vs-bub'), list = el.querySelector('.vs-list');
    const hot = i => { el.querySelectorAll('.hot').forEach(n => n.classList.remove('hot')); if (i == null) return; el.querySelectorAll(`[data-i="${i}"]`).forEach(n => n.classList.add('hot')); };
    if (svg) {
      svg.onmousemove = e => { const g = e.target.closest('.vs-b'); if (!g) { hot(null); return tip(null); } hot(g.dataset.i); tip(tipFor(+g.dataset.i), e.clientX, e.clientY); };
      svg.onmouseleave = () => { hot(null); tip(null); };
      svg.onclick = e => { const g = e.target.closest('.vs-b'); if (g) onPick(+g.dataset.i, e); };
    }
    if (list) {
      list.onmouseover = e => { const r = e.target.closest('.vs-row'); hot(r ? r.dataset.i : null); };
      list.onmouseleave = () => hot(null);
      list.onclick = e => { const r = e.target.closest('.vs-row'); if (r) onPick(+r.dataset.i, e); };
    }
  }

  // =============== SKILLS ===============
  function skillsView(el, fresh) {
    const days = st.sk.win, keys = lastDays(days), weeks = days / 7;
    const all = B.skills.map((s, i) => {
      const v = (s.uso && s.uso.porDia) ? (sumDays(s.uso.porDia, keys) || [0, 0, 0]) : [0, 0, 0];
      return { s, i, runs: v[0], tok: v[1], cost: v[2] };
    });
    const M = {
      usos: { l: 'Más usadas', v: x => x.runs, f: v => plural(v, 'corrida', 'corridas'), fs: v => nInt(v) },
      tsem: { l: 'Tokens por semana', v: x => x.tok / weeks, f: v => tk(v) + ' tok/sem', fs: v => tk(v) },
      tcor: { l: 'Tokens por corrida', v: x => x.runs ? x.tok / x.runs : 0, f: v => tk(v) + ' tok/corrida', fs: v => tk(v) },
      costo: { l: 'Costo por semana', v: x => x.cost / weeks, f: v => usd(v) + '/sem', fs: v => usd(v) }
    };
    if (!M[st.sk.sort]) st.sk.sort = 'costo';
    const m = M[st.sk.sort];
    const usedN = all.filter(x => x.runs > 0).length;
    const rows = all.filter(x => st.sk.used === 'todas' || x.runs > 0)
      .sort((a, b) => m.v(b) - m.v(a) || b.runs - a.runs || a.s.id.localeCompare(b.s.id));
    const max = Math.max(1e-9, ...rows.map(m.v));
    const tTok = all.reduce((s, x) => s + x.tok, 0), tCost = all.reduce((s, x) => s + x.cost, 0), tRuns = all.reduce((s, x) => s + x.runs, 0);
    const hasDays = B.skills.some(s => s.uso && s.uso.porDia);
    el.innerHTML = `${B.skills.length ? `<div class="vs-bar">
        ${seg('ss', Object.entries(M).map(([k, o]) => [k, o.l]), st.sk.sort)}
        ${sumLine(`Últimos ${days} días`, [[`≈${tk(tTok)}`, 'tokens', `${nInt(tTok)} tokens de los turnos donde se usó una skill`], [`≈${usd(tCost)}`, 'a precio de API', `${usdx(tCost)} · ${esc((B.usage && B.usage.notaCosto) || '')}`], [nInt(tRuns), tRuns === 1 ? 'corrida' : 'corridas']])}
        <div class="vs-right">${seg('sw', [[7, '7 días'], [30, '30 días']], days)}${seg('su', [['usadas', `Usadas <span class="c">${usedN}</span>`], ['todas', `Todas <span class="c">${all.length}</span>`]], st.sk.used)}</div></div>` : ''}
      ${!B.skills.length ? vEmpty('zap', 'Aún no hay skills', 'Las skills de Claude se anotan en catalogo.json y las tuyas se detectan solas en la carpeta de Claude.')
        : `<div class="vs-split"><div class="vs-bubwrap"></div><div class="vs-list">${rows.length ? rows.map((x, n) => {
          const s = x.s, pref = UI.runPref ? UI.runPref(s.id) : null;
          const sub = x.runs ? `${plural(x.runs, 'corrida', 'corridas')} · ${tk(x.tok)} tok · ${usd(x.cost)}` : `sin uso en ${days} días${s.uso && s.uso.ultima ? ' · última ' + UI.ago(s.uso.ultima) : ''}`;
          return `<div class="vs-row vs-in ${x.runs ? '' : 'off'}" data-i="${x.i}" style="--i:${Math.min(n, 24)}"><span class="vs-rk">${n + 1}</span>
            <div class="vs-rb"><div class="vs-rt"><span class="vs-ri" style="color:${G.skill}">${icon(s.icono || 'sparkles')}</span><b>/${esc(short(s.id))}</b><span class="pl">· ${esc(skOrigin(s))}</span>${pref && pref.model ? `<span class="md md-${esc(pref.model)}">${esc(pref.model)}</span>` : ''}<em>${x.runs ? m.f(m.v(x)) : '—'}</em></div>
            <div class="vs-meter"><i style="width:${x.runs ? Math.max(1.5, m.v(x) / max * 100) : 0}%;background:${G.skill}"></i></div>
            <div class="vs-rs">${sub}</div></div></div>`;
        }).join('') : `<div class="vs-none">${hasDays ? `Ninguna skill usada en ${days} días.` : 'Sin datos por día: corre Actualizar para medirlos.'}</div>`}</div></div>
        <div class="vs-shapes"><span>tamaño: costo a precio de API en ${days} días · anillo: sin uso en ${days} días · clic: ver, correr o copiar</span></div>`}
      <div class="vs-runs"><div class="vs-k">Ejecuciones desde el panel <span data-runcount style="color:var(--accent);margin-left:8px"></span></div><div class="runs" data-runs="6"></div>
        <button class="btn accent" data-ask>${icon('message-circle-question')}Preguntar a mis archivos</button></div>
      <p class="vs-foot">Tokens: los de los turnos donde se usó cada skill, sacados de tus registros. Costo: esos tokens por modelo a precio público de API. Sirven para comparar, no son un cobro exacto.</p>`;
    wire(el, fresh);
    if (UI.runs) UI.runs.paint();
    el.querySelector('[data-ask]').onclick = () => UI.runDialog(null);
    onSeg(el, 'ss', v => { st.sk.sort = v; skillsView(el); });
    onSeg(el, 'sw', v => { st.sk.win = +v; skillsView(el); });
    onSeg(el, 'su', v => { st.sk.used = v; skillsView(el); });
    const tipFor = i => {
      const x = all[i], s = x.s, u = s.uso || {};
      return `<b>${skName(s)}</b><div class="p">${esc((s.desc || '').length > 140 ? s.desc.slice(0, 139) + '…' : (s.desc || ''))}</div><div class="p">${days} días: ${plural(x.runs, 'corrida', 'corridas')} · ${nInt(x.tok)} tokens · ${usdx(x.cost)}</div>`
        + (u.usos ? `<div class="p">desde que hay registro: ${plural(u.usos, 'uso', 'usos')} · ${nInt(u.tokens)} tokens${u.costo != null ? ' · ' + usd(u.costo) : ''}${u.ultima ? ' · última ' + UI.fdatetime(u.ultima) : ''}</div>` : '<div class="p">sin uso registrado</div>')
        + '<div class="p">clic: ver, correr o copiar</div>';
    };
    el.querySelectorAll('.vs-list .vs-row').forEach(r => r.dataset.tip = tipFor(+r.dataset.i));
    const wrap = el.querySelector('.vs-bubwrap');
    if (wrap) {
      const Wb = wrap.clientWidth, Hb = wrap.clientHeight;
      const shown = rows.length ? rows : [];
      const usedB = shown.filter(x => x.runs > 0), zero = shown.filter(x => !(x.runs > 0));
      // tamaño por gasto; si no hay costo (modelo sin precio) se usan los tokens para no dejarla en cero
      const g = x => x.cost > 0 ? x.cost : x.tok * 1e-7;
      const mx = Math.max(1e-9, ...usedB.map(g));
      // si dos burbujas tienen el mismo nombre corto (la skill /schedule y el comando /schedule), cada una lleva su origen
      const nm = x => '/' + short(x.s.id), same = new Set(usedB.map(nm).filter((n, i, a) => a.indexOf(n) !== i));
      const cs = usedB.map(x => ({ r: 12 + 88 * Math.sqrt(g(x) / mx), shape: 'circle', name: nm(x), sub: same.has(nm(x)) ? skOrigin(x.s) : '', metric: usd(x.cost / weeks) + '/sem', metricShort: usd(x.cost / weeks), i: x.i }));
      const zs = zero.map(x => ({ r: 6, shape: 'circle', name: nm(x), sub: skOrigin(x.s), dim: true, cls: 'zero', i: x.i }));
      ring(zs, pack(cs, 4, Wb / Math.max(1, Hb)), 5, Wb / Math.max(1, Hb));
      wrap.innerHTML = bubblesSVG([...cs, ...zs], Wb, Hb, G.skill, 'vsg-sk');
      afterFonts(el, skillsView);
    }
    linkBubbles(el, tipFor, (i, e) => skillCard(el, all[i], e));
  }
  // Ficha de una skill: ver su SKILL.md, correrla o copiar el comando.
  function skillCard(el, x, e) {
    closeCard();
    const s = x.s, u = s.uso || {}, canRun = s.run !== false, node = s.nodo && UI.BYID[s.nodo];
    const c = document.createElement('div');
    c.className = 'vs-card';
    // nombre corto con su origen aparte; el grupo del catálogo solo si dice algo que el origen no
    const org = skOrigin(s), g4 = w => (UI.norm ? UI.norm(w) : w.toLowerCase()).replace(/^plugin\s+/, '').slice(0, 4);
    const grupo = s.grupo && g4(s.grupo) !== g4(org) ? s.grupo : '';
    c.innerHTML = `<div class="vs-ch"><span class="vs-ri" style="color:${G.skill}">${icon(s.icono || 'sparkles')}</span><div><b>${skName(s)}</b>${grupo ? `<span>${esc(grupo)}</span>` : ''}</div><button class="x" data-x>${icon('x')}</button></div>
      <p>${esc(s.desc || '')}</p>
      <div class="vs-cs"><div><b>${nInt(x.runs)}</b><span>corridas · ${st.sk.win} d</span></div><div><b>${tk(x.tok)}</b><span>tokens · ${st.sk.win} d</span></div><div><b>${usd(x.cost)}</b><span>costo · ${st.sk.win} d</span></div></div>
      <div class="vs-cl">${u.usos ? `Desde que hay registro: ${plural(u.usos, 'uso', 'usos')} · ${nInt(u.tokens)} tokens${u.ultima ? ' · última ' + UI.fdatetime(u.ultima) : ''}` : 'Sin uso registrado en tus sesiones.'}</div>
      ${s.nota ? `<div class="vs-cl">${icon('info')}${esc(s.nota)}</div>` : ''}
      <div class="vs-cb">${canRun ? `<button class="btn accent" data-correr>${icon('play')}Correr</button>` : ''}${node ? `<button class="btn" data-view>${icon('file-text')}Ver SKILL.md</button>` : ''}<button class="btn" data-copy>${icon('copy')}Copiar /${esc(short(s.id))}</button></div>`;
    document.body.appendChild(c);
    const w = c.offsetWidth, h = c.offsetHeight;
    c.style.left = clamp(e.clientX + 14, 12, innerWidth - w - 12) + 'px';
    c.style.top = clamp(e.clientY - 20, 12, innerHeight - h - 12) + 'px';
    tip(null);
    c.querySelector('[data-x]').onclick = closeCard;
    const run = c.querySelector('[data-correr]'); if (run) run.onclick = () => { closeCard(); UI.runDialog(s); };
    const view = c.querySelector('[data-view]'); if (view) view.onclick = () => { closeCard(); ctx.viewer.open(node); };
    c.querySelector('[data-copy]').onclick = () => { UI.copy('/' + s.id, '/' + s.id + ' copiado: pégalo en Claude'); closeCard(); };
    setTimeout(() => { document.addEventListener('mousedown', outside); document.addEventListener('keydown', esc_); }, 0);
  }
  const outside = e => { if (!e.target.closest('.vs-card')) closeCard(); };
  const esc_ = e => { if (e.key === 'Escape') closeCard(); };
  function closeCard() {
    document.querySelectorAll('.vs-card').forEach(n => n.remove());
    document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc_);
  }

  // =============== ARTIFACTS ===============
  // Lo mismo guardado en tus espacios y publicado en claude.ai (mismo título, mismo día) va en una sola tarjeta con
  // «también en claude.ai»; solo en esta vista, los datos no cambian. Las cifras de las pestañas siguen al filtro de texto.
  // opts (propios de cada panel): order = pestañas en orden, foot = pie, empty = [título, texto] de la bandeja vacía.
  function artifacts(el, opts = {}) {
    const web = a => !!a.url && !a.ruta;
    const key = a => { const t = new Date(a.fecha); return (UI.norm ? UI.norm(a.titulo) : String(a.titulo).toLowerCase()).trim() + '|' + (isNaN(t) ? '' : dkey(t)); };
    const pair = new Map(), claimed = new Set();
    for (const a of B.artifacts) if (!web(a)) {
      const w = B.artifacts.find(x => web(x) && !claimed.has(x) && key(x) === key(a));
      if (w) { pair.set(a, w); claimed.add(w); }
    }
    const items = B.artifacts.filter(a => !claimed.has(a)).map(a => ({ a, twin: pair.get(a) || null }));
    const inTab = (it, f) => f === 'todos' || it.a.origen === f || (!!it.twin && it.twin.origen === f);
    const seen = [...new Set(B.artifacts.map(a => a.origen))];
    const tabs = ['todos', ...(opts.order ? [...opts.order, ...seen.filter(o => !opts.order.includes(o))] : seen).filter(o => items.some(it => inTab(it, o)))];
    if (!tabs.includes(st.art.filter)) st.art.filter = 'todos';
    el.innerHTML = (items.length ? `<div class="vs-bar">
        <div class="seg vs-seg" id="afilter">${tabs.map(f => `<button data-f="${esc(f)}" class="${st.art.filter === f ? 'on' : ''}">${f === 'todos' ? 'Todos' : esc(f)} <span class="c"></span></button>`).join('')}</div>
        <div class="vs-right"><div class="search vs-q">${icon('search')}<input id="artq" placeholder="Filtrar por nombre…" value="${esc(st.art.q)}" spellcheck="false" autocomplete="off"></div></div></div>` : '')
      + `<div class="cards arts" id="artGrid"></div><p class="vs-foot">${opts.foot || ''}</p>`;
    const arrow = icon('arrow-up-right', 'i', 'style="width:12px;height:12px;vertical-align:-1px"');
    const card = ({ a, twin }, i) => `<div class="card art ${a.viejo ? 'dimc' : ''} rise" style="--i:${Math.min(i, 18)}" data-i="${B.artifacts.indexOf(a)}" title="${esc(a.ruta || a.url || '')}">
      ${UI.coverHTML(a)}${twin ? `<button class="also" data-also="${B.artifacts.indexOf(twin)}" title="Abrir la versión de ${esc(twin.origen)}">${icon('globe')}también en ${esc(twin.origen)}</button>` : ''}
      <div class="artb"><div class="t">${esc(a.titulo)}</div>
      <div class="row meta"><span class="caps">${esc(a.origen)}${a.sub ? ' · ' + esc(a.sub) : ''}${a.viejo ? ' · respaldo' : ''}</span><span class="caps">${UI.fdate(a.fecha)}${a.url ? ' ' + arrow : ''}</span></div></div></div>`;
    const grid = () => {
      const q = (UI.norm ? UI.norm(st.art.q) : st.art.q.toLowerCase()).trim();
      const hits = items.filter(it => !q || [it.a, it.twin].some(a => a && (UI.norm ? UI.norm : x => x.toLowerCase())(a.titulo + ' ' + (a.ruta || '') + ' ' + (a.sub || '')).includes(q)));
      el.querySelectorAll('#afilter button').forEach(b => { b.querySelector('.c').textContent = nInt(hits.filter(it => inTab(it, b.dataset.f)).length); });
      const list = hits.filter(it => inTab(it, st.art.filter)), g = el.querySelector('#artGrid');
      g.innerHTML = list.length ? list.map(card).join('')
        : items.length ? emptyFilter(q ? `Nada coincide con «${st.art.q.trim()}»` : 'Nada en este filtro',
          `${st.art.filter !== 'todos' ? `Se buscó solo en ${esc(st.art.filter)}. ` : ''}Prueba con otra palabra o limpia el filtro para ver toda tu bandeja.`)
        : UI.emptyBig ? UI.emptyBig('vacio', ...(opts.empty || ['Tu bandeja está vacía', ''])) : '<div class="rempty">Aún no hay artifacts.</div>';
      g.querySelectorAll('.card.art').forEach(c => c.onclick = e => {
        const also = e.target.closest('[data-also]');
        UI.openArtifact(B.artifacts[+(also ? also.dataset.also : c.dataset.i)], ctx.viewer);
      });
      const clr = g.querySelector('[data-clear]');
      if (clr) clr.onclick = () => { st.art.q = ''; st.art.filter = 'todos'; artifacts(el, opts); };
    };
    grid();
    el.querySelectorAll('#afilter button').forEach(b => b.onclick = () => { st.art.filter = b.dataset.f; artifacts(el, opts); });
    const aq = el.querySelector('#artq'); if (aq) aq.oninput = e => { st.art.q = e.target.value; grid(); };
  }

  // Al cambiar el tamaño de la ventana, las vistas que dependen del ancho se vuelven a dibujar.
  const views = { timeline, routines, apps: appsView, skills: skillsView };
  let rz = null;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      for (const [k, fn] of Object.entries(views)) { const el = document.getElementById('v-' + k); if (el && el.classList.contains('on') && k !== 'routines') fn(el); }
    }, 140);
  });
  return { timeline, routines, apps: appsView, skills: skillsView, artifacts, closeCard, setArtFilter: f => { st.art.filter = f; } };
}
