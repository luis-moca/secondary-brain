// Pantalla de inicio compartida por los dos paneles (portátil y original): agenda, correo, rutinas de hoy,
// skills con modelo × esfuerzo y la bandeja de artifacts alrededor de la esfera. Cada dato sale en un solo lugar.
// Solo usa window.UI y los datos de window.BRAIN; nada de rutas ni nombres fijos.
const UI = window.UI, B = UI.B, { icon, esc } = UI;
const $ = (s, r = document) => r.querySelector(s);
const p2 = n => String(n).padStart(2, '0');
const STILL = () => document.documentElement.classList.contains('still');
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const plain = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- preferencias: se guardan en el servidor; si no responde, en este navegador ----------
export const prefs = {
  data: { skills: {}, skills_archivadas: [], bandeja_ocultos: [] },
  async load() {
    try { Object.assign(this.data, JSON.parse(localStorage.getItem('moca.prefs') || '{}')); } catch { /* sin almacenamiento */ }
    try { const r = await fetch('/api/prefs', { cache: 'no-store' }); if (r.ok) Object.assign(this.data, await r.json()); } catch { /* servidor viejo o apagado */ }
    return this.data;
  },
  async save(patch) {
    Object.assign(this.data, patch);
    try { localStorage.setItem('moca.prefs', JSON.stringify(this.data)); } catch { /* sin almacenamiento */ }
    try { Object.assign(this.data, await UI.api.post('/api/prefs', this.data)); } catch { /* queda en el navegador */ }
  }
};

// ---------- encabezado de panel ----------
export const panelHead = (ico, title, right = '') => `<header class="pn-h"><h3>${icon(ico)}<span>${esc(title)}</span></h3><div class="pn-r">${right}</div></header>`;

// ---------- agenda: citas al calendario, tareas a "por hacer", rutinas a su panel; nada sale en dos lados ----------
const isoWeek = d => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 864e5 + 1) / 7);
};
const dayKey = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const norm = s => plain(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48);
// Lo que es una cita (tiene lugar en un día) va al calendario. Lo demás es una tarea y vive en "por hacer".
// "Weekly" o "1 a 1" solo son cita si van al inicio o como "Weekly con…": "Pasar el weekly a Drive" es una tarea.
const EVENTO = /\b(sesion|platica|reunion|junta|llamada|cita|entrevista|demo|kick ?off|stand ?up|success day|evento|taller|workshop|capacitacion|webinar|comida|desayuno|cena|visita|meeting|call|one on one)\b|^(weekly|daily)\b|\b(weekly|daily|1 ?a ?1) con\b/;
export const esEvento = t => {
  const p = plain(t).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(tarea|pendiente|recordatorio)\b/.test(p)) return false;   // lo que se anota como tarea es tarea
  return EVENTO.test(p);
};
// hora escrita en el texto ("10:30", "4 pm", "a las 9"); si no hay, es de todo el día
const horaDe = t => {
  const s = plain(t);
  let m = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm|a\.m\.|p\.m\.)?/);
  if (!m) m = s.match(/\b(1[0-2]|0?[1-9])\s*(am|pm|a\.m\.|p\.m\.)\b/), m = m && [m[0], m[1], '00', m[2]];
  if (!m) { const a = s.match(/\ba las (1[0-2]|0?[1-9])(?::([0-5]\d))?\b/); m = a && [a[0], a[1], a[2] || '00', '']; }
  if (!m) return null;
  let h = +m[1]; const pm = /^p/.test(m[3] || '');
  if (pm && h < 12) h += 12; if (/^a/.test(m[3] || '') && h === 12) h = 0;
  return [h, +m[2]];
};
export function tareas() {
  return (B.pendientes.tareas || []).filter(x => !x.recurrente && !(x.fecha && esEvento(x.que)));
}
export function agenda(dias = 14) {
  const now = new Date(), hoy0 = new Date(now.toDateString()), lim = new Date(hoy0); lim.setDate(lim.getDate() + dias);
  // dos textos son la misma cosa si uno empieza igual que el otro ("Sesión con Ana" y "Sesión con Ana (datos…)")
  // …y también si arrancan con las mismas tres palabras el mismo día ("Weekly con Diego · …" y "Weekly con Diego (hora…)")
  const tres = z => z.split(' ').slice(0, 3).join(' ');
  const igual = (x, y) => { const a = norm(x), b = norm(y); return a === b || (Math.min(a.length, b.length) >= 12 && (a.startsWith(b) || b.startsWith(a) || (tres(a).length >= 12 && tres(a) === tres(b)))); };
  const evs = [], tareasT = tareas().map(t => t.que);
  const add = (titulo, fecha, extra) => {
    const hm = horaDe(titulo), d = new Date(fecha + 'T00:00');
    if (hm) d.setHours(hm[0], hm[1], 0, 0);
    if (d < hoy0 || d >= lim) return;
    if (evs.some(e => dayKey(e.d) === dayKey(d) && igual(e.t, titulo))) return;
    evs.push({ d, t: titulo, allDay: !hm, ...extra });
  };
  for (const t of (B.pendientes.tareas || [])) if (t.fecha && !t.recurrente && esEvento(t.que)) add(t.que, t.fecha, { nodo: t.nodo, kind: 'cita', quien: t.quien });
  // lo anotado en la agenda que ya está como tarea en "por hacer" no se repite aquí
  for (const a of (B.agenda || [])) if (a.fecha && !tareasT.some(t => igual(t, a.titulo))) add(a.titulo, a.fecha, { kind: 'cita' });
  // las rutinas no van aquí: ya tienen su panel. Cada dato sale en un solo lugar.
  return evs.sort((a, b) => a.d - b.d || (a.allDay ? -1 : 1));
}

