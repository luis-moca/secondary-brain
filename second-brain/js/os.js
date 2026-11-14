// Pantalla principal. Lo común a los dos paneles vive en inicio.js (mismo archivo en la copia portátil);
// aquí van los textos y accesos de este panel.
import { createOrb } from './orb.js?v=26';
import { prefs, panelHead, tareas, mountCalendar, mountCorreo, mountRutinas, mountSkills, mountBandeja, mountSphereHint, mountSync, mountUso } from './inicio.js?v=11';
const UI = window.UI, B = UI.B, { icon, esc, fnum } = UI;
// Este escaneo trae una sola fuente de pendientes (ESTADO.md); se acomoda a la forma de lista que usa la pantalla.
B.pendientes.fuentes = B.pendientes.fuentes || (B.pendientes.fuente ? [{ path: B.pendientes.fuente, nodo: B.pendientes.nodo, n: (B.pendientes.tareas || []).length, mtime: B.pendientes.actualizado }] : []);
B.pendientes.patrones = B.pendientes.patrones || ['ESTADO.md'];
(B.pendientes.tareas || []).forEach(t => { t.fuente = t.fuente || B.pendientes.fuente || 'ESTADO.md'; t.nodo = t.nodo || B.pendientes.nodo; });
B.avisos = B.avisos || [];
const $ = s => document.querySelector(s);
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

$('#logo').innerHTML = icon('hexagon');
const tip = $('#tip');
function showTip(html, x, y) {
  if (!html) return tip.classList.remove('show');
  tip.innerHTML = html; tip.classList.add('show');
  tip.style.left = Math.max(8, Math.min(x + 14, innerWidth - tip.offsetWidth - 10)) + 'px';
  tip.style.top = Math.max(8, Math.min(y + 14, innerHeight - tip.offsetHeight - 10)) + 'px';
}
const hint = (el, html) => { el.onmousemove = e => showTip(typeof html === 'function' ? html() : html, e.clientX, e.clientY); el.onmouseleave = () => showTip(null); };
const viewer = UI.mountViewer({ onFly: n => { location.href = 'brain.html#' + n.id; } });
UI.runs.bind(viewer);
const openNode = id => { const n = UI.BYID[id]; if (n) viewer.open(n); };

// ---------- título ----------
$('#who').textContent = [B.owner.nombre, B.owner.rol].filter(Boolean).join('  |  ') || 'Tu panel';
$('#tools').innerHTML = [
  ['pencil', 'Cómo se actualiza y se edita', 'edit'], ['search', 'Buscar en tu bandeja de artifacts', 'search'],
  ...(5 + (B.microExt || []).length > 6 ? [['layout-grid', 'Ver todas tus micro apps', 'grid']] : []), ['refresh-cw', 'Actualizar desde tu Knowledge · escaneado ' + UI.ago(B.generado), 'scan'],
  ['info', 'De dónde salen los datos', 'info'],
  ...(B.avisos.length ? [['triangle-alert', B.avisos.length === 1 ? 'Un aviso sobre tus datos' : B.avisos.length + ' avisos sobre tus datos', 'warn']] : [])
].map(([i, t, a]) => `<button title="${esc(t)}" data-a="${a}" class="${a === 'warn' ? 'warnb' : ''}">${icon(i)}</button>`).join('');
const avisosModal = () => UI.modal(`<h3>${B.avisos.length === 1 ? 'Un aviso' : B.avisos.length + ' avisos'} sobre tus datos</h3><ul>${B.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`);

