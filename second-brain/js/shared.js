// Utilidades compartidas por las dos pantallas. Global: window.UI
(function () {
  const B = window.BRAIN;
  // Seguro: si el navegador no está dibujando cuadros (pestaña en segundo plano), se muestra todo sin animación
  // para que nada se quede a medias. También se puede forzar con ?still en la dirección.
  const root = document.documentElement;
  if (new URLSearchParams(location.search).has('still')) root.classList.add('still');
  else {
    let drawn = false;
    const mark = () => { drawn = true; };
    requestAnimationFrame(() => requestAnimationFrame(mark));
    // Dos pasos: el segundo plazo solo empieza cuando la página ya terminó de armarse,
    // así una carga lenta no se confunde con una pestaña en segundo plano.
    setTimeout(() => {
      if (drawn) return;
      requestAnimationFrame(mark);
      setTimeout(() => { if (!drawn) root.classList.add('still'); }, 600);
    }, 450);
  }
  B.artifacts = B.artifacts || [];
  B.pendientes = B.pendientes || { tareas: [], sistema: [] };
  B.usage = B.usage || { ok: false };
  // Las zonas salen del escaneo (catOrder): las de siempre guardan su color y una carpeta nueva trae el suyo (catColor).
  // Una zona sin archivos no aparece. Un escaneo viejo sin catOrder usa la lista de siempre.
  const CAT_COLOR = Object.assign({
    proyectos: '#ff6a2b', sesiones: '#ffb547', notas: '#3fd0ff', saas: '#4f8cff',
    marketplace: '#2fe0c4', kb: '#a98bff', raiz: '#f2efe9', memoria: '#ffffff'
  }, B.catColor || {});
  const CAT_ORDER = (B.catOrder || ['proyectos', 'sesiones', 'notas', 'saas', 'marketplace', 'kb', 'raiz']).slice();
  B.catLabel = B.catLabel || {};
  for (const n of B.nodes || []) {
    if (!CAT_ORDER.includes(n.cat)) CAT_ORDER.push(n.cat);
    if (!CAT_COLOR[n.cat]) CAT_COLOR[n.cat] = '#cfcac2';
    if (!B.catLabel[n.cat]) B.catLabel[n.cat] = 'ARCHIVOS';
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const urlOf = href => String(href).split('/').map(encodeURIComponent).join('/');

  // ---------- iconos (lucide) ----------
  const pascal = s => s.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
  const missingIcons = new Set();
  function iconNode(name) {
    const L = window.lucide;
    if (!L) return null;
    const P = pascal(name);
    const hit = (L.icons && L.icons[P]) || L[P];
    if (!hit) missingIcons.add(name);
    return hit || (L.icons && L.icons.Circle) || null;
  }
  function icon(name, cls = 'i', extra = '') {
    let node = iconNode(name);
    if (!node) return `<svg class="${cls}" viewBox="0 0 24 24"></svg>`;
    if (node[0] === 'svg') node = node[2];
    const inner = node.map(([tag, attrs]) =>
      '<' + tag + ' ' + Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ') + '/>').join('');
    return `<svg class="${cls}" ${extra} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  }
  function iconSVGString(name, color) {
    return icon(name, '', `width="64" height="64" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`);
  }
  function extIcon(ext) {
    return ({ md: 'file-text', docx: 'file-type', pdf: 'file', xlsx: 'sheet', png: 'image', txt: 'align-left',
      json: 'braces', html: 'app-window', py: 'code', csv: 'table', pptx: 'presentation', claude: 'sparkles', mp4: 'clapperboard', mov: 'clapperboard' })[ext] || 'file';
  }
  function folderIcon(f) {
    const k = f.toLowerCase();
    const map = [['transcript', 'mic'], ['persona', 'users'], ['proyecto', 'folder-kanban'], ['entregable', 'package'],
      ['weekly', 'calendar-days'], ['automatiz', 'zap'], ['fuente', 'library'], ['captura', 'camera'], ['onboarding', 'rocket'],
      ['farming', 'sprout'], ['qa', 'shield-check'], ['training', 'graduation-cap'], ['money', 'wallet'], ['adoption', 'trending-up'],
      ['continuidad', 'repeat'], ['herramient', 'wrench'], ['document', 'files'], ['arranque', 'flag'], ['consulta', 'message-square'],
      ['notas', 'notebook-pen'], ['saas', 'cloud'], ['marketplace', 'store'], ['perfil', 'id-card'], ['cuenta', 'user-cog'],
      ['reserva', 'calendar-check'], ['listing', 'list-filter'], ['finanza', 'banknote'], ['paciente', 'heart-pulse'],
      ['caracter', 'settings-2'], ['_kb', 'database'], ['md', 'file-code'], ['chatgpt', 'bot'], ['respaldo', 'archive']];
    for (const [w, i] of map) if (k.includes(w)) return i;
    return 'folder';
  }

  // ---------- fechas y números ----------
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const p2 = n => String(n).padStart(2, '0');
  const fdate = d => { d = new Date(d); return `${d.getDate()} ${MES[d.getMonth()]}`; };
  const ftime = d => { d = new Date(d); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const fdatetime = d => `${fdate(d)} · ${ftime(d)}`;
  function ago(d) {
    const s = (Date.now() - new Date(d)) / 1000;
    if (s < 60) return 'hace segundos';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} d`;
  }
  const fsize = b => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? Math.round(b / 1e3) + ' KB' : b + ' B';
  const fnum = n => { n = +n || 0; return n >= 1e9 ? (n / 1e9).toFixed(2) + ' mil M' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' K' : String(Math.round(n)); };
  const fusd = v => '$' + (+v || 0).toFixed(2);
  const fdur = s => s < 60 ? Math.max(0, Math.round(s)) + ' s' : s < 3600 ? Math.floor(s / 60) + ' min ' + p2(Math.round(s % 60)) + ' s' : (s / 3600).toFixed(1) + ' h';
  const modelName = m => String(m || '').replace('claude-', '').replace(/-\d.*$/, '').toUpperCase();

  // ---------- índice de nodos ----------
  const ALL = [...B.nodes, ...B.memory];
  const BYID = Object.fromEntries(ALL.map(n => [n.id, n]));
  const ADJ = {};
  for (const [a, b] of B.links) { (ADJ[a] = ADJ[a] || []).push(b); (ADJ[b] = ADJ[b] || []).push(a); }
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const PATHMAP = {}, BYBASE = {};
  for (const n of ALL) {
    n._q = norm(n.title + ' ' + n.path + ' ' + (n.desc || '') + ' ' + (n.snippet || ''));
    PATHMAP[n.path] = n;
    const base = n.path.split('/').pop().toLowerCase();
    (BYBASE[base] = BYBASE[base] || []).push(n);
  }
  function search(q, limit = 14) {
    q = norm(q).trim();
    if (!q) return [];
    const words = q.split(/\s+/);
    const scored = [];
    for (const n of ALL) {
      if (!words.every(w => n._q.includes(w))) continue;
      const t = norm(n.title);
      let s = 0;
      for (const w of words) { if (t.includes(w)) s += 10; if (t.startsWith(w)) s += 5; if (norm(n.path).includes(w)) s += 3; }
      s += Math.min(n.deg || 0, 30) / 10;
      scored.push([s, n]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, limit).map(x => x[1]);
  }
  function matchSet(q) {
    q = norm(q).trim();
    if (!q) return null;
    const words = q.split(/\s+/);
    return new Set(ALL.filter(n => words.every(w => n._q.includes(w))).map(n => n.id));
  }
  // De una mención dentro de un archivo ("personas/diego.md") al nodo real
  function resolveRef(from, ref) {
    ref = String(ref || '').trim().replace(/^\.\//, '');
    if (!/\.[a-z0-9]{2,5}$/i.test(ref) || /^https?:/i.test(ref)) return null;
    if (PATHMAP[ref]) return PATHMAP[ref];
    if (from && from.folder && from.folder !== '(raíz)') {
      const parts = from.folder.split('/');
      for (const seg of ref.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
      if (PATHMAP[parts.join('/')]) return PATHMAP[parts.join('/')];
    }
    const clean = ref.replace(/^(\.\.\/)+/, '');
    const suffix = ALL.filter(n => n.path === clean || n.path.endsWith('/' + clean));
    if (suffix.length) return suffix[0];
    const cands = BYBASE[clean.split('/').pop().toLowerCase()] || [];
    if (!cands.length) return null;
    const top = from && from.path ? from.path.split('/')[0] : '';
    return cands.find(n => n.path.split('/')[0] === top) || cands[0];
  }

  // ---------- rutinas: próximo disparo ----------
  function nextRun(r, from = new Date()) {
    if (r.unica) { const d = new Date(r.unica); return d > from ? d : null; }
    if (!r.activa || !r.hora || !r.dias) return null;
    const [hh, mm] = r.hora.split(':').map(Number);
    for (let i = 0; i < 8; i++) {
      const d = new Date(from); d.setDate(d.getDate() + i); d.setHours(hh, mm, 0, 0);
      if (r.dias.includes(d.getDay()) && d > from) return d;
    }
    return null;
  }
  function todayRuns(now = new Date()) {
    const out = [];
    for (const r of B.routines) {
      if (r.unica) {
        const d = new Date(r.unica);
        if (d.toDateString() === now.toDateString()) out.push({ r, when: d });
        continue;
      }
      if (!r.activa || !r.hora || !r.dias || !r.dias.includes(now.getDay())) continue;
      const [hh, mm] = r.hora.split(':').map(Number);
      const d = new Date(now); d.setHours(hh, mm, 0, 0);
      out.push({ r, when: d });
    }
    out.sort((a, b) => a.when - b.when);
    let nextMarked = false;
    for (const x of out) {
      const last = x.r.ultima ? new Date(x.r.ultima) : null;
      // tolerancia de 10 min: Claude arranca las tareas con unos minutos de variación
      if (x.when <= now) x.status = (last && last >= x.when - 6e5) ? 'HECHA' : 'YA PASÓ';
      else if (!nextMarked) { x.status = 'SIGUIENTE'; nextMarked = true; }
      else x.status = 'EN COLA';
    }
    return out;
  }

  // ---------- avisos y portapapeles ----------
  let toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }
  function copyFallback(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove(); return ok;
  }
  async function copy(text, msg) {
    let ok = copyFallback(text);
    if (!ok) {
      try { await Promise.race([navigator.clipboard.writeText(text), new Promise((_, r) => setTimeout(r, 800))]); ok = true; } catch { ok = false; }
    }
    toast(ok ? (msg || 'Copiado') : 'No se pudo copiar: ' + text);
  }

  // ---------- servidor local (acciones reales) ----------
  const api = {
    live: false, info: null, ready: null,
    async get(path) {
      const r = await fetch(path, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || 'Error ' + r.status), { gone: !!j.gone });
      return j;
    },
    async post(path, body) {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MOCA': '1' }, body: JSON.stringify(body || {}) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
      return j;
    }
  };
  api.ready = fetch('/api/health', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject())
    .then(j => { api.live = true; api.info = j; return true; }).catch(() => false);
  const NEED = 'Esto necesita abrir el panel con “Abrir MOCA.command”';

  async function openDevice(n, reveal) {
    if (!(await api.ready)) return toast(NEED);
    try {
      const j = await api.post('/api/open', { path: n.href, reveal: !!reveal });
      toast(j.copia ? 'Ya no está en tu Knowledge: te muestro la copia del panel en Finder. Lo que cambies ahí se pierde al actualizar.' : (j.revealed ? 'En Finder: ' : 'Abierto: ') + j.path);
    } catch (e) { toast('No se pudo abrir: ' + e.message); }
  }
  const realPath = n => n.ruta || (n.href && n.href.startsWith('vault/') ? (B.knowledgeDir || 'Knowledge') + '/' + n.path : n.path);
  async function rescan(btn) {
    if (!(await api.ready)) { location.reload(); return; }
    if (btn) btn.classList.add('busy');
    toast('Actualizando desde tu Knowledge…');
    try {
      const j = await api.post('/api/rescan');
      toast(`Actualizado en ${j.seconds} s. Recargando…`);
      setTimeout(() => location.reload(), 700);
    } catch (e) { toast('No se pudo actualizar: ' + e.message); if (btn) btn.classList.remove('busy'); }
  }

  // ---------- capas: Esc cierra la de arriba ----------
  const layers = [];
  function dropLayer(id) { const i = layers.findIndex(l => l.id === id); if (i >= 0) layers.splice(i, 1); }
  function pushLayer(id, close) { dropLayer(id); layers.push({ id, close }); }
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !layers.length) return;
    const a = document.activeElement;
    if (a && a.matches && a.matches('.search input') && a.value) return;
    e.preventDefault(); e.stopPropagation();
    layers[layers.length - 1].close();
  }, true);
  const typing = () => { const a = document.activeElement; return !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };

  function modal(html) {
    let el = document.querySelector('.modal');
    if (!el) {
      el = document.createElement('div'); el.className = 'modal'; el.innerHTML = '<div class="box"></div>';
      document.body.appendChild(el);
      el.addEventListener('mousedown', e => { if (e.target === el) close(); });
    }
    function close() { el.classList.remove('open'); dropLayer('modal'); }
    el.querySelector('.box').innerHTML = `<button class="x" title="Cerrar (Esc)">${icon('x')}</button>` + html;
    el.querySelector('.x').onclick = close;
    el.classList.add('open'); pushLayer('modal', close);
    return el.querySelector('.box');
  }

  // ---------- buscador con resultados ----------
  function mountSearch(root, { onPick, onQuery, placeholder }) {
    root.innerHTML = `${icon('search')}<input placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false"><span class="kbd">/</span><div class="results"></div>`;
    const input = root.querySelector('input'), res = root.querySelector('.results');
    let items = [], sel = 0;
    function render() {
      const q = input.value;
      items = search(q);
      if (onQuery) onQuery(q);
      if (!q.trim()) { res.classList.remove('open'); return; }
      res.innerHTML = items.length ? items.map((n, i) => `<div class="r${i === sel ? ' sel' : ''}" data-i="${i}">
        <span class="dot" style="color:${CAT_COLOR[n.cat]}"></span><div style="min-width:0"><div class="t">${esc(n.title)}</div><div class="p">${esc(n.path)}</div></div></div>`).join('')
        : `<div class="empty">Sin resultados para “${esc(q)}”.</div>`;
      res.classList.add('open');
    }
    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); render(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); render(); e.preventDefault(); }
      if (e.key === 'Enter' && items[sel]) { onPick(items[sel]); res.classList.remove('open'); input.blur(); }
      if (e.key === 'Escape') { input.value = ''; render(); input.blur(); }
    });
    res.addEventListener('mousedown', e => {
      const r = e.target.closest('.r'); if (!r) return;
      onPick(items[+r.dataset.i]); res.classList.remove('open');
    });
    input.addEventListener('blur', () => setTimeout(() => res.classList.remove('open'), 150));
    input.addEventListener('focus', () => { if (input.value.trim()) render(); });
    window.addEventListener('keydown', e => {
      if (e.key === '/' && !typing() && !layers.some(l => l.id !== 'drawer')) { e.preventDefault(); input.focus(); input.select(); }
    });
    return { input, set(v) { input.value = v; sel = 0; render(); } };
  }

  // ---------- ficha lateral ----------
  function mountDrawer(opts = {}) {
    const el = document.createElement('aside');
    el.className = 'drawer';
    document.body.appendChild(el);
    function open(n) {
      const nb = (ADJ[n.id] || []).map(id => BYID[id]).filter(Boolean).sort((a, b) => (b.deg || 0) - (a.deg || 0));
      el.innerHTML = `
        <button class="x" title="Cerrar (Esc)">${icon('x')}</button>
        <div class="hd">
          <div style="display:flex;gap:6px;flex-wrap:wrap;padding-right:36px">
            <span class="chip" style="color:${CAT_COLOR[n.cat]};border-color:${CAT_COLOR[n.cat]}55"><span class="dot" style="width:6px;height:6px"></span>${esc(B.catLabel[n.cat] || '')}</span>
            <span class="chip">${esc(n.ext.toUpperCase())}</span>${n.origen ? `<span class="chip">${esc(n.origen)}</span>` : ''}
          </div>
          <h3>${esc(n.title)}</h3><div class="p">${esc(realPath(n))}</div>
        </div>
        <div class="bd">
          ${n.thumb ? `<div class="dprev" data-full title="Ver completo"><img loading="lazy" src="${esc(urlOf(n.thumb))}" alt=""></div>` : ''}
          <div class="dstats">
            <div class="stat"><b>${(n.words || 0).toLocaleString('es-MX')}</b><span>palabras</span></div>
            <div class="stat"><b>${(ADJ[n.id] || []).length}</b><span>conexiones</span></div>
            <div class="stat"><b>${fdate(n.mtime)}</b><span>modificado</span></div>
          </div>
          ${n.desc ? `<div class="snip">${esc(n.desc)}</div>` : ''}
          ${n.snippet ? `<div><div class="caps" style="margin-bottom:8px">Vista previa</div><div class="snip" style="border-color:${CAT_COLOR[n.cat]}">${esc(n.snippet)}…</div></div>` : ''}
          ${n.pieces && n.pieces.length ? `<div><div class="caps" style="margin-bottom:6px">Piezas · ${n.nPieces || n.pieces.length}</div><ul class="pieces">${n.pieces.slice(0, 10).map(p => `<li>${icon('corner-down-right')}${esc(p)}</li>`).join('')}</ul></div>` : ''}
          ${nb.length ? `<div><div class="caps" style="margin-bottom:6px">Conectado con · ${nb.length}</div><ul>${nb.slice(0, 18).map(m => `<li data-id="${m.id}"><span class="dot" style="color:${CAT_COLOR[m.cat]}"></span><span class="lt">${esc(m.title)}</span><span class="m">${esc(m.ext)}</span></li>`).join('')}</ul></div>` : ''}
        </div>
        <div class="ft">
          <button class="btn accent" data-full>${icon('maximize-2')}Ver completo</button>
          <button class="btn" data-dev>${icon('external-link')}Abrir en la compu</button>
          <button class="btn" data-copy title="Copiar ruta">${icon('copy')}</button>
        </div>`;
      el.querySelector('.x').onclick = close;
      el.querySelectorAll('[data-full]').forEach(b => b.onclick = () => opts.onFull && opts.onFull(n));
      el.querySelector('[data-dev]').onclick = () => openDevice(n);
      el.querySelector('[data-copy]').onclick = () => copy(realPath(n), 'Ruta copiada');
      el.querySelectorAll('li[data-id]').forEach(li => li.onclick = () => opts.onNav && opts.onNav(BYID[li.dataset.id]));
      el.classList.add('open'); pushLayer('drawer', close);
    }
    function close() { el.classList.remove('open'); dropLayer('drawer'); if (opts.onClose) opts.onClose(); }
    return { open, close, el, get isOpen() { return el.classList.contains('open'); } };
  }

  // ---------- visor completo ----------
  const TEXT_KIND = { md: 'markdown', html: 'html', htm: 'html', txt: 'text', json: 'text', py: 'text', csv: 'text', js: 'text', css: 'text' };
  const EMBED = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'mov']);
  async function loadFile(n) {
    if (await api.ready) return api.get('/api/file?path=' + encodeURIComponent(n.href));
    const url = urlOf(n.href);
    if (TEXT_KIND[n.ext]) {
      const r = await fetch(url);
      if (!r.ok) throw new Error('No pude leer el archivo');
      return { kind: TEXT_KIND[n.ext], text: await r.text(), url };
    }
    if (EMBED.has(n.ext)) return { kind: 'embed', url };
    return { kind: 'needserver' };
  }
  function splitFM(text) {
    const m = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(text);
    if (!m) return { fm: [], body: text };
    const fm = [], lines = m[1].split('\n');
    for (let i = 0; i < lines.length; i++) {
      const mm = /^\s*([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]);
      if (!mm) continue;
      let v = mm[2].trim();
      if (/^[>|][+-]?$/.test(v)) {
        const buf = [];
        while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || !lines[i + 1].trim())) buf.push(lines[++i].trim());
        v = buf.filter(Boolean).join(' ');
      }
      v = v.replace(/^["']|["']$/g, '');
      if (v) fm.push([mm[1], v]);
    }
    return { fm, body: text.slice(m[0].length) };
  }
  function mdHTML(text) {
    const { fm, body } = splitFM(text || '');
    let h = '';
    if (fm.length) h += `<div class="fm">${fm.map(([k, v]) => `<div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>`).join('')}</div>`;
    if (window.marked && window.DOMPurify) h += `<div class="md">${window.DOMPurify.sanitize(window.marked.parse(body, { gfm: true }))}</div>`;
    else h += `<pre class="code">${esc(body)}</pre>`;
    return h;
  }
  const emptyState = (ic, t, s) => `<div class="vempty">${icon(ic)}<b>${esc(t)}</b><span>${esc(s || '')}</span></div>`;

  function mountViewer(opts = {}) {
    const el = document.createElement('div');
    el.className = 'viewer';
    el.innerHTML = '<div class="vbox"><aside class="vside"></aside><section class="vmain"><header class="vhead"></header><div class="vbody"></div></section></div>';
    document.body.appendChild(el);
    const side = el.querySelector('.vside'), head = el.querySelector('.vhead'), body = el.querySelector('.vbody');
    let token = 0, pollTimer = null;
    el.addEventListener('mousedown', e => { if (e.target === el) close(); });
    function show() { el.classList.add('open'); pushLayer('viewer', close); }
    function close() {
      token++; clearTimeout(pollTimer);
      el.classList.remove('open'); dropLayer('viewer'); body.innerHTML = '';
      if (opts.onClose) opts.onClose();
    }

    function wireMd(n) {
      body.querySelectorAll('.md a[href]').forEach(a => {
        const href = a.getAttribute('href') || '';
        if (/^(https?:|mailto:)/i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; return; }
        let ref = href.split('#')[0];
        try { ref = decodeURIComponent(ref); } catch { /* se deja tal cual */ }
        const target = ref ? resolveRef(n, ref) : null;
        if (target) a.classList.add('flink');
        a.addEventListener('click', e => {
          e.preventDefault();
          if (target) open(target); else if (ref) toast('Ese enlace apunta fuera del panel');
        });
      });
      body.querySelectorAll('.md code').forEach(c => {
        if (c.closest('pre')) return;
        const target = resolveRef(n, c.textContent);
        if (target && target.id !== n.id) {
          c.classList.add('flink'); c.title = 'Abrir: ' + target.title;
          c.addEventListener('click', () => open(target));
        }
      });
      body.querySelectorAll('.md table').forEach(t => { const w = document.createElement('div'); w.className = 'tw'; t.replaceWith(w); w.appendChild(t); });
    }

    function renderBody(n, d) {
      const url = d.url || urlOf(n.href);
      body.className = 'vbody k-' + d.kind;
      if (d.kind === 'markdown') { body.innerHTML = mdHTML(d.text) + (d.truncated ? '<div class="vnote">Archivo muy largo: se muestra el inicio.</div>' : ''); wireMd(n); }
      else if (d.kind === 'html') {
        body.innerHTML = `<div class="vtool"><div class="seg"><button class="on" data-m="v">Vista</button><button data-m="c">Código</button></div><span class="caps">Página interactiva · ${fsize(d.size || n.size || 0)}</span></div>
          <iframe class="vframe" src="${esc(url)}" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" referrerpolicy="no-referrer"></iframe><pre class="code" hidden>${esc(d.text || '')}</pre>`;
        const fr = body.querySelector('.vframe'), pre = body.querySelector('pre');
        body.querySelectorAll('.vtool button').forEach(b => b.onclick = () => {
          body.querySelectorAll('.vtool button').forEach(x => x.classList.toggle('on', x === b));
          fr.hidden = b.dataset.m !== 'v'; pre.hidden = b.dataset.m !== 'c';
        });
      } else if (d.kind === 'text') {
        let t = d.text || '';
        if (n.ext === 'json' && t.length < 400000) { try { t = JSON.stringify(JSON.parse(t), null, 2); } catch { /* se muestra como venga */ } }
        body.innerHTML = `<pre class="code">${esc(t)}</pre>` + (d.truncated ? '<div class="vnote">Archivo muy largo: se muestra el inicio.</div>' : '');
      } else if (d.kind === 'docx') {
        const ps = d.paragraphs || [];
        body.innerHTML = ps.length ? `<div class="md doc">${ps.map(p => p.h ? `<h3>${esc(p.t)}</h3>` : `<p>${esc(p.t)}</p>`).join('')}</div><div class="vnote">Vista de solo texto. Para ver el formato, ábrelo en la compu.</div>`
          : emptyState('file-type', 'Documento sin texto', 'Ábrelo en la compu para verlo.');
      } else if (d.kind === 'xlsx') {
        const sheets = d.sheets || [];
        if (!sheets.length) { body.innerHTML = emptyState('sheet', 'No pude leer las hojas', 'Ábrelo en la compu para verlo.'); return; }
        body.innerHTML = `<div class="vtool"><div class="seg">${sheets.map((s, i) => `<button class="${i ? '' : 'on'}" data-i="${i}">${esc(s.name)}</button>`).join('')}</div><span class="caps">Primeras 80 filas</span></div><div class="xl"></div>`;
        const draw = i => {
          const rows = sheets[i].rows || [], cols = Math.max(0, ...rows.map(r => r.length));
          body.querySelector('.xl').innerHTML = rows.length ? `<table>${rows.map((r, ri) => `<tr>${Array.from({ length: cols }, (_, ci) => `<${ri ? 'td' : 'th'}>${esc(r[ci] ?? '')}</${ri ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>` : emptyState('sheet', 'Hoja vacía', '');
        };
        body.querySelectorAll('.vtool button').forEach(b => b.onclick = () => {
          body.querySelectorAll('.vtool button').forEach(x => x.classList.toggle('on', x === b)); draw(+b.dataset.i);
        });
        draw(0);
      } else if (d.kind === 'embed') {
        if (n.ext === 'pdf') body.innerHTML = `<iframe class="vframe" src="${esc(url)}"></iframe>`;
        else if (n.ext === 'mp4' || n.ext === 'mov') body.innerHTML = `<div class="vimg"><video src="${esc(url)}" controls></video></div>`;
        else body.innerHTML = `<div class="vimg"><img src="${esc(url)}" alt="${esc(n.title)}"></div>`;
      } else if (d.kind === 'needserver') body.innerHTML = emptyState('plug', 'Vista no disponible así', NEED + '.');
      else if (d.kind === 'gone') {
        body.innerHTML = `<div class="vempty">${icon('file-x')}<b>Este archivo ya no está</b><span>Se borró o se movió después de la última actualización. Actualiza y el panel se acomoda solo: desaparece de la esfera, del mapa y de Artifacts.</span><button class="btn accent" data-rescan>${icon('refresh-cw')}Actualizar ahora</button></div>`;
        body.querySelector('[data-rescan]').onclick = e => rescan(e.currentTarget);
      }
      else if (d.kind === 'error') body.innerHTML = emptyState('triangle-alert', 'No pude leer el archivo', d.error || '');
      else body.innerHTML = emptyState(extIcon(n.ext), 'Este tipo de archivo no se puede ver aquí', 'Usa “Abrir en la compu”.');
    }

    async function open(n) {
      const my = ++token; clearTimeout(pollTimer);
      show();
      const nb = (ADJ[n.id] || []).map(id => BYID[id]).filter(Boolean).sort((a, b) => (b.deg || 0) - (a.deg || 0));
      const color = CAT_COLOR[n.cat] || '#fff';
      const tab = n.ext === 'html' || EMBED.has(n.ext);
      side.innerHTML = `
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="chip" style="color:${color};border-color:${color}55"><span class="dot" style="width:6px;height:6px"></span>${esc(n.label || B.catLabel[n.cat] || 'ARCHIVO')}</span>
          <span class="chip">${esc(String(n.ext).toUpperCase())}</span>${n.origen ? `<span class="chip">${esc(n.origen)}</span>` : ''}
        </div>
        <h3>${esc(n.title)}</h3>
        ${n.desc ? `<div class="snip">${esc(n.desc)}</div>` : ''}
        <div class="dstats">
          ${n.words ? `<div class="stat"><b>${n.words.toLocaleString('es-MX')}</b><span>palabras</span></div>` : ''}
          ${n.size ? `<div class="stat"><b>${fsize(n.size)}</b><span>tamaño</span></div>` : ''}
          <div class="stat"><b>${fdate(n.mtime)}</b><span>${ago(n.mtime)}</span></div>
          ${n.pseudo ? '' : `<div class="stat"><b>${nb.length}</b><span>conexiones</span></div>`}
        </div>
        ${!n.pseudo && opts.onFly ? `<button class="btn" data-fly>${icon('locate-fixed')}Ver en el mapa</button>` : ''}
        ${n.pieces && n.pieces.length ? `<div><div class="caps">Piezas · ${n.nPieces || n.pieces.length}</div><ul class="pieces">${n.pieces.map((p, i) => `<li data-p="${i}">${icon('corner-down-right')}<span class="lt">${esc(p)}</span></li>`).join('')}</ul></div>` : ''}
        ${nb.length ? `<div><div class="caps">Conectado con · ${nb.length}</div><ul>${nb.slice(0, 40).map(m => `<li data-id="${m.id}"><span class="dot" style="color:${CAT_COLOR[m.cat]}"></span><span class="lt">${esc(m.title)}</span><span class="m">${esc(m.ext)}</span></li>`).join('')}</ul></div>` : ''}`;
      head.innerHTML = `<div class="vt"><b>${esc(String(realPath(n)).split('/').pop())}</b><span>${esc(realPath(n))}</span></div>
        <div class="acts">
          <button class="btn accent" data-dev>${icon('external-link')}Abrir en la compu</button>
          <button class="btn" data-rev>${icon('folder-open')}Ver en Finder</button>
          ${tab ? `<button class="btn" data-tab>${icon('square-arrow-out-up-right')}Pestaña nueva</button>` : ''}
          <button class="btn" data-copy>${icon('copy')}Copiar ruta</button>
          <button class="iconbtn" data-x title="Cerrar (Esc)">${icon('x')}</button>
        </div>`;
      head.querySelector('[data-dev]').onclick = () => openDevice(n);
      head.querySelector('[data-rev]').onclick = () => openDevice(n, true);
      head.querySelector('[data-copy]').onclick = () => copy(realPath(n), 'Ruta copiada');
      head.querySelector('[data-x]').onclick = close;
      if (tab) head.querySelector('[data-tab]').onclick = () => window.open(urlOf(n.href), '_blank', 'noopener');
      const fly = side.querySelector('[data-fly]');
      if (fly) fly.onclick = () => { close(); opts.onFly(n); };
      side.querySelectorAll('li[data-id]').forEach(li => li.onclick = () => open(BYID[li.dataset.id]));
      side.querySelectorAll('li[data-p]').forEach(li => li.onclick = () => {
        const want = norm(n.pieces[+li.dataset.p]).slice(0, 40);
        const h = [...body.querySelectorAll('.md h1,.md h2,.md h3,.md h4')].find(x => norm(x.textContent).startsWith(want));
        if (h) { h.scrollIntoView({ behavior: 'smooth', block: 'start' }); h.classList.add('flash'); setTimeout(() => h.classList.remove('flash'), 1400); }
      });
      body.className = 'vbody'; body.scrollTop = 0;
      body.innerHTML = `<div class="vload">${icon('loader-circle', 'i spin')}Cargando…</div>`;
      let data;
      try { data = await loadFile(n); } catch (e) { data = { kind: e.gone ? 'gone' : 'error', error: e.message }; }
      if (my !== token) return;
      renderBody(n, data);
      if (data.original === false) head.querySelector('.vt').insertAdjacentHTML('beforeend', `<em class="vgone">${icon('triangle-alert')}Ya no está en tu Knowledge: ves la última copia. Actualiza para quitarlo.</em>`);
    }

    function drawRun(r) {
      const [c, ic] = STATUS[r.status] || STATUS.error;
      const running = r.status === 'corriendo';
      const dur = (r.ended || Date.now() / 1000) - r.started;
      side.innerHTML = `
        <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="chip" style="color:${c};border-color:${c}">${icon(ic, 'i' + (running ? ' spin' : ''), 'style="width:11px;height:11px"')}${esc(r.status.toUpperCase())}</span><span class="chip">SOLO LECTURA</span></div>
        <h3>${esc(r.skill ? '/' + r.skill : 'Pregunta a tu Knowledge')}</h3>
        <div class="snip">${esc(r.prompt)}</div>
        <div class="dstats">
          <div class="stat"><b>${modelName(r.model)}</b><span>modelo</span></div>
          <div class="stat"><b>${({ low: 'Bajo', medium: 'Medio', high: 'Alto', xhigh: 'Muy alto', max: 'Máximo' })[r.effort] || r.effort}</b><span>esfuerzo</span></div>
          <div class="stat"><b>${fdur(dur)}</b><span>${running ? 'corriendo' : 'duración'}</span></div>
          <div class="stat"><b>${r.tokens ? fnum(r.tokens) : '—'}</b><span>tokens</span></div>
          <div class="stat"><b>${r.cost != null ? fusd(r.cost) : '—'}</b><span>equiv. API</span></div>
          <div class="stat"><b>${r.web ? 'Sí' : 'No'}</b><span>internet</span></div>
        </div>
        <div class="caps">Inició ${fdatetime(r.started * 1000)}</div>
        ${r.denied ? `<div class="vnote">Claude intentó ${r.denied} acción(es) que el modo solo lectura no permite.</div>` : ''}`;
      head.innerHTML = `<div class="vt"><b>Ejecución en segundo plano</b><span>${esc(r.id)}</span></div>
        <div class="acts">
          ${running ? `<button class="btn" data-stop>${icon('square')}Detener</button>` : `<button class="btn accent" data-copy>${icon('copy')}Copiar resultado</button>`}
          <button class="iconbtn" data-x title="Cerrar (Esc)">${icon('x')}</button>
        </div>`;
      head.querySelector('[data-x]').onclick = close;
      const stop = head.querySelector('[data-stop]'), cp = head.querySelector('[data-copy]');
      if (stop) stop.onclick = async () => { try { await api.post(`/api/runs/${r.id}/stop`); toast('Detenida'); } catch (e) { toast(e.message); } };
      if (cp) cp.onclick = () => copy(r.result || '', 'Resultado copiado');
      body.className = 'vbody k-markdown';
      if (running) body.innerHTML = `<div class="vload big">${icon('loader-circle', 'i spin')}<b>Claude está trabajando en segundo plano</b><span>Puedes cerrar esta ventana. Te aviso cuando termine.</span></div>`;
      else if (r.status === 'sin sesión') body.innerHTML = `<div class="vempty">${icon('key-round')}<b>Falta iniciar sesión una vez</b><span>Claude funciona dentro de la app, pero para correr desde el panel necesita su propia sesión.</span></div><pre class="code">${esc(r.result || '')}</pre>`;
      else body.innerHTML = mdHTML(r.result || '(Sin respuesta)');
    }
    async function openRun(id) {
      const my = ++token; clearTimeout(pollTimer);
      show();
      side.innerHTML = ''; head.innerHTML = ''; body.className = 'vbody';
      body.innerHTML = `<div class="vload">${icon('loader-circle', 'i spin')}Cargando…</div>`;
      const tick = async () => {
        let r;
        try { r = await api.get('/api/runs/' + encodeURIComponent(id)); }
        catch (e) { if (my === token) { body.innerHTML = emptyState('triangle-alert', 'No encontré esa ejecución', e.message); head.innerHTML = `<div class="vt"></div><div class="acts"><button class="iconbtn" data-x>${icon('x')}</button></div>`; head.querySelector('[data-x]').onclick = close; } return; }
        if (my !== token) return;
        drawRun(r);
        if (r.status === 'corriendo') pollTimer = setTimeout(tick, 2500); else runs.refresh();
      };
      tick();
    }
    return { open, openRun, close, el, get isOpen() { return el.classList.contains('open'); } };
  }

  // ---------- ejecuciones en segundo plano ----------
  const STATUS = {
    'corriendo': ['var(--accent)', 'loader-circle'], 'terminada': ['var(--green)', 'circle-check'], 'error': ['var(--red)', 'circle-x'],
    'sin sesión': ['var(--amber)', 'key-round'], 'detenida': ['var(--dim)', 'square']
  };
  function runsHTML(items, limit) {
    if (!items.length) return `<div class="rempty">Aún no corres nada desde el panel.</div>`;
    return items.slice(0, limit).map(r => {
      const [c, ic] = STATUS[r.status] || STATUS.error;
      const dur = (r.ended || Date.now() / 1000) - r.started;
      return `<div class="run" data-run="${esc(r.id)}" title="${esc(r.prompt)}"><span class="rs" style="color:${c}">${icon(ic, 'i' + (r.status === 'corriendo' ? ' spin' : ''))}</span><span class="rn">${esc(r.skill ? '/' + r.skill : r.prompt)}</span><span class="rm">${modelName(r.model)} · ${r.status === 'corriendo' ? fdur(dur) : ago(r.started * 1000)}</span></div>`;
    }).join('');
  }
  const runs = {
    items: [], prev: {}, timer: null, bound: false,
    paint() { document.querySelectorAll('[data-runs]').forEach(el => { el.innerHTML = runsHTML(this.items, +el.dataset.runs || 5); const strip = el.closest('.runstrip'); if (strip) strip.classList.toggle('empty', !this.items.length); }); document.querySelectorAll('[data-runcount]').forEach(el => { const n = this.items.filter(r => r.status === 'corriendo').length; el.textContent = n ? n + ' corriendo' : (this.items.length ? this.items.length + ' en total' : ''); }); },
    async refresh() {
      if (await api.ready) {
        try { this.items = (await api.get('/api/runs')).runs || []; } catch { /* se queda la lista anterior */ }
        for (const r of this.items) {
          if (this.prev[r.id] === 'corriendo' && r.status !== 'corriendo') toast((r.skill ? '/' + r.skill : 'Tu pregunta') + ': ' + r.status);
          this.prev[r.id] = r.status;
        }
      }
      this.paint();
      clearTimeout(this.timer);
      if (this.items.some(r => r.status === 'corriendo')) this.timer = setTimeout(() => this.refresh(), 3000);
    },
    bind(viewer) {
      if (this.bound) return; this.bound = true;
      document.addEventListener('click', e => { const el = e.target.closest('[data-run]'); if (el) viewer.openRun(el.dataset.run); });
      this.refresh();
    }
  };

  function runDialog(skill, preset) {
    const id = skill ? skill.id : '';
    const key = 'moca.run.' + (id || 'libre');
    const pref = { model: 'sonnet', effort: 'medium', web: false };
    try { Object.assign(pref, JSON.parse(localStorage.getItem(key) || '{}')); } catch { /* sin preferencias guardadas */ }
    if (preset && preset.model) Object.assign(pref, { model: preset.model, effort: preset.effort || pref.effort });
    const seg = (k, arr) => `<div class="seg" data-k="${k}">${arr.map(([v, l]) => `<button type="button" data-v="${v}" class="${pref[k] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const el = document.createElement('div');
    el.className = 'dlg open';
    el.innerHTML = `<div class="dbox">
      <div class="dh"><span class="ico">${icon(skill ? skill.icono : 'message-circle-question')}</span><div><h3>${skill ? '/' + esc(id.split(':').pop()) + (id.includes(':') ? ` <small class="dorig">${esc(id.split(':')[0])}</small>` : '') : 'Pregúntale a tu Knowledge'}</h3><p>${esc(skill ? skill.desc : 'Claude lee tus archivos y te contesta con lo que encuentre. No edita nada.')}</p></div></div>
      <textarea rows="4" placeholder="${skill ? 'Qué quieres que haga (opcional). Ejemplo: enfócate en Onboarding' : 'Tu pregunta. Ejemplo: ¿qué le prometí a Diego para el viernes?'}"></textarea>
      <div class="drow"><span class="caps">Modelo</span>${seg('model', [['haiku', 'Haiku · rápido'], ['sonnet', 'Sonnet'], ['opus', 'Opus · a fondo'], ['fable', 'Fable']])}</div>
      <div class="drow"><span class="caps">Esfuerzo</span>${seg('effort', [['low', 'Bajo'], ['medium', 'Medio'], ['high', 'Alto'], ['xhigh', 'Muy alto'], ['max', 'Máximo']])}</div>
      <label class="dchk"><input type="checkbox" ${pref.web ? 'checked' : ''}><span>Permitir buscar en internet</span></label>
      <div class="dnote">${icon('shield-check')}<span>Solo lectura: Claude puede leer y buscar en tu Knowledge. No edita archivos ni ejecuta comandos. Corre en segundo plano y consume tu límite de uso.</span></div>
      <div class="dwarn" hidden></div>
      <div class="dft"><span class="kbd">⌘ Enter</span><button class="btn" data-x>Cancelar</button><button class="btn accent" data-go>${icon('play')}Correr en segundo plano</button></div></div>`;
    document.body.appendChild(el);
    const ta = el.querySelector('textarea'), warn = el.querySelector('.dwarn'), go = el.querySelector('[data-go]');
    const close = () => { el.remove(); dropLayer('dlg'); };
    pushLayer('dlg', close);
    el.addEventListener('mousedown', e => { if (e.target === el) close(); });
    el.querySelector('[data-x]').onclick = close;
    el.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
      pref[b.parentElement.dataset.k] = b.dataset.v;
      b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    });
    const fail = (msg, cmd) => {
      warn.hidden = false;
      warn.innerHTML = `${icon('triangle-alert')}<span>${esc(msg)}</span>` + (cmd ? `<button class="btn" data-cp>${icon('copy')}Copiar comando</button>` : '');
      const cp = warn.querySelector('[data-cp]'); if (cp) cp.onclick = () => copy(cmd, 'Comando copiado: pégalo en Claude');
      go.disabled = false;
    };
    async function submit() {
      const text = ta.value.trim();
      if (!skill && !text) { ta.focus(); return fail('Escribe tu pregunta.'); }
      pref.web = el.querySelector('.dchk input').checked;
      try { localStorage.setItem(key, JSON.stringify(pref)); } catch { /* sin almacenamiento */ }
      go.disabled = true;
      if (!(await api.ready)) return fail(NEED + '. Mientras, puedes pegarlo en Claude.', (skill ? '/' + id + ' ' : '') + text);
      try {
        const r = await api.post('/api/run', { skill: id, prompt: text, model: pref.model, effort: pref.effort, web: pref.web });
        close(); toast('Claude está trabajando en segundo plano'); runs.prev[r.id] = 'corriendo'; runs.refresh();
      } catch (e) { fail(e.message); }
    }
    go.onclick = submit;
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } });
    setTimeout(() => ta.focus(), 30);
  }
  const runPref = id => { try { return JSON.parse(localStorage.getItem('moca.run.' + id) || 'null'); } catch { return null; } };

  // ---------- artifacts ----------
  function nodeFromArtifact(a) {
    if (a.node && BYID[a.node]) return BYID[a.node];
    return { id: 'a:' + a.href, title: a.titulo, path: a.ruta, ruta: a.ruta, href: a.href, ext: a.tipo, cat: 'raiz', label: 'ARTIFACT', mtime: a.fecha, origen: a.origen, thumb: a.thumb, pieces: [], pseudo: true };
  }
  function openArtifact(a, viewer) {
    if (a.url) window.open(a.url, '_blank', 'noopener');
    else viewer.open(nodeFromArtifact(a));
  }

  // ---------- lista para el modo mayordomo ----------
  const EST = {
    'hecho': ['var(--green)', 'circle-check'], 'pendiente': ['var(--accent)', 'circle-dot'], 'listo para crear': ['var(--cyan)', 'wand-sparkles'],
    'bloqueado': ['var(--red)', 'lock'], 'por decidir': ['var(--dim)', 'circle-help']
  };
  // «Tuyo» = la columna Quién trae tu nombre (owner.nombre de catalogo.json).
  const esMio = q => { const yo = ((B.owner && B.owner.nombre) || '').trim().toLowerCase(); return !!yo && (q || '').toLowerCase().includes(yo); };
  function sistemaResumen() {
    const s = B.pendientes.sistema || [];
    return { total: s.length, hechos: s.filter(i => i.estado === 'hecho').length, tuyos: s.filter(i => i.estado !== 'hecho' && esMio(i.quien)).length };
  }
  function checklistHTML() {
    const s = B.pendientes.sistema || [];
    if (!s.length) return '<div class="rempty">Sin lista. Corre el escaneo.</div>';
    const areas = [...new Set(s.map(i => i.area))];
    const r = sistemaResumen();
    const byEst = Object.keys(EST).map(k => ({ k, v: s.filter(i => i.estado === k).length, c: EST[k][0] })).filter(x => x.v);
    return `<div class="ckhead">${donut(byEst, 92, 11, r.hechos + '/' + r.total)}<div class="cklegend"><div class="cksum"><b>${r.hechos} de ${r.total}</b> listos · ${r.tuyos} dependen de ti</div>
      ${byEst.map(x => `<span class="lg"><i style="background:${x.c}"></i>${x.v} ${esc(x.k)}</span>`).join('')}</div></div>` +
      areas.map(a => `<div class="group-h caps">${esc(a)}</div><div class="cklist">${s.filter(i => i.area === a).map(i => {
        const [c, ic] = EST[i.estado] || EST['por decidir'];
        return `<div class="ck ${i.estado === 'hecho' ? 'done' : ''}"><span class="cki" style="color:${c}">${icon(ic)}</span><div class="ckb">
          <div class="ckt">${esc(i.titulo)}<span class="chip" style="color:${c};border-color:${c}66">${esc(i.estado)}</span>${i.quien ? `<span class="chip">${esc(i.quien)}</span>` : ''}</div>
          ${i.como && i.estado !== 'hecho' ? `<div class="ckc">${esc(i.como)}</div>` : ''}
          ${i.desbloquea ? `<div class="ckd">${icon('arrow-right', 'i', 'style="width:11px;height:11px"')}${esc(i.desbloquea)}</div>` : ''}</div></div>`;
      }).join('')}</div>`).join('');
  }

  // ---------- búsqueda global (⌘K) ----------
  function mountPalette(opts = {}) {
    const el = document.createElement('div');
    el.className = 'pal';
    el.innerHTML = `<div class="pbox"><div class="pin">${icon('search')}<input placeholder="Busca archivos, artifacts, skills o acciones…" spellcheck="false" autocomplete="off"><span class="kbd">esc</span></div><div class="plist"></div>
      <div class="pft"><span><span class="kbd">↑↓</span> moverte</span><span><span class="kbd">↵</span> abrir</span><span><span class="kbd">⌘K</span> esta búsqueda</span></div></div>`;
    document.body.appendChild(el);
    const input = el.querySelector('input'), list = el.querySelector('.plist');
    let items = [], sel = 0;
    function compute(q) {
      const words = norm(q).trim().split(/\s+/).filter(Boolean);
      const hit = s => words.every(w => norm(s).includes(w));
      const out = [];
      for (const a of opts.actions || []) if (!words.length || hit(a.label + ' ' + (a.keys || ''))) out.push({ g: 'Acciones', icon: a.icon, t: a.label, s: a.hint || '', run: a.run });
      const arts = B.artifacts.filter(a => !a.viejo && (!words.length || hit(a.titulo + ' ' + (a.ruta || '') + ' ' + a.origen))).slice(0, words.length ? 8 : 4);
      for (const a of arts) out.push({ g: 'Artifacts', icon: extIcon(a.tipo), t: a.titulo, s: a.origen + ' · ' + fdate(a.fecha), run: () => opts.onArtifact(a) });
      if (words.length) {
        for (const s of B.skills.filter(s => hit(s.id + ' ' + s.desc)).slice(0, 6)) out.push({ g: 'Skills', icon: s.icono, t: '/' + s.id, s: s.desc, run: () => opts.onSkill(s) });
        for (const n of search(q, 8)) out.push({ g: 'Archivos', dot: CAT_COLOR[n.cat], t: n.title, s: n.path, run: () => opts.onFile(n) });
      }
      return out;
    }
    function render() {
      items = compute(input.value);
      sel = Math.min(sel, Math.max(0, items.length - 1));
      let g = '';
      list.innerHTML = items.length ? items.map((it, i) => {
        const h = it.g !== g ? `<div class="pg caps">${it.g}</div>` : ''; g = it.g;
        return h + `<div class="pi${i === sel ? ' sel' : ''}" data-i="${i}">${it.dot ? `<span class="dot" style="color:${it.dot}"></span>` : icon(it.icon)}<span class="pt">${esc(it.t)}</span><span class="ps">${esc(it.s)}</span></div>`;
      }).join('') : `<div class="rempty">Nada con “${esc(input.value)}”.</div>`;
      const cur = list.querySelector('.pi.sel'); if (cur) cur.scrollIntoView({ block: 'nearest' });
    }
    const close = () => { el.classList.remove('open'); dropLayer('pal'); input.blur(); };
    const open = (q = '') => { input.value = q; sel = 0; render(); el.classList.add('open'); pushLayer('pal', close); setTimeout(() => input.focus(), 20); };
    const pick = i => { const it = items[i]; if (!it) return; close(); it.run(); };
    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); render(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); render(); e.preventDefault(); }
      if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
    });
    list.addEventListener('click', e => { const r = e.target.closest('.pi'); if (r) pick(+r.dataset.i); });
    el.addEventListener('mousedown', e => { if (e.target === el) close(); });
    window.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); el.classList.contains('open') ? close() : open(); }
      else if (opts.slash && e.key === '/' && !typing() && !layers.length) { e.preventDefault(); open(); }
    });
    return { open, close };
  }


  // ---------- lo visual: portadas, avatares, ilustraciones, contadores ----------
  const hue = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const initials = s => String(s || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  // Portada de un artifact o archivo: su miniatura real si existe; si no, una portada generada con su color
  function coverHTML(a, cls = '') {
    const tipo = a.tipo || a.ext || '';
    const badge = `<span class="cvt">${esc(tipo === 'claude' ? 'CLAUDE.AI' : String(tipo).toUpperCase())}</span>`;
    if (a.thumb) return `<div class="cover ${cls}"><img loading="lazy" decoding="async" src="${esc(urlOf(a.thumb))}" alt="">${badge}</div>`;
    return `<div class="cover gen ${cls}" style="--h:${hue(a.titulo || a.title || '')}">${icon(extIcon(tipo), 'cvi')}<span class="cvl">${esc(initials(a.titulo || a.title))}</span>${badge}</div>`;
  }
  function avatarsHTML(quien) {
    const names = String(quien || '').split(/\s+y\s+|,|\//).map(x => x.trim()).filter(Boolean).slice(0, 3);
    return names.map(n => /claude/i.test(n)
      ? `<span class="av ai" title="Claude">${icon('sparkles')}</span>`
      : `<span class="av" style="--h:${hue(n)}" title="${esc(n)}">${esc(initials(n) || '?')}</span>`).join('');
  }
  // Dona: parts = [{v, c}]
  function donut(parts, size = 56, stroke = 7, center = '') {
    const r = (size - stroke) / 2, C = 2 * Math.PI * r, total = parts.reduce((s, p) => s + p.v, 0) || 1;
    let off = 0;
    const arcs = parts.filter(p => p.v > 0).map(p => {
      const len = p.v / total * C;
      const seg = `<circle class="darc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${p.c}" stroke-width="${stroke}" stroke-dasharray="${Math.max(0, len - 1.5)} ${C}" stroke-dashoffset="${-off}" style="--len:${len}"/>`;
      off += len; return seg;
    }).join('');
    return `<svg class="donut" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="${stroke}"/><g transform="rotate(-90 ${size / 2} ${size / 2})">${arcs}</g>${center ? `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="dtx">${esc(center)}</text>` : ''}</svg>`;
  }
  // Número que sube desde cero. Va por reloj, y si la pestaña está oculta queda en el valor final.
  function countUp(el, to, fmt = v => Math.round(v).toLocaleString('es-MX'), ms = 900) {
    if (!el) return;
    const done = () => { el.textContent = fmt(to); };
    if (!isFinite(to) || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.hidden || root.classList.contains('still')) return done();
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(to * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(done, ms + 400);
  }
  // Ilustraciones de línea, animadas con CSS
  const ILLUS = {
    mail: `<svg class="illus" viewBox="0 0 220 96" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <rect class="il-s" x="12" y="24" width="72" height="50" rx="8"/><path class="il-s" d="M14 32l34 24 34-24"/>
      <path class="il-dash" d="M94 49h30"/><g class="il-x"><path d="M132 43l12 12M144 43l-12 12"/></g><path class="il-dash il-rev" d="M152 49h18"/>
      <circle class="il-s il-dim" cx="192" cy="49" r="20"/><circle class="il-s il-dim" cx="192" cy="43" r="6"/><path class="il-s il-dim" d="M180 60c3-7 21-7 24 0"/></svg>`,
    calendar: `<svg class="illus" viewBox="0 0 220 96" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <rect class="il-s" x="12" y="22" width="76" height="58" rx="9"/><path class="il-s" d="M12 40h76M32 14v14M68 14v14"/>
      ${[0, 1, 2, 3].map(c => [0, 1].map(r => `<circle class="il-dot" style="--i:${c + r * 4}" cx="${27 + c * 15}" cy="${53 + r * 14}" r="3"/>`).join('')).join('')}
      <path class="il-dash" d="M98 51h26"/><g class="il-x"><path d="M132 45l12 12M144 45l-12 12"/></g><path class="il-dash il-rev" d="M152 51h14"/>
      <path class="il-s il-dim" d="M178 62h24a10 10 0 0 0 1-20 14 14 0 0 0-27 3 9 9 0 0 0 2 17z"/></svg>`,
    done: `<svg class="illus" viewBox="0 0 220 96" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle class="il-s" cx="110" cy="48" r="30"/><path class="il-s il-check" d="M96 49l10 10 19-21"/></svg>`
  };
  const illus = name => ILLUS[name] || '';
  // Mini vistas para las micro apps internas
  const MINI = {
    'orbit': `<svg class="mini" viewBox="0 0 64 42"><circle class="mn-f" cx="32" cy="21" r="5"/><g class="mn-spin"><ellipse class="mn-s" cx="32" cy="21" rx="24" ry="9"/><circle class="mn-a" cx="56" cy="21" r="2.6"/><circle class="mn-a" cx="8" cy="21" r="2"/></g>${[[20, 12], [44, 30], [26, 31], [40, 11]].map(([x, y], i) => `<circle class="mn-d" style="--i:${i}" cx="${x}" cy="${y}" r="1.6"/>`).join('')}</svg>`,
    'inbox': `<svg class="mini" viewBox="0 0 64 42"><rect class="mn-s" x="20" y="6" width="34" height="22" rx="3"/><rect class="mn-s mn-bg" x="14" y="11" width="34" height="22" rx="3"/><rect class="mn-s mn-bg mn-hi" x="8" y="16" width="34" height="22" rx="3"/><path class="mn-a2" d="M13 23h14M13 29h22"/></svg>`,
    'timer': `<svg class="mini" viewBox="0 0 64 42">${[14, 24, 9, 30, 19, 26].map((h, i) => `<rect class="mn-bar" style="--i:${i}" x="${8 + i * 8.6}" y="${36 - h}" width="5.4" height="${h}" rx="1.5"/>`).join('')}<path class="mn-s" d="M5 37h54"/></svg>`,
    'share-2': `<svg class="mini" viewBox="0 0 64 42"><path class="mn-s" d="M14 12l18 9 18-10M32 21l-8 14M32 21l16 11"/>${[[14, 12], [50, 11], [24, 35], [48, 32]].map(([x, y], i) => `<circle class="mn-d mn-big" style="--i:${i}" cx="${x}" cy="${y}" r="3"/>`).join('')}<circle class="mn-f" cx="32" cy="21" r="4.5"/></svg>`,
    'chart-gantt': `<svg class="mini" viewBox="0 0 64 42"><path class="mn-s" d="M8 5v32h50"/>${[[13, 9, 22], [22, 18, 26], [31, 27, 20]].map(([x, y, w], i) => `<rect class="mn-bar mn-h" style="--i:${i}" x="${x}" y="${y}" width="${w}" height="5.5" rx="2"/>`).join('')}</svg>`
  };
  const mini = name => MINI[name] || '';

  window.UI = { hue, initials, coverHTML, avatarsHTML, donut, countUp, illus, mini, B, CAT_COLOR, CAT_ORDER, ALL, BYID, ADJ, icon, iconSVGString, extIcon, folderIcon, missingIcons, fdate, ftime, fdatetime, ago, fsize, fnum, fusd, fdur,
    modelName, norm, search, matchSet, resolveRef, nextRun, todayRuns, toast, copy, api, openDevice, realPath, rescan, modal, urlOf, mountSearch, mountDrawer,
    mountViewer, runs, runDialog, runPref, nodeFromArtifact, openArtifact, sistemaResumen, checklistHTML, EST, mountPalette, esc, MES, DIA, typing };
})();