// ---------- calendario: agenda por día y el año en semanas ----------
const tzParts = (d, tz) => {
  const f = new Intl.DateTimeFormat('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d);
  const g = k => (f.find(x => x.type === k) || {}).value || '';
  return { h: +g('hour') % 24, m: g('minute'), wd: g('weekday').replace('.', '') };
};
export function mountCalendar(el, metaEl, { relojes = [], onEvent } = {}) {
  const KIND = { cita: ['users', 'Cita'], rutina: ['zap', 'Rutina de Claude'] };
  function render() {
    const now = new Date(), wk = isoWeek(now), evs = agenda(14).slice(0, 14);
    if (metaEl) metaEl.textContent = '';   // la semana ya sale abajo, en el año
    const hoy = now.toDateString(), man = new Date(now); man.setDate(man.getDate() + 1);
    const dia = d => d.toDateString() === hoy ? `Hoy · ${DIAS[d.getDay()]} ${d.getDate()}` : d.toDateString() === man.toDateString() ? `Mañana · ${DIAS[d.getDay()]} ${d.getDate()}` : `${DIAS[d.getDay()].charAt(0).toUpperCase() + DIAS[d.getDay()].slice(1)} ${d.getDate()} ${MESES[d.getMonth()]}`;
    let last = '', nextMarked = false;
    const rows = evs.map((e, i) => {
      const k = dayKey(e.d), head = k !== last ? `<div class="ag-d">${dia(e.d)}</div>` : '';
      last = k;
      const next = !nextMarked && !e.allDay && e.d > now; if (next) nextMarked = true;
      const [ic] = KIND[e.kind] || KIND.cita;
      // la hora solo cuando la cita la trae; si es de todo el día, el título usa todo el ancho
      return head + `<button class="ag-r ${e.kind} ${next ? 'next' : ''} ${e.allDay ? 'allday' : ''}" data-i="${i}" title="${esc(e.t)}${e.quien ? ' · ' + esc(e.quien) : ''}">
        ${e.allDay ? '' : `<span class="ag-t">${p2(e.d.getHours())}:${p2(e.d.getMinutes())}</span>`}<span class="ag-n">${esc(e.t)}</span></button>`;
    }).join('');
    const reloj = relojes.length ? `<div class="ag-wc">${relojes.slice(0, 3).map(r => { const t = tzParts(now, r.zona); return `<span>${esc(r.ciudad)} <b>${p2(t.h)}:${t.m}</b></span>`; }).join('')}</div>` : '';
    el.innerHTML = `<div class="ag">${rows || `<div class="ag-v">${icon('calendar-check')}<span>Sin citas las próximas dos semanas. Aquí salen las reuniones y sesiones con fecha de tus pendientes y de tu agenda.</span></div>`}</div>
      ${reloj}
      <div class="yr" title="El año en semanas: lo lleno ya pasó, lo naranja es esta semana">
        <div class="yr-h"><b>Semana ${wk} de 52</b><span>${Math.round(wk / 52 * 100)} % del año</span></div>
        ${[0, 1, 2, 3].map(q => `<div class="yr-q"><span>T${q + 1}</span>${[...Array(13)].map((_, i) => { const w = q * 13 + i + 1; return `<i class="${w < wk ? 'p' : w === wk ? 'n' : ''}" title="Semana ${w}"></i>`; }).join('')}</div>`).join('')}
      </div>`;
    el.querySelectorAll('.ag-r').forEach(b => b.onclick = () => onEvent && onEvent(evs[+b.dataset.i]));
    fadeIfMore($('.ag', el));
  }
  render();
  setInterval(render, 60000);
  return { render };
}

// ---------- correo: lo escribe una rutina en correo.json; mientras no exista, dice cómo conectarlo ----------
export function mountCorreo(el, correo, { owner = '', onConnect } = {}) {
  if (!correo || !correo.ok) {
    el.innerHTML = `<div class="ml-empty">${UI.illus('mail')}<b>Tu correo aún no llega aquí</b><span>${esc((correo && correo.motivo) || 'Cuando una rutina de Claude lea tu correo, aquí ves cuántos llegaron, cuáles te necesitan y de qué tipo fueron.')}</span><button class="pbtn" data-c>${icon('plug')}Cómo conectarlo</button></div>`;
    $('[data-c]', el).onclick = () => onConnect && onConnect();
    return;
  }
  const mix = Object.entries(correo.mezcla || {}).filter(([, v]) => v > 0);
  const tot = mix.reduce((s, [, v]) => s + v, 0) || 1;
  const tone = ['var(--accent)', '#efe9df', '#b9b3aa', '#6f6b66', '#4a4743'];
  el.innerHTML = `<div class="ml-big"><b>${(correo.total24h || 0).toLocaleString('es-MX')}</b><span>correos<br>últimas 24 h</span></div>
    <div class="ml-h">Marcados · te necesitan${owner ? ' a ti' : ''}</div>
    <div class="ml-l">${(correo.marcados || []).slice(0, 4).map(m => `<div class="ml-r" title="${esc(m.de || '')}">${icon('mail')}<span>${esc(m.asunto)}</span><b>${esc(m.hace || (m.fecha ? UI.ago(m.fecha) : ''))}</b></div>`).join('') || '<div class="ml-v">Nada marcado.</div>'}</div>
    ${mix.length ? `<div class="ml-h">Mezcla de hoy</div><div class="ml-mix">${mix.map(([k, v], i) => `<i style="flex:${v};background:${tone[i % tone.length]}" title="${esc(k)}: ${v}"></i>`).join('')}</div>
    <div class="ml-lg">${mix.map(([k, v]) => `<span><b>${v}</b> ${esc(k)}</span>`).join('')}</div>` : ''}
    <div class="ml-s"><i></i>Sincronizado ${esc(correo.sincronizado ? UI.ago(correo.sincronizado) : '')}</div>`;
}

// ---------- rutinas de hoy en tabla ----------
const ESTADO = { 'SIGUIENTE': ['next', 'Sigue'], 'EN COLA': ['q', 'En cola'], 'HECHA': ['done', 'Corrió'], 'YA PASÓ': ['miss', 'No corrió'] };
export function mountRutinas(el, metaEl) {
  function render() {
    const now = new Date();
    let rows = UI.todayRuns(now), today = true;
    if (!rows.length) {
      today = false;
      rows = B.routines.map(r => ({ r, when: UI.nextRun(r, now) })).filter(x => x.when).sort((a, b) => a.when - b.when)
        .slice(0, 6).map((x, i) => ({ ...x, status: i === 0 ? 'SIGUIENTE' : 'EN COLA' }));
    }
    const done = rows.filter(x => x.status === 'HECHA').length;
    if (metaEl) metaEl.textContent = today ? `${done} de ${rows.length} hoy` : rows.length ? 'Próximas' : '';
    const activas = B.routines.filter(r => r.activa).length;
    if (!rows.length) {
      el.innerHTML = `<div class="rt-v">${icon('alarm-clock')}<span>${B.routines.length ? 'Ninguna rutina tiene horario anotado.' : 'Sin rutinas todavía.'} <a href="brain.html?view=routines">Ver rutinas</a></span></div>`;
      return;
    }
    el.innerHTML = `<div class="rt-hd"><span>Hora</span><span>Rutina</span><span>Estado</span></div>
      <div class="rt-l">${rows.map(x => {
        const [cls, lab] = ESTADO[x.status] || ['q', x.status];
        const day = today ? '' : `<em>${DIAS[x.when.getDay()]}</em>`;
        return `<a class="rt-r ${cls}" href="brain.html?view=routines" title="${esc(x.r.desc || x.r.nombre)}"><span class="rt-t">${p2(x.when.getHours())}:${p2(x.when.getMinutes())}</span>
          <span class="rt-n"><b>${esc(x.r.nombre)}</b>${day}</span><span class="rt-s">${lab}</span></a>`;
      }).join('')}</div>
      <div class="rt-f"><span>${icon('monitor')}Claude Desktop · ${activas} ${activas === 1 ? 'activa' : 'activas'}</span><span>Datos ${esc(UI.fdatetime(B.generado))}</span></div>`;
    const next = $('.rt-r.next', el); if (next && next.offsetTop > el.clientHeight * 0.5) $('.rt-l', el).scrollTop = next.offsetTop - 40;
  }
  render();
  setInterval(render, 30000);
}

// ---------- skills: lista compacta, cada una con su modelo × esfuerzo ----------
export const MODELOS = [['haiku', 'Haiku', 'var(--teal)'], ['sonnet', 'Sonnet', 'var(--cyan)'], ['opus', 'Opus', 'var(--violet)'], ['fable', 'Fable', 'var(--amber)']];
export const ESFUERZOS = [['low', 'Bajo'], ['medium', 'Medio'], ['high', 'Alto'], ['xhigh', 'Muy alto'], ['max', 'Máximo']];
const prefOf = s => prefs.data.skills[s.id] || UI.runPref(s.id) || { model: 'sonnet', effort: 'medium' };
const propio = s => !!(prefs.data.skills[s.id] || UI.runPref(s.id));   // ¿lo elegiste tú o es el de fábrica?
const modelTag = p => { const m = MODELOS.find(x => x[0] === p.model) || MODELOS[1], e = ESFUERZOS.find(x => x[0] === p.effort) || ESFUERZOS[1]; return `<span class="sk-m" style="color:${m[2]}">${m[1]}</span><span class="sk-e"> · ${e[1]}</span>`; };

// Si una lista no cabe, su borde de abajo se desvanece: así se nota que hay más.
export function fadeIfMore(el) {
  const f = () => el.classList.toggle('mas', el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  el.addEventListener('scroll', f, { passive: true }); window.addEventListener('resize', f); setTimeout(f, 50); return f;
}

export function mountSkills(el, metaEl) {
  let pop = null;
  const closePop = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', outside, true); } };
  const outside = e => { if (pop && !pop.contains(e.target) && !e.target.closest('[data-cfg]')) closePop(); };
  function list() {
    const arch = new Set(prefs.data.skills_archivadas);
    return [...B.skills].filter(s => s.run !== false && s.grupo !== 'Vistas en tus sesiones' && !arch.has(s.id))
      .sort((a, b) => ((b.uso && b.uso.usos) || 0) - ((a.uso && a.uso.usos) || 0) || a.id.localeCompare(b.id));
  }
  function render() {
    const L = list(), nArch = prefs.data.skills_archivadas.length;
    if (metaEl) metaEl.innerHTML = nArch ? `<button class="lnk" data-unarch title="Regresar las skills archivadas">${nArch} archivada${nArch === 1 ? '' : 's'}</button>` : L.length ? `${L.length}` : '';
    el.innerHTML = L.length ? L.map((s, i) => {
      const u = s.uso && s.uso.usos;
      return `<div class="skr" data-i="${i}" title="${esc(s.desc || '')}${u ? ` · ${u} ${u === 1 ? 'uso' : 'usos'}` : ''}">
        <span class="skr-i">${icon(s.icono || 'sparkles')}</span><b>/${esc(s.id.split(':').pop())}</b><span class="skr-p">${propio(s) ? modelTag(prefOf(s)) : ''}</span>
        <button data-cfg title="Modelo y esfuerzo">${icon('sliders-horizontal')}</button><button class="skr-go" data-go title="Correr en segundo plano">${icon('play')}</button></div>`;
    }).join('') : `<div class="rt-v">${icon('zap')}<span>Sin skills listas para correr. <a href="brain.html?view=skills">Ver skills</a></span></div>`;
    if (!el._fade) el._fade = fadeIfMore(el); else el._fade();
    el.querySelectorAll('.skr').forEach(c => {
      const s = L[+c.dataset.i];
      $('[data-go]', c).onclick = () => UI.runDialog(s, prefOf(s));
      $('[data-cfg]', c).onclick = () => picker(s, c);
    });
    const un = metaEl && $('[data-unarch]', metaEl);
    if (un) un.onclick = async () => { await prefs.save({ skills_archivadas: [] }); render(); UI.toast('Skills archivadas de vuelta'); };
  }
  function picker(s, card) {
    closePop();
    pop = document.createElement('div');
    pop.className = 'mx';
    const draw = () => {
      const p = prefOf(s), ei = ESFUERZOS.findIndex(x => x[0] === p.effort);
      pop.innerHTML = `<div class="mx-h"><b>/${esc(s.id.split(':').pop())}</b><span>Modelo × esfuerzo</span><button data-x title="Cerrar">${icon('x')}</button></div>
        <div class="mx-g"><span></span>${ESFUERZOS.map(e => `<span class="mx-c">${e[1]}</span>`).join('')}
        ${MODELOS.map(([k, l, c]) => `<span class="mx-r" style="--c:${c}">${l}</span>${ESFUERZOS.map(([ek], j) => `<button class="mx-d ${p.model === k ? (j < ei ? 'on' : j === ei ? 'on k' : '') : ''}" style="--c:${c}" data-m="${k}" data-e="${ek}" title="${l} · ${ESFUERZOS[j][1]}"></button>`).join('')}`).join('')}</div>
        <div class="mx-f"><span>Más esfuerzo piensa más y gasta más.</span><button class="lnk" data-arch>Archivar esta skill</button></div>`;
      $('[data-x]', pop).onclick = closePop;
      $('[data-arch]', pop).onclick = async () => {
        closePop();
        await prefs.save({ skills_archivadas: [...prefs.data.skills_archivadas, s.id] }); render();
        UI.toast(`/${s.id.split(':').pop()} archivada. Se recupera desde el contador de arriba.`);
      };
      pop.querySelectorAll('.mx-d').forEach(d => d.onclick = async () => {
        await prefs.save({ skills: { ...prefs.data.skills, [s.id]: { model: d.dataset.m, effort: d.dataset.e } } });
        draw(); const t = $('.skr-p', card); if (t) t.innerHTML = propio(s) ? modelTag(prefOf(s)) : '';
      });
    };
    draw();
    document.body.appendChild(pop);
    const r = card.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(12, Math.min(r.right - w, innerWidth - w - 12)) + 'px';
    pop.style.top = (r.top - h - 8 > 12 ? r.top - h - 8 : Math.min(r.bottom + 8, innerHeight - h - 12)) + 'px';
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
  render();
  return { render };
}

// ---------- bandeja de artifacts: una bolita por artifact, gira lento alrededor de la esfera ----------
// El ícono dice de qué trata (por su título o carpeta) y, si no se sabe, qué tipo de archivo es.
const TEMA = [
  [/radar|brief|boletin|newsletter|reporte|report|resumen|update/, 'newspaper'],
  [/pitch|deck|propuesta|presentaci|slides|diapositiv/, 'presentation'],
  [/onboarding|bienvenida|arranque|kick ?off/, 'rocket'],
  [/dashboard|tablero|kpi|metrica|indicador/, 'layout-dashboard'],
  [/recorrido|journey|mapa|ruta|flujo/, 'map'],
  [/comparativ|versus|benchmark/, 'columns-3'],
  [/guia|manual|playbook|tutorial|curso|como /, 'book-open'],
  [/video|pelicula|film|reel|render|anima|motion/, 'clapperboard'],
  [/feed|portafolio|portfolio/, 'sparkles'],
  [/agenda|calendario|semana|weekly/, 'calendar-days'],
  [/correo|email|mail/, 'mail'],
  [/datos|data|analisis|analytics|excel|hoja|cifras/, 'chart-column'],
  [/audit|calidad|revision|qa\b/, 'shield-check'],
  [/precio|costo|finanz|venta|cotizacion|factura/, 'banknote'],
  [/equipo|persona|cliente|doctor|paciente|usuario/, 'users'],
  [/idea|brainstorm|lluvia/, 'lightbulb'],
  [/prompt|skill|agente|claude|bot\b/, 'bot'],
  [/sitio|landing|web|pagina|home/, 'globe']
];
const TIPO = a => {
  const t = String(a.tipo || '').toLowerCase(), n = plain([a.titulo, a.sub].filter(Boolean).join(' '));
  const label = t === 'claude' || (a.url && /claude\.ai/.test(a.url)) ? 'Claude.ai' : /^(mp4|mov|webm)$/.test(t) ? 'Video' : /^(html?|web)$/.test(t) ? 'Página'
    : t === 'pdf' ? 'PDF' : /^(xlsx?|csv)$/.test(t) ? 'Hoja' : /^(docx?|rtf)$/.test(t) ? 'Documento' : /^(pptx?|key)$/.test(t) ? 'Presentación'
    : /^(png|jpe?g|webp|gif|svg)$/.test(t) ? 'Imagen' : t === 'json' ? 'Datos' : t === 'md' ? 'Nota' : 'Artifact';
  const tema = TEMA.find(([re]) => re.test(n));
  if (tema) return [tema[1], label];
  const porTipo = { 'Claude.ai': 'sparkles', Video: 'clapperboard', Página: 'app-window', PDF: 'file-text', Hoja: 'sheet', Documento: 'file-type', Presentación: 'presentation', Imagen: 'image', Datos: 'braces', Nota: 'notebook-text' };
  return [porTipo[label] || 'package', label];
};
const keyOf = a => a.href || a.url || a.titulo;
const msAgo = a => a.fecha ? Math.max(0, Date.now() - new Date(a.fecha)) : null;
// edad corta como en el video: 1D = hace un día; lo de hoy, en horas
const ageTag = a => { const ms = msAgo(a); if (ms === null) return '—'; if (ms < 36e5) return 'AHORA'; if (ms < 864e5) return Math.floor(ms / 36e5) + 'H'; const d = Math.floor(ms / 864e5); return d > 99 ? '99D+' : d + 'D'; };
const ageText = a => { const ms = msAgo(a); if (ms === null) return ''; if (ms < 36e5) return 'Hace menos de una hora.'; if (ms < 864e5) { const h = Math.floor(ms / 36e5); return `Hace ${h} ${h === 1 ? 'hora' : 'horas'}.`; } const d = Math.floor(ms / 864e5); return `Hace ${d} ${d === 1 ? 'día' : 'días'}.`; };

export function mountBandeja(ring, orb, { viewer, showTip, onSearchState } = {}) {
  const track = document.createElement('div'); track.className = 'otrack';
  let items = [], balls = [], R = 0, rot = 0, hover = false, last = performance.now(), popA = null;
  const pop = document.createElement('div'); pop.className = 'apop';
  ring.parentElement.appendChild(pop);
  const all = () => {
    const off = new Set(prefs.data.bandeja_ocultos);
    return B.artifacts.filter(a => !off.has(keyOf(a))).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  };
  function build() {
    const box = ring.getBoundingClientRect();
    R = Math.min(box.width * 0.45, box.height * 0.5);
    if (!R) return;
    if (orb.fitRadius) orb.fitRadius(R * 0.37);   // esfera de datos al 37 % del anillo; la cáscara llega al 74 %
    const fit = Math.max(8, Math.floor(2 * Math.PI * R / 66));
    items = all().slice(0, fit);
    ring.innerHTML = ''; ring.appendChild(track);
    track.dataset.vacia = items.length ? '' : 'Tu bandeja está vacía. Aquí cae cada cosa que Claude termina.';
    balls = items.map(a => {
      const [ic, tl] = TIPO(a), b = document.createElement('button');
      b.className = 'ball' + (a === items[0] && msAgo(a) !== null && msAgo(a) < 2 * 864e5 ? ' new' : '');
      b.innerHTML = `${icon(ic)}<i>${ageTag(a)}</i>`;
      b.style.setProperty('--i', items.indexOf(a));
      b.onmouseenter = e => { hover = true; showTip && showTip(`<b>${esc(a.titulo)}</b><div class="p">${tl} · ${a.fecha ? UI.fdate(a.fecha) : 'sin fecha'}${a.origen ? ' · ' + esc(a.origen) : ''}</div>`, e.clientX, e.clientY); };
      b.onmousemove = e => showTip && showTip(`<b>${esc(a.titulo)}</b><div class="p">${tl} · ${a.fecha ? UI.fdate(a.fecha) : 'sin fecha'}${a.origen ? ' · ' + esc(a.origen) : ''}</div>`, e.clientX, e.clientY);
      b.onmouseleave = () => { hover = false; showTip && showTip(null); };
      b.onclick = () => openPop(a, b);
      b._a = a; ring.appendChild(b); return b;
    });
    place();
  }
  function place() {
    if (!R) return;
    const box = ring.getBoundingClientRect(), f = orb.screenFrame();
    const cx = f.cx - box.left, cy = f.cy - box.top, n = balls.length;
    track.style.cssText = `left:${cx - R}px;top:${cy - R}px;width:${R * 2}px;height:${R * 2}px`;
    if (!n) return;
    balls.forEach((b, i) => {
      const a = -Math.PI / 2 + rot + i * 2 * Math.PI / n;
      b.style.left = cx + Math.cos(a) * R + 'px'; b.style.top = cy + Math.sin(a) * R + 'px';
    });
    if (popA) posPop();
  }
  // gira una vuelta cada 6 minutos; se detiene con el cursor encima, con la ficha abierta o buscando
  orb.onFrame(() => {
    const t = performance.now(), dt = Math.min(100, t - last); last = t;
    if (!hover && !popA && !document.body.classList.contains('asearch') && !STILL()) rot += dt * (2 * Math.PI / 360000);
    place();
  });
  // ficha del artifact
  function openPop(a, b) {
    const [ic, tl] = TIPO(a);
    popA = { a, b };
    const path = a.ruta || a.url || a.href || '';
    pop.innerHTML = `<button class="ap-x" data-c title="Cerrar (Esc)">${icon('x')}</button><div class="ap-k">${esc(tl)} · ${a.fecha ? esc(UI.fdate(a.fecha)) : 'sin fecha'}</div>
      <h4>${esc(a.titulo)}</h4>
      ${a.thumb ? `<img class="ap-img" src="${esc(UI.urlOf ? UI.urlOf(a.thumb) : a.thumb)}" alt="">` : `<div class="ap-ico">${icon(ic)}</div>`}
      <p>${esc(a.desc || [a.origen, a.sub].filter(Boolean).join(' · ') || 'Sin descripción')}${ageText(a) ? ' · ' + esc(ageText(a).charAt(0).toLowerCase() + ageText(a).slice(1)) : '.'}</p>
      ${path ? `<code class="ap-p" title="${esc(path)}">${esc(path)}</code>` : ''}
      <div class="ap-b"><button class="pbtn hot" data-o>Abrir ${icon('arrow-right')}</button><button class="pbtn ln" data-q>Quitar de la bandeja</button></div>`;
    pop.classList.add('on');
    $('[data-o]', pop).onclick = () => { UI.openArtifact(a, viewer); closePop(); };
    $('[data-c]', pop).onclick = closePop;
    $('[data-q]', pop).onclick = async () => {
      await prefs.save({ bandeja_ocultos: [...prefs.data.bandeja_ocultos, keyOf(a)] });
      closePop(); build();
      UI.toast('Quitado de la bandeja. Sigue en Artifacts.');
    };
    balls.forEach(x => x.classList.toggle('sel', x === b));
    posPop();
  }
  function posPop() {
    const host = ring.parentElement.getBoundingClientRect(), r = popA.b.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    const bx = r.left + r.width / 2 - host.left, by = r.top + r.height / 2 - host.top;
    // nunca encima del título y las herramientas del panel
    const tope = ((ring.parentElement.querySelector('.hc-ttl') || {}).offsetHeight || 140) + 16;
    let x = bx < host.width / 2 ? bx + 40 : bx - w - 40, y = by - h / 2;
    x = Math.max(12, Math.min(x, host.width - w - 12)); y = Math.max(tope, Math.min(y, host.height - h - 12));
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  function closePop() { popA = null; pop.classList.remove('on'); balls.forEach(x => x.classList.remove('sel')); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && popA) closePop(); });
  document.addEventListener('mousedown', e => { if (popA && !pop.contains(e.target) && !e.target.closest('.ball')) closePop(); });

  // buscar artifacts: se apaga todo menos lo que coincide
  const sbox = document.createElement('div'); sbox.className = 'asb';
  sbox.innerHTML = `<input type="search" placeholder="Buscar artifacts" spellcheck="false"><span></span><div class="asb-l"></div>`;
  ring.parentElement.appendChild(sbox);
  const inp = $('input', sbox), cnt = $('span', sbox), lst = $('.asb-l', sbox);
  let hits = [], sel = 0;
  function search() {
    const q = plain(inp.value.trim());
    const pool = all();
    hits = q ? pool.filter(a => plain([a.titulo, a.origen, a.sub, a.ruta, a.tipo].join(' ')).includes(q)) : [];
    sel = 0;
    balls.forEach(b => { const on = hits.includes(b._a); b.classList.toggle('hit', on); b.classList.toggle('dim', !!q && !on); });
    cnt.textContent = q ? (hits.length ? `${hits.length} ${hits.length === 1 ? 'coincidencia' : 'coincidencias'} · Enter abre` : 'Nada con ese nombre') : `${pool.length} artifacts · escribe para buscar`;
    lst.innerHTML = hits.slice(0, 5).map((a, i) => `<button class="${i === sel ? 'on' : ''}" data-i="${i}">${icon(TIPO(a)[0])}<span>${esc(a.titulo)}</span><b>${ageTag(a)}</b></button>`).join('');
    lst.querySelectorAll('button').forEach(b => b.onclick = () => openHit(+b.dataset.i));
  }
  function openHit(i) { const a = hits[i]; if (!a) return; exitSearch(); UI.openArtifact(a, viewer); }
  function enterSearch() {
    closePop(); document.body.classList.add('asearch'); sbox.classList.add('on');
    inp.value = ''; search(); setTimeout(() => inp.focus(), 30); onSearchState && onSearchState(true);
  }
  function exitSearch() {
    document.body.classList.remove('asearch'); sbox.classList.remove('on');
    balls.forEach(b => b.classList.remove('hit', 'dim')); onSearchState && onSearchState(false);
  }
  inp.addEventListener('input', search);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); exitSearch(); }
    if (e.key === 'Enter') { e.preventDefault(); openHit(sel); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, Math.min(Math.min(hits.length, 5) - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); lst.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === sel)); }
  });
  document.addEventListener('mousedown', e => { if (document.body.classList.contains('asearch') && !sbox.contains(e.target) && !e.target.closest('.ball') && !e.target.closest('[data-a="search"]')) exitSearch(); });

  build(); setTimeout(build, 400);
  let rt = 0; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 80); });
  return { build, enterSearch, exitSearch, get count() { return balls.length; }, get total() { return all().length; } };
}