function infoModal() {
  UI.modal(`<h3>De dónde sale cada cosa</h3>
  <ul>
    <li><b>Esfera:</b> cada punto grande es un archivo de tu Knowledge (copia en <code>vault/</code>), ${B.nodes.length.toLocaleString('es-MX')} hoy. Los chicos son sus piezas reales: secciones, páginas, hojas o párrafos. La cáscara punteada y las órbitas son decoración.</li>
    <li><b>Anillo:</b> tu bandeja de artifacts. Una bolita por cosa terminada, con su edad abajo (1D = hace un día). La lupa de arriba busca entre todas. Quitar una de la bandeja no borra nada.</li>
    <li><b>Calendario:</b> las citas con fecha (reuniones, sesiones) de tu <code>${esc(B.pendientes.fuente || 'ESTADO.md')}</code> y de tu agenda, de las próximas dos semanas, por día, y el año en semanas. Las tareas viven en Por hacer y las rutinas en su panel: nada sale dos veces.</li>
    <li><b>Correo:</b> lo escribe una rutina de Claude en <code>second-brain/.cache/correo.json</code>. Mientras no exista, se ve vacío.</li>
    <li><b>Por hacer:</b> las tablas de pendientes de tu <code>${esc(B.pendientes.fuente || 'ESTADO.md')}</code>, tal cual.</li>
    <li><b>Rutinas y skills:</b> tus tareas programadas de Claude y tus skills. El modelo y el esfuerzo de cada skill se guardan en <code>second-brain/.cache/preferencias.json</code>.</li>
    <li><b>Uso:</b> tokens reales, leídos de los registros de tus sesiones de Claude en esta compu.</li>
  </ul>
  <p>Escaneado: ${UI.fdatetime(B.generado)}.</p>`);
}
const editModal = () => UI.modal(`<h3>Cómo se actualiza y se edita</h3>
  <ul>
    <li><b>Datos:</b> el botón de actualizar trae lo nuevo de <code>${esc(B.knowledgeDir || 'Knowledge')}</code> y reescanea: lo que borres o muevas desaparece del panel y una carpeta nueva sale como zona nueva. Tu carpeta original solo se lee. Si Knowledge no está o aparece vacío, el panel conserva la última copia y te avisa.</li>
    <li><b>Horarios de rutinas, apps, agenda y pendientes de conexión:</b> están en <code>catalogo.json</code>. Edítalo y actualiza.</li>
    <li><b>Pendientes de trabajo:</b> salen de <code>${esc(B.pendientes.fuente || 'ESTADO.md')}</code>. Se editan ahí.</li>
    <li><b>Abrir en la compu:</b> abre el original de tu Knowledge. Si ya no está, te muestra la copia del panel en Finder y te avisa: lo que cambies ahí se pierde al actualizar.</li>
    <li><b>Correr skills:</b> Claude trabaja en segundo plano en modo solo lectura.</li>
  </ul>`);
function butlerModal() { UI.modal(`<h3>Modo mayordomo</h3><p>Lo que falta para que todo esté conectado y automatizado, y tú solo apruebes.</p>${UI.checklistHTML()}<p class="foot">También está en el archivo PENDIENTES.md de la carpeta del panel.</p>`); }
const connectModal = (kind, title, steps) => UI.modal(`<h3>${title}</h3><div class="illbox">${UI.illus(kind)}</div><div class="steps">${steps.map((s, i) => `<div><b>${i + 1}</b><span>${s}</span></div>`).join('')}</div>`);
const mailModal = () => connectModal('mail', 'Conectar tu correo', ['En claude.ai, entra a Configuración y luego a Conectores. Conecta tu correo (por ejemplo, Gmail).', 'Crea una rutina diaria en Claude que lea tu correo y escriba el resumen en <code>second-brain/.cache/correo.json</code>, con <code>total24h</code>, <code>marcados</code> (asunto, de, hace), <code>mezcla</code> (tipo: número) y <code>sincronizado</code>.', 'En cuanto exista el archivo, este panel lo muestra.']);
const calModal = () => connectModal('calendar', 'Conectar tu calendario', ['Revisa si Google Calendar ya aparece en tus conectores de Claude.', 'En claude.ai, Configuración, Conectores: agrega el conector oficial de Google Calendar.', 'Dile a Claude: “conecta mi calendario a MOCA”. Mientras, aquí ves las fechas de tu ESTADO.md y tus rutinas.']);
function pendModal() {
  const f = B.pendientes.fuentes;
  UI.modal(`<h3>De dónde salen tus pendientes</h3>
    ${f.length ? `<div class="splist">${f.map(x => `<div class="sprow" data-node="${x.nodo}" style="cursor:pointer"><span class="spi">${icon('list-checks')}</span><div class="spb"><div class="spt">${esc(x.path.split('/').pop())}</div><div class="spp">${esc(x.path)} · ${UI.ago(x.mtime)}</div></div><b class="spn">${x.n}</b></div>`).join('')}</div>` : `<div class="illbox">${UI.illus('lista')}</div>`}
    <div class="steps" style="margin-top:14px"><div><b>1</b><span>Crea un archivo llamado <code>${esc((B.pendientes.patrones || ['PENDIENTES.md'])[0])}</code> en cualquier espacio.</span></div>
    <div><b>2</b><span>Escribe una casilla por pendiente: <code>- [ ] Mandar propuesta @ana 20 nov</code>. O una tabla con columnas Qué, Cuándo y Quién.</span></div>
    <div><b>3</b><span>Si no dice de quién es, cuenta como tuyo. Lo marcado con <code>[x]</code> ya no aparece. Presiona Actualizar.</span></div></div>`)
    .querySelectorAll('[data-node]').forEach(el => el.onclick = () => openNode(el.dataset.node));
}