// ---------- "clic para abrir Second Brain" al pasar sobre la esfera ----------
export function mountSphereHint(host, orb, label, href = 'brain.html') {
  let over = false, node = null;
  const inside = e => { const f = orb.screenFrame(); return Math.hypot(e.clientX - f.cx, e.clientY - f.cy) < f.R * 1.15; };
  host.addEventListener('mousemove', e => { over = inside(e) && !e.target.closest('.ball,.apop,.asb,.hc-ttl'); label.classList.toggle('on', over && !node); host.style.cursor = over ? 'pointer' : ''; });
  host.addEventListener('mouseleave', () => { over = false; label.classList.remove('on'); });
  host.addEventListener('click', e => {
    if (e.target.closest('.ball,.apop,.asb,.hc-ttl,button,a,input')) return;
    if (inside(e) && !node && !document.body.classList.contains('asearch')) location.href = href;
  });
  const place = () => { const f = orb.screenFrame(), b = host.getBoundingClientRect(); label.style.left = f.cx - b.left + 'px'; label.style.top = f.cy - b.top + f.R * 1.28 + 'px'; };
  orb.onFrame(place); place(); setTimeout(place, 400);
  return { setNode: n => { node = n; if (n) label.classList.remove('on'); } };
}

// ---------- al día: si el servidor está actualizando, se avisa; al terminar, la página se pone al día ----------
// Recién abierta (menos de 2 minutos) y sin nada abierto encima, se recarga sola; si ya la estás usando, ofrece "Ver".
export function mountSync(host) {
  const pill = document.createElement('div');
  pill.className = 'sync'; pill.setAttribute('role', 'status');
  host.appendChild(pill);
  const t0 = Date.now();
  let visto = false;
  const ocupado = () => document.querySelector('.modal.open,.dlg.open,.apop.on,.mx') || document.body.classList.contains('asearch')
    || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName));
  async function check() {
    let h = null;
    try { h = await UI.api.get('/api/health'); } catch { /* servidor apagado: se vuelve a intentar */ }
    if (!h) return setTimeout(check, 10000);
    if (h.escaneando) {
      visto = true;
      pill.className = 'sync on';
      pill.innerHTML = `${icon('refresh-cw')}<span>Actualizando tus datos…</span>`;
      return setTimeout(check, 2500);
    }
    const nuevo = h.generado && B.generado && h.generado !== B.generado;
    if (nuevo) {
      if (Date.now() - t0 < 120000 && !ocupado()) return location.reload();
      pill.className = 'sync on ok';
      pill.innerHTML = `${icon('sparkles')}<span>Hay datos nuevos</span><button class="lnk" type="button">Ver</button>`;
      pill.querySelector('button').onclick = () => location.reload();
      return;
    }
    pill.className = 'sync';
    setTimeout(check, visto ? 4000 : 20000);
  }
  check();
}

// ---------- uso: los tres datos miden el mismo periodo y lo dicen ----------
// Cifra grande y modelos: últimos 7 días de calendario. Barras: 14 días seguidos (los sin uso valen 0); se resaltan los 7 que cuenta la cifra.
const FAMILIA = k => { const n = String(k).replace(/^claude-/, '').split('-')[0]; return n.charAt(0).toUpperCase() + n.slice(1); };
const COLOR_MODELO = { Opus: 'var(--violet)', Haiku: 'var(--teal)', Fable: 'var(--amber)', Sonnet: 'var(--cyan)' };
export function mountUso(el, { showTip } = {}) {
  const u = B.usage || {};
  if (!u.ok || !(u.dias || []).length) {
    el.innerHTML = `<div class="ml-empty">${UI.illus('vacio')}<b>Sin medición de uso</b><span>${esc(u.motivo || 'Aún no hay sesiones de Claude registradas en esta compu')}.</span></div>`;
    return;
  }
  const porDia = Object.fromEntries(u.dias.map(d => [d.d, d]));
  const hoy = new Date(), dias = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(hoy); d.setDate(d.getDate() - i); const k = dayKey(d); dias.push({ k, d, t: (porDia[k] || {}).t || 0, m: (porDia[k] || {}).m || {} }); }
  const ult7 = dias.slice(-7), total7 = ult7.reduce((s, d) => s + d.t, 0);
  const modelos = {};
  ult7.forEach(d => Object.entries(d.m).forEach(([k, v]) => { if (!k.startsWith('<')) modelos[FAMILIA(k)] = (modelos[FAMILIA(k)] || 0) + v; }));
  const sumM = Object.values(modelos).reduce((s, v) => s + v, 0) || 1;
  const filas = Object.entries(modelos).filter(([, v]) => v / sumM >= 0.01).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...dias.map(d => d.t));
  el.innerHTML = `<div class="ml-big"><b>${UI.fnum(total7)}</b><span>tokens<br>últimos 7 días</span></div>
    <div class="ubars">${dias.map((d, i) => `<i class="${i >= 7 ? 'on' : ''}" style="height:${d.t ? Math.max(3, d.t / max * 100) : 1.5}%" data-i="${i}"></i>`).join('')}</div>
    <div class="uaxis"><span>${dias[0].d.getDate()} ${MESES[dias[0].d.getMonth()]}</span><span>14 días</span><span>hoy</span></div>
    <div class="ml-h">Por modelo · mismos 7 días</div>
    ${filas.length ? filas.map(([f, v]) => `<div class="umod"><span style="color:${COLOR_MODELO[f] || 'var(--cyan)'}">${esc(f)}</span><span class="umod-bar"><i style="width:${Math.max(2, v / sumM * 100)}%;background:${COLOR_MODELO[f] || 'var(--cyan)'}"></i></span><b>${Math.round(v / sumM * 100)}%</b></div>`).join('') : '<div class="ml-v">Sin uso en estos 7 días.</div>'}`;
  el.querySelectorAll('.ubars i').forEach(b => {
    const d = dias[+b.dataset.i];
    const html = `<b>${DIAS[d.d.getDay()]} ${d.d.getDate()} ${MESES[d.d.getMonth()]}</b><div class="p">${d.t ? UI.fnum(d.t) + ' tokens' : 'Sin uso'}</div>`;
    b.onmousemove = e => showTip && showTip(html, e.clientX, e.clientY);
    b.onmouseleave = () => showTip && showTip(null);
  });
}