// ---------- micro apps ----------
const apps = [
  { nombre: 'Second Brain', desc: 'Tu Knowledge como mapa vivo', href: 'brain.html', icono: 'orbit', c: 'var(--accent)' },
  { nombre: 'Artifacts', desc: `${B.artifacts.length} cosas que Claude te hizo`, href: 'brain.html?view=artifacts', icono: 'inbox', c: 'var(--amber)' },
  { nombre: 'Uso y rutinas', desc: 'Cuánto gasta cada una', href: 'brain.html?view=routines', icono: 'timer', c: 'var(--cyan)' },
  { nombre: 'Mapa 2D', desc: 'Fuerza, círculo, panal y anillos', href: 'brain.html?view=map', icono: 'share-2', c: 'var(--violet)' },
  { nombre: 'Línea de tiempo', desc: 'Qué cambió y cuándo', href: 'brain.html?view=timeline', icono: 'chart-gantt', c: 'var(--teal)' },
  ...B.microExt.filter(m => m.url || m.href).map(m => ({ nombre: m.nombre, desc: m.desc || '', href: m.url || UI.urlOf(m.href), icono: m.icono || 'app-window', ext: true, c: 'var(--blue)' }))
];
let expanded = false;
function renderApps() {
  $('#p-apps').innerHTML = panelHead('layout-grid', 'Micro apps', `${apps.length > 6 ? `<button class="pbtn" id="expand">${expanded ? 'Menos' : 'Ampliar'}</button>` : ''}<button class="pbtn" id="addapp" title="Copia un prompt para que Claude agregue un acceso">${apps.length > 6 ? '+ App' : '<span class="lg">+ Agregar app</span><span class="sm">+ App</span>'}</button>`)
    + `<div class="pn-b acclist">${(expanded ? apps : apps.slice(0, 6)).map(a => `<a class="acc" ${a.node ? `href="#" data-node="${a.node}"` : `href="${esc(a.href)}"`} ${a.ext ? 'target="_blank" rel="noopener"' : ''}>
      <span class="acc-i" style="--c:${a.c}">${icon(a.icono)}</span><span class="acc-b"><b>${esc(a.nombre)}</b><i>${esc(a.desc)}</i></span>${icon(a.ext ? 'arrow-up-right' : 'chevron-right', 'i acc-a')}</a>`).join('')}</div>`;
  $('#p-apps').querySelectorAll('[data-node]').forEach(el => el.onclick = e => { e.preventDefault(); openNode(el.dataset.node); });
  if ($('#expand')) $('#expand').onclick = () => { expanded = !expanded; renderApps(); };
  $('#addapp').onclick = () => UI.copy(`Agrega un acceso nuevo a mi panel MOCA (carpeta second-brain de MOCA, archivo catalogo.json, sección microapps_externas). Quiero que apunte a: `, 'Prompt copiado: pégalo en Claude y completa la idea');
}
renderApps();

// ---------- calendario: citas y rutinas; las tareas viven en "por hacer" ----------
$('#p-cal').innerHTML = panelHead('calendar', 'Calendario', `<span class="pn-m" id="calmeta"></span><button class="pbtn" id="opencal" title="Conecta tu calendario">Conectar</button>`) + `<div class="pn-b cal" id="cal"></div>`;
$('#opencal').onclick = calModal;
const RELOJES = (B.relojes || []).slice(0, 3);   // ciudades extra solo si las anotas; tu hora ya está en tu compu
mountCalendar($('#cal'), $('#calmeta'), { relojes: RELOJES, onEvent: e => e.kind === 'rutina' ? (location.href = 'brain.html?view=routines') : e.nodo ? openNode(e.nodo) : null });

// ---------- correo, por hacer y uso ----------
let ptab = '', correo = null;
try { ptab = localStorage.getItem('moca.ptab2') || ''; } catch { /* sin almacenamiento */ }
const PTABS = [['correo', 'mail', 'Correo'], ['hacer', 'list-checks', 'Por hacer'], ['uso', 'activity', 'Uso']];
function renderPanel() {
  const tab = PTABS.some(t => t[0] === ptab) ? ptab : correo && correo.ok ? 'correo' : 'hacer';
  const meta = '';
  $('#p-mail').innerHTML = `<header class="pn-h"><div class="pn-tabs">${PTABS.map(([k, ic, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${icon(ic)}<span>${l}</span></button>`).join('')}</div><div class="pn-r"><span class="pn-m">${esc(meta)}</span></div></header><div class="pn-b" id="pbody"></div>`;
  $('#p-mail').querySelectorAll('.pn-tabs button').forEach(b => b.onclick = () => { ptab = b.dataset.t; try { localStorage.setItem('moca.ptab2', ptab); } catch { /* sin almacenamiento */ } renderPanel(); });
  const body = $('#pbody');
  if (tab === 'correo') return mountCorreo(body, correo, { owner: B.owner.nombre, onConnect: mailModal });
  if (tab === 'hacer') {
    const today0 = new Date(new Date().toDateString());
    const all = tareas();   // sin las citas con fecha: esas salen en el calendario
    const list = [...all.filter(x => x.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha)), ...all.filter(x => !x.fecha)];
    const when = x => {
      if (!x.fecha) return `<span class="tk-d none">${icon('circle')}</span>`;
      const d = new Date(x.fecha + 'T00:00'), diff = Math.round((d - today0) / 864e5);
      return `<span class="tk-d ${diff < 0 ? 'late' : diff <= 1 ? 'soon' : ''}"><b>${d.getDate()}</b><i>${diff < 0 ? 'venció' : diff === 0 ? 'hoy' : diff === 1 ? 'mañana' : MESES[d.getMonth()].slice(0, 3)}</i></span>`;
    };
    const r = UI.sistemaResumen(), fuentes = B.pendientes.fuentes;
    body.innerHTML = `${r.total ? `<button class="may" id="butler">${UI.donut([{ v: r.hechos, c: 'var(--green)' }, { v: r.total - r.hechos, c: 'transparent' }], 36, 4)}<span class="may-b"><b>Modo mayordomo</b><i>${r.hechos} de ${r.total} conexiones listas${r.tuyos ? ` · ${r.tuyos} te tocan` : ''}</i></span>${icon('chevron-right', 'i may-a')}</button>` : ''}
      <div class="tkhead"><span>${all.length ? `Tareas · ${all.filter(x => x.mio).length} tuyas de ${all.length}` : 'Tareas'}</span><button class="lnk" id="psrc">${fuentes.length > 1 ? fuentes.length + ' archivos' : fuentes.length ? 'Abrir archivo' : 'Cómo se llena'}</button></div>
      <div class="tklist">${list.length ? list.map((x, i) => `<div class="tk ${x.mio ? '' : 'other'}" data-i="${i}">${when(x)}<span class="tk-t">${esc(x.que)}</span>${x.mio || !x.quien ? '' : `<span class="tk-w" title="${esc(x.quien)}">${esc(UI.initials(x.quien) || x.quien.slice(0, 2))}</span>`}</div>`).join('')
        : `<div class="ml-empty">${UI.illus(fuentes.length ? 'done' : 'lista')}<b>${fuentes.length ? 'Sin pendientes' : 'Aún no hay archivo de pendientes'}</b><span>${fuentes.length ? 'Todo lo de tus archivos de pendientes está marcado.' : `Crea un archivo ${esc((B.pendientes.patrones || [])[0] || 'de pendientes')} en cualquier espacio y aparece aquí.`}</span></div>`}</div>`;
    if ($('#butler')) $('#butler').onclick = butlerModal;
    $('#psrc').onclick = () => fuentes.length === 1 ? openNode(fuentes[0].nodo) : pendModal();
    body.querySelectorAll('.tk').forEach(el => {
      const x = list[+el.dataset.i];
      hint(el, `<b>${esc(x.que)}</b><div class="p">${esc(x.cuando || (x.fecha ? UI.fdate(x.fecha + 'T12:00') : 'Sin fecha'))}${x.quien ? ' · ' + esc(x.quien) : ''} · ${esc((x.fuente || '').split('/').pop())}</div>`);
      el.onclick = () => openNode(x.nodo);
    });
    return;
  }
  mountUso(body, { showTip });
}

// ---------- rutinas y skills ----------
$('#p-rut').innerHTML = panelHead('timer', 'Rutinas', `<span class="pn-m" id="rmeta"></span>`) + `<div class="pn-b" id="rtable"></div>`;
mountRutinas($('#rtable'), $('#rmeta'));
$('#p-sk').innerHTML = panelHead('zap', 'Skills deck', `<span class="pn-m" id="skmeta"></span><button class="pbtn" id="askbtn" title="Preguntarle algo a tus archivos">${icon('message-circle-question')}</button><button class="pbtn hot" id="addsk" title="Copia el comando para crear una skill">+ Skill</button>`)
  + `<div class="pn-b skg" id="deck"></div>`;
$('#askbtn').onclick = () => UI.runDialog(null);
$('#addsk').onclick = () => UI.copy('/anthropic-skills:skill-creator', 'Copiado /skill-creator: pégalo en Claude');

// ---------- esfera y bandeja ----------
let sphere = null, bandeja = null;
const orb = createOrb($('#osorb'), {
  mode: 'os',
  onHover: (n, x, y) => { if (sphere) sphere.setNode(n && !n.ring ? n : null); return n && !n.ring ? showTip(`<b>${esc(n.title)}</b><div class="p">${esc(n.path)}</div>`, x, y) : showTip(null); },
  onPick: n => { location.href = 'brain.html#' + n.id; },
  onOpen: n => viewer.open(n)
});
sphere = mountSphereHint($('#hc'), orb, $('#sbh'));
mountSync(document.querySelector('.hc-ttl'));

$('#tools').addEventListener('click', e => {
  const b = e.target.closest('button'), a = b && b.dataset.a;
  if (a === 'search' && bandeja) bandeja.enterSearch();
  if (a === 'grid') { expanded = true; renderApps(); }
  if (a === 'scan') UI.rescan(b);
  if (a === 'info') infoModal();
  if (a === 'edit') editModal();
  if (a === 'warn') avisosModal();
});

renderPanel();
prefs.load().then(async () => {
  mountSkills($('#deck'), $('#skmeta'));
  bandeja = mountBandeja($('#ring'), orb, { viewer, showTip });
  try { correo = await UI.api.get('/api/correo'); } catch { correo = { ok: false }; }
  renderPanel();
});

// ---------- búsqueda global ----------
const palette = UI.mountPalette({
  slash: true,
  actions: [
    { icon: 'search', label: 'Buscar en mis artifacts', keys: 'bandeja anillo', run: () => bandeja && bandeja.enterSearch() },
    { icon: 'orbit', label: 'Abrir Second Brain', keys: 'esfera 3d', run: () => { location.href = 'brain.html'; } },
    { icon: 'inbox', label: 'Ver todos los artifacts', keys: 'bandeja entregables', run: () => { location.href = 'brain.html?view=artifacts'; } },
    { icon: 'timer', label: 'Uso y rutinas', keys: 'tokens gasto', run: () => { location.href = 'brain.html?view=routines'; } },
    { icon: 'zap', label: 'Todas las skills', run: () => { location.href = 'brain.html?view=skills'; } },
    { icon: 'share-2', label: 'Mapa 2D', keys: 'fuerza circulo hex anillos', run: () => { location.href = 'brain.html?view=map'; } },
    { icon: 'message-circle-question', label: 'Preguntarle a mi Knowledge', keys: 'claude correr', run: () => UI.runDialog(null) },
    { icon: 'list-checks', label: 'Pendientes para el modo mayordomo', keys: 'conectar falta', run: butlerModal },
    { icon: 'wand-sparkles', label: 'Crear una skill nueva', keys: 'skill creator', run: () => UI.copy('/anthropic-skills:skill-creator', 'Copiado /skill-creator: pégalo en Claude') },
    { icon: 'refresh-cw', label: 'Actualizar desde mi Knowledge', keys: 'reescanear escanear', run: () => UI.rescan() },
  ],
  onFile: n => viewer.open(n),
  onArtifact: a => UI.openArtifact(a, viewer),
  onSkill: s => s.run !== false ? UI.runDialog(s) : UI.copy('/' + s.id, '/' + s.id + ' copiado: pégalo en Claude')
});

window.MOCA = { orb, viewer, palette, prefs, get bandeja() { return bandeja; } };
