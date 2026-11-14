// Esfera 3D de partículas. Cada partícula grande es un archivo real; las chicas son sus piezas
// (secciones, páginas, hojas o párrafos). El núcleo es la memoria de Claude.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Tono general dorado (13 nov): el color de cada zona se mezcla con oro y blanco cálido.
// Así el dorado domina aunque crezca una zona de otro color, y las zonas se siguen distinguiendo.
const ORO = new THREE.Color('#ffc46a'), CREMA = new THREE.Color('#fff0d6');
function dorar(out, zona, h) {
  if (h < 0.32) return out.copy(ORO).lerp(zona, 0.16);     // oro con un toque de su zona
  if (h < 0.44) return out.copy(CREMA).lerp(zona, 0.10);   // blanco cálido
  return out.copy(zona).lerp(ORO, 0.22);                    // color de la zona, entibiado
}

const UI = window.UI, B = UI.B;
const GOLD = Math.PI * (3 - Math.sqrt(5));

function fib(n, r = 1) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / Math.max(n - 1, 1)) * 2, rad = Math.sqrt(1 - y * y), th = GOLD * i;
    pts.push(new THREE.Vector3(Math.cos(th) * rad * r, y * r, Math.sin(th) * rad * r));
  }
  return pts;
}
function hash(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

const VERT = `
attribute float size; attribute vec3 color; attribute float phase; attribute float dim;
uniform float uTime; uniform float uPR; uniform float uScale; uniform float uMotion; uniform vec3 uCenter; uniform float uIntro;
varying vec3 vColor; varying float vAlpha;
void main(){
  float k = clamp((uIntro - phase*0.45) / 0.55, 0.0, 1.0);
  k = 1.0 - pow(1.0 - k, 3.0);
  vec4 mv = modelViewMatrix * vec4(position * (0.12 + 0.88*k), 1.0);
  vec4 c = viewMatrix * vec4(uCenter,1.0);
  float tw = 1.0 + 0.09 * uMotion * sin(uTime*0.45 + phase*6.2831);   // destello lento (14 s), no parpadeo
  float front = smoothstep(-1.4, 0.7, mv.z - c.z);
  float hi = smoothstep(1.3, 1.9, dim);   // archivo bajo el cursor y sus vecinos: un poco más grandes y visibles aunque queden atrás
  gl_PointSize = size * uPR * uScale * tw * (1.0 + 0.15*hi) / -mv.z;
  vColor = color; vAlpha = dim * mix(0.22 + 0.78*front, 1.0, hi) * k;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec3 vColor; varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  if(d > 0.5) discard;
  float a = pow(smoothstep(0.5, 0.0, d), 1.25);
  float core = smoothstep(0.16, 0.0, d);
  gl_FragColor = vec4(min(vColor*(a + core*0.9), vec3(1.6)), min((a + core*0.5) * vAlpha, 1.0));
}`;

function pointsMaterial(scale) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: Math.min(devicePixelRatio, 2) }, uScale: { value: scale }, uMotion: { value: 1 }, uCenter: { value: new THREE.Vector3() }, uIntro: { value: 0 } }
  });
}

function glowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function iconSprite(name, color, ring) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fillStyle = 'rgba(16,12,8,0.92)'; g.fill();
  g.lineWidth = 4; g.strokeStyle = ring; g.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => { g.drawImage(img, 36, 36, 56, 56); tex.needsUpdate = true; };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(UI.iconSVGString(name, color));
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  return s;
}

export function createOrb(container, opts = {}) {
  const mode = opts.mode || 'brain';
  const OS = mode === 'os';
  const W = () => container.clientWidth, H = () => container.clientHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W() || 2, H() || 2);
  renderer.setClearColor(new THREE.Color().setRGB(0.0019, 0.0019, 0.0021, THREE.LinearSRGBColorSpace), 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060607);
  const camera = new THREE.PerspectiveCamera(OS ? 34 : 38, (W() || 2) / (H() || 2), 0.05, 100);
  camera.position.set(0, OS ? 0.55 : 0.95, OS ? 6.4 : 5.0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.06; controls.rotateSpeed = 0.55;
  controls.enablePan = false; controls.minDistance = 1.6; controls.maxDistance = 9;
  controls.enableZoom = !OS;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W() || 2, H() || 2), OS ? 0.76 : 0.72, 0.42, 0.24);
  bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.8, 0.5, 0.15, 0.0];
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const world = new THREE.Group(); scene.add(world);
  const brain = new THREE.Group(); world.add(brain);
  if (OS) brain.scale.setScalar(0.92);

  // ---------- capa de datos ----------
  const owner = [];        // índice de partícula -> id de nodo
  const mainIndex = {};    // id de nodo -> índice de su partícula principal
  const pos = [], col = [], size = [], phase = [];
  const tmpC = new THREE.Color();
  const catCentroid = {};

  const files = UI.CAT_ORDER.map(c => B.nodes.filter(n => n.cat === c)
    .sort((a, b) => a.folder.localeCompare(b.folder) || a.mtime.localeCompare(b.mtime)));
  const counts = files.map(arr => arr.reduce((s, n) => s + 1 + n.pieces.length, 0));
  const total = counts.reduce((a, b) => a + b, 0);
  const shell = fib(total, 1).map(v => ({ v, lon: Math.atan2(v.z, v.x) })).sort((a, b) => a.lon - b.lon);
  let cursor = 0;
  UI.CAT_ORDER.forEach((cat, ci) => {
    const chunk = shell.slice(cursor, cursor + counts[ci]); cursor += counts[ci];
    // serpentina por bandas de latitud: puntos consecutivos quedan vecinos
    const bands = 48;
    chunk.sort((a, b) => {
      const ba = Math.floor((a.v.y + 1) / 2 * bands), bb = Math.floor((b.v.y + 1) / 2 * bands);
      if (ba !== bb) return bb - ba;
      return (ba % 2 ? -1 : 1) * (a.lon - b.lon);
    });
    const base = new THREE.Color(UI.CAT_COLOR[cat]);
    const cen = new THREE.Vector3();
    let k = 0;
    for (const n of files[ci]) {
      const p0 = chunk[k++].v;
      mainIndex[n.id] = owner.length; owner.push(n.id);
      pos.push(p0.x, p0.y, p0.z); cen.add(p0);
      dorar(tmpC, base, hash(owner.length * 5.3)).multiplyScalar(1.0); col.push(tmpC.r, tmpC.g, tmpC.b);
      size.push(26 + Math.min(n.deg || 0, 60) * 0.45); phase.push(hash(owner.length));
      for (let j = 0; j < n.pieces.length; j++) {
        const p = chunk[k++].v, r = 0.975 + hash(owner.length * 3.1) * 0.03;
        owner.push(n.id);
        pos.push(p.x * r, p.y * r, p.z * r);
        const h = hash(owner.length * 1.7);
        dorar(tmpC, base, hash(owner.length * 7.9)).offsetHSL((h - 0.5) * 0.04, 0, (h - 0.5) * 0.08).multiplyScalar(0.62 + h * 0.3);
        col.push(tmpC.r, tmpC.g, tmpC.b);
        size.push(11 + h * 5); phase.push(h);
      }
    }
    const c0 = cen.lengthSq() > 1e-9 ? cen.normalize() : chunk[Math.floor(chunk.length / 2)].v.clone();
    const LATS = [0.5, -0.42, 0.62, -0.55, 0.35, -0.3, 0.7, -0.66, 0.2, -0.16];
    let lat = LATS[ci % 10];
    // la última zona queda junto a la primera (la esfera da la vuelta): si caen a la misma altura, se voltea
    if (ci === UI.CAT_ORDER.length - 1 && ci > 1 && Math.abs(lat - LATS[0]) < 0.15) lat = -lat;
    catCentroid[cat] = new THREE.Vector3(c0.x, 0, c0.z).normalize().multiplyScalar(Math.sqrt(1 - lat * lat)).setY(lat);
  });

  // núcleo: memoria
  const memPts = B.memory.reduce((s, m) => s + 1 + m.pieces.length, 0);
  const core = fib(memPts, 1);
  let mi = 0;
  const warm = new THREE.Color('#fff4e6');
  for (const m of B.memory) {
    const p = core[mi++].clone().multiplyScalar(0.3 + hash(mi) * 0.06);
    mainIndex[m.id] = owner.length; owner.push(m.id);
    pos.push(p.x, p.y, p.z); col.push(1.1, 1.05, 1.0); size.push(20); phase.push(hash(mi * 5));
    for (let j = 0; j < m.pieces.length; j++) {
      const q = core[mi++].clone().multiplyScalar(0.12 + hash(mi * 2.3) * 0.2);
      owner.push(m.id); pos.push(q.x, q.y, q.z);
      tmpC.copy(warm).multiplyScalar(0.55 + hash(mi) * 0.3); col.push(tmpC.r, tmpC.g, tmpC.b);
      size.push(9 + hash(mi) * 4); phase.push(hash(mi * 9));
    }
  }

  const N = owner.length;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
  geo.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
  geo.setAttribute('dim', new THREE.Float32BufferAttribute(new Float32Array(N).fill(1), 1));
  const mat = pointsMaterial(OS ? 0.85 : 1.0);
  const points = new THREE.Points(geo, mat);
  brain.add(points);
  const mats = [mat];

  // brillo del núcleo y halo
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,240,225,0.55)', 'rgba(255,160,100,0.08)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  coreGlow.scale.setScalar(0.62); coreGlow.material.opacity = 0.8; brain.add(coreGlow);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,110,50,0.07)', 'rgba(255,90,30,0.015)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.setScalar(2.7); halo.material.opacity = 0.75; brain.add(halo);

  // ---------- conexiones ----------
  const P = geo.attributes.position.array;
  let linkLines = null;
  if (!OS) {
    const lp = [], lc = [];
    for (const [a, b] of B.links) {
      const ia = mainIndex[a], ib = mainIndex[b];
      if (ia == null || ib == null) continue;
      lp.push(P[ia * 3], P[ia * 3 + 1], P[ia * 3 + 2], P[ib * 3], P[ib * 3 + 1], P[ib * 3 + 2]);
      const ca = new THREE.Color(UI.CAT_COLOR[UI.BYID[a].cat]);
      lc.push(ca.r, ca.g, ca.b, ca.r, ca.g, ca.b);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
    linkLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
    linkLines.visible = false; brain.add(linkLines);
  }
  // Líneas del archivo bajo el cursor: cintas de ancho fijo en pantalla con borde suave (una línea de 1 px sale
  // cortada y casi no se ve). Cada extremo se calcula igual que su punto, con la misma entrada animada:
  // la línea termina justo en el centro del punto, viva en el grupo que viva y con la escala que tenga.
  const hlMat = new THREE.ShaderMaterial({
    vertexShader: `
attribute vec3 aEnd; attribute vec2 aCorner; attribute vec2 aPhase;
uniform float uIntro; uniform vec2 uRes; uniform float uWidth;
varying float vSide;
float grow(float ph){ float k = clamp((uIntro - ph*0.45) / 0.55, 0.0, 1.0); return 0.12 + 0.88 * (1.0 - pow(1.0 - k, 3.0)); }
void main(){
  vec4 a = projectionMatrix * modelViewMatrix * vec4(position * grow(aPhase.x), 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(aEnd * grow(aPhase.y), 1.0);
  vec2 d = (b.xy / b.w - a.xy / a.w) * uRes;
  d = length(d) > 1e-5 ? normalize(d) : vec2(1.0, 0.0);
  vec4 p = aCorner.x < 0.5 ? a : b;
  p.xy += vec2(-d.y, d.x) * aCorner.y * uWidth / uRes * p.w;
  vSide = aCorner.y;
  gl_Position = p;
}`,
    fragmentShader: `
uniform vec3 uColor; uniform float uOpacity;
varying float vSide;
void main(){ gl_FragColor = vec4(uColor, uOpacity * (1.0 - smoothstep(0.3, 1.0, abs(vSide)))); }`,
    uniforms: { uTime: { value: 0 }, uMotion: { value: 1 }, uIntro: { value: 0 }, uRes: { value: new THREE.Vector2(W() || 2, H() || 2) },
                uWidth: { value: 1.4 }, uColor: { value: new THREE.Color(0xffd2b8) }, uOpacity: { value: 0.75 } },
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  });
  const hlGeo = new THREE.BufferGeometry();
  const hl = new THREE.Mesh(hlGeo, hlMat);
  hl.frustumCulled = false; hl.renderOrder = 2;
  brain.add(hl); mats.push(hlMat);
  const CORNERS = [0, -1, 0, 1, 1, 1, 0, -1, 1, 1, 1, -1];   // dos triángulos por línea: (a lo largo, de lado)
  function highlightLinks(id) {
    hlGeo.dispose();   // suelta los búferes del resaltado anterior
    const a = [], b = [], c = [], ph = [];
    let n = 0;
    if (id && mainIndex[id] != null) {
      const i = mainIndex[id];
      for (const nb of (UI.ADJ[id] || [])) {
        const j = mainIndex[nb]; if (j == null) continue;
        n++;
        for (let v = 0; v < 6; v++) {
          a.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); b.push(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]);
          c.push(CORNERS[v * 2], CORNERS[v * 2 + 1]); ph.push(phase[i], phase[j]);
        }
      }
    }
    // un archivo con muchas conexiones no enciende un abanico blanco: cada línea baja su opacidad (de 0.75 a 0.35)
    hlMat.uniforms.uOpacity.value = Math.max(0.35, Math.min(0.75, 0.75 * Math.sqrt(8 / Math.max(n, 1))));
    hlGeo.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
    hlGeo.setAttribute('aEnd', new THREE.Float32BufferAttribute(b, 3));
    hlGeo.setAttribute('aCorner', new THREE.Float32BufferAttribute(c, 2));
    hlGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 2));
  }

  // ---------- anillo de skills y rutinas (Second Brain) / órbitas (OS) ----------
  const ring = new THREE.Group(); world.add(ring);
  const ringItems = [];
  if (!OS) {
    ring.rotation.set(1.12, 0, 0.14);
    const R = 1.5, dust = 1800, dp = [], dc = [], ds = [], dph = [];
    const amber = new THREE.Color('#ffb547'), orange = new THREE.Color('#ff7a35');
    for (let i = 0; i < dust; i++) {
      const t = (i / dust) * Math.PI * 2, h = hash(i + 7), h2 = hash(i * 1.3 + 2);
      const rr = R + (h - 0.5) * 0.09, zz = (h2 - 0.5) * 0.05;
      dp.push(Math.cos(t) * rr, Math.sin(t) * rr, zz);
      tmpC.copy(h > 0.5 ? amber : orange).multiplyScalar(0.35 + h2 * 0.5); dc.push(tmpC.r, tmpC.g, tmpC.b);
      ds.push(6 + h * 8); dph.push(h2);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
    dg.setAttribute('color', new THREE.Float32BufferAttribute(dc, 3));
    dg.setAttribute('size', new THREE.Float32BufferAttribute(ds, 1));
    dg.setAttribute('phase', new THREE.Float32BufferAttribute(dph, 1));
    dg.setAttribute('dim', new THREE.Float32BufferAttribute(new Float32Array(dust).fill(1), 1));
    const dm = pointsMaterial(1); mats.push(dm);
    ring.add(new THREE.Points(dg, dm));
    const items = [
      ...B.routines.map(r => ({ kind: 'rutina', name: r.nombre, icon: r.icono, ref: r, color: '#ffd9c2', ringc: 'rgba(255,106,43,0.95)' })),
      ...B.skills.map(s => ({ kind: 'skill', name: '/' + s.id, icon: s.icono, ref: s, color: '#ffe2b0', ringc: 'rgba(255,181,71,0.75)' }))
    ];
    items.forEach((it, i) => {
      const t = (i / items.length) * Math.PI * 2;
      const s = iconSprite(it.icon, it.color, it.ringc);
      s.position.set(Math.cos(t) * R, Math.sin(t) * R, 0);
      s.scale.setScalar(it.kind === 'rutina' ? 0.12 : 0.09);
      s.userData = it; ring.add(s); ringItems.push(s);
    });
  } else {
    // órbitas de color y domo exterior punteado (decoración, no son datos)
    const orbit = (rx, ry, tilt, n, colA, colB, seed) => {
      const op = [], oc = [], os = [], oph = [];
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2 + hash(i + seed) * 0.02, h = hash(i * 2.7 + seed);
        op.push(Math.cos(t) * rx * (1 + (h - .5) * .05), Math.sin(t) * ry * (1 + (h - .5) * .05), (hash(i + seed * 3) - .5) * .06);
        tmpC.set(h > 0.82 ? colB : colA).multiplyScalar(0.45 + h * 0.6); oc.push(tmpC.r, tmpC.g, tmpC.b);
        os.push(h > 0.9 ? 12 : 4 + h * 5); oph.push(h);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(op, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(oc, 3));
      g.setAttribute('size', new THREE.Float32BufferAttribute(os, 1));
      g.setAttribute('phase', new THREE.Float32BufferAttribute(oph, 1));
      g.setAttribute('dim', new THREE.Float32BufferAttribute(new Float32Array(n).fill(1), 1));
      const m = pointsMaterial(1.7); mats.push(m);
      const o = new THREE.Points(g, m); o.rotation.set(1.2, tilt, 0.3); return o;
    };
    const o1 = orbit(1.05, 0.62, 0.35, 700, '#3f8cff', '#ff8a3d', 1), o2 = orbit(0.95, 0.72, -0.5, 520, '#3fd0ff', '#ffb547', 9);
    ring.add(o1, o2); ringItems.push(o1, o2);
    const dp = [], dc = [], ds = [], dph = [];
    for (let lat = -84; lat <= 84; lat += 4) {
      const la = lat * Math.PI / 180, n = Math.max(8, Math.round(Math.cos(la) * 130));
      for (let i = 0; i < n; i++) {
        const lo = (i / n) * Math.PI * 2, r = 1.9;
        const x = Math.cos(la) * Math.cos(lo), y = Math.sin(la), z = Math.cos(la) * Math.sin(lo);
        dp.push(x * r, y * r, z * r);
        // cáscara iluminada desde arriba a la izquierda, como una esfera de verdad: un lado brilla y el otro se apaga
        const lit = Math.max(0, -0.5 * x + 0.62 * y + 0.6 * z), g = 0.06 + Math.pow(0.28 + 0.72 * lit, 1.4) * 0.62 + hash(i + lat * 31) * 0.05;
        dc.push(g, g * 0.97, g * 0.93); ds.push(9 + lit * 8); dph.push(hash(i * lat));
      }
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
    dg.setAttribute('color', new THREE.Float32BufferAttribute(dc, 3));
    dg.setAttribute('size', new THREE.Float32BufferAttribute(ds, 1));
    dg.setAttribute('phase', new THREE.Float32BufferAttribute(dph, 1));
    dg.setAttribute('dim', new THREE.Float32BufferAttribute(new Float32Array(ds.length).fill(1), 1));
    const dm = pointsMaterial(1.5); mats.push(dm);
    const dome = new THREE.Points(dg, dm); world.add(dome); ringItems.push(dome);
  }

  // ---------- etiquetas de zona ----------
  const labels = [];
  if (opts.labels) {
    for (const cat of UI.CAT_ORDER) {
      if (!catCentroid[cat]) continue;
      const el = document.createElement('div');
      el.className = 'zlabel'; el.textContent = B.catLabel[cat]; el.style.color = UI.CAT_COLOR[cat];
      opts.labels.appendChild(el);
      labels.push({ el, v: catCentroid[cat].clone().multiplyScalar(1.13), obj: brain, cat });
    }
    const add = (txt, v, obj, color) => {
      const el = document.createElement('div'); el.className = 'zlabel'; el.textContent = txt; el.style.color = color;
      opts.labels.appendChild(el); labels.push({ el, v, obj, always: true });
    };
    add('MEMORIA', new THREE.Vector3(0, -0.42, 0), brain, '#ffffff');
    if (!OS) {
      add('RUTINAS', new THREE.Vector3(-1.62, 0.55, 0), ring, '#ffb08a');
      add('SKILLS', new THREE.Vector3(0.55, -1.72, 0), ring, '#ffd28a');
    }
  }

  // ---------- interacción ----------
  const ray = new THREE.Raycaster(); ray.params.Points.threshold = OS ? 0.03 : 0.022;
  const mouse = new THREE.Vector2(-9, -9);
  let hoverId = null, selectedId = null, filter = null, catOff = new Set();
  let downAt = null;
  function setMouse(e) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    mouse.cx = e.clientX; mouse.cy = e.clientY;
  }
  renderer.domElement.addEventListener('pointermove', setMouse);
  renderer.domElement.addEventListener('pointerleave', () => mouse.set(-9, -9));
  renderer.domElement.addEventListener('pointerdown', e => downAt = [e.clientX, e.clientY]);
  renderer.domElement.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    // se calcula en el momento del clic, no con el último cuadro animado
    setMouse(e); world.updateMatrixWorld(true); pick();
    if (hoverItem && opts.onRingPick) return opts.onRingPick(hoverItem.userData);
    if (hoverId && opts.onPick) opts.onPick(UI.BYID[hoverId]);
  });
  renderer.domElement.addEventListener('dblclick', e => {
    setMouse(e); world.updateMatrixWorld(true); pick();
    if (hoverId && opts.onOpen) opts.onOpen(UI.BYID[hoverId]);
  });
  let hoverItem = null;

  function pick() {
    if (mouse.x < -2) { setHover(null); hoverItem = null; return; }
    ray.setFromCamera(mouse, camera);
    if (!OS && ringItems.length) {
      const hitS = ray.intersectObjects(ringItems, false)[0];
      hoverItem = hitS ? hitS.object : null;
      if (hoverItem) { setHover(null); opts.onHover && opts.onHover({ ring: hoverItem.userData }, mouse.cx, mouse.cy); renderer.domElement.style.cursor = 'pointer'; return; }
    }
    const hits = ray.intersectObject(points, false);
    const dimA = geo.attributes.dim.array;
    let id = null;
    for (const h of hits) { if (dimA[h.index] > 0.5) { id = owner[h.index]; break; } }
    setHover(id);
  }
  function setHover(id) {
    renderer.domElement.style.cursor = id ? 'pointer' : '';
    if (id === hoverId) { if (id && opts.onHover) opts.onHover(UI.BYID[id], mouse.cx, mouse.cy); return; }
    hoverId = id;
    if (!selectedId) highlightLinks(id);
    if (opts.onHover) opts.onHover(id ? UI.BYID[id] : null, mouse.cx, mouse.cy);
    applyDim();
  }

  function applyDim() {
    const d = geo.attributes.dim.array;
    const focus = selectedId || hoverId;
    const nb = focus ? new Set([focus, ...(UI.ADJ[focus] || [])]) : null;
    for (let i = 0; i < N; i++) {
      const id = owner[i], n = UI.BYID[id];
      let v = 1;
      if (catOff.has(n.cat)) v = 0.05;
      else if (filter && !filter.has(id)) v = 0.08;
      else if (selectedId && !nb.has(id)) v = 0.28;
      if (focus === id) v = 2.2; else if (nb && nb.has(id) && i === mainIndex[id]) v = Math.max(v, 1.9);
      d[i] = v;
    }
    geo.attributes.dim.needsUpdate = true;
    
  }

  // ---------- animación ----------
  let motion = 1, rotSpeed = OS ? 0.0009 : 0.0011, fly = null, paused = false;
  const home = camera.position.clone();
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let introT0 = performance.now(), intro = reduce ? 1 : 0;   // por reloj, no por cuadros: no se atora si la pestaña está oculta
  const clock = new THREE.Clock();
  const v3 = new THREE.Vector3(), camDir = new THREE.Vector3();
  const frameCbs = [];
  function frame() {
    requestAnimationFrame(frame);
    if (paused || !W() || !H()) return;   // sin tamaño todavía (pestaña oculta): no se dibuja
    const t = clock.getElapsedTime();
    if (!reduce) intro = Math.min(1, (performance.now() - introT0) / 1700);
    for (const m of mats) { m.uniforms.uTime.value = t; m.uniforms.uMotion.value = motion; m.uniforms.uIntro.value = intro; }
    if (!fly && !selectedId) brain.rotation.y += rotSpeed * motion;
    // el núcleo respira despacio (un ciclo cada ~15 s) en lugar de brillar fijo o parpadear
    coreGlow.material.opacity = 0.72 + 0.12 * motion * Math.sin(t * 0.42);
    if (!OS) ring.rotation.z += 0.0009 * motion;
    else { ringItems[0].rotation.z += 0.0012 * motion; ringItems[1].rotation.z -= 0.0009 * motion; }   // la cáscara no gira: su luz queda fija
    if (fly) {
      fly.t = Math.min(1, fly.t + 0.022);
      const e = 1 - Math.pow(1 - fly.t, 3);
      camera.position.lerpVectors(fly.from, fly.to, e);
      if (fly.t >= 1) fly = null;
    }
    controls.update();
    pick();
    camera.getWorldDirection(camDir);
    for (const L of labels) {
      v3.copy(L.v); L.obj.localToWorld(v3);
      const facing = L.always ? 1 : -v3.clone().normalize().dot(camDir);
      v3.project(camera);
      const x = (v3.x * 0.5 + 0.5) * W(), y = (-v3.y * 0.5 + 0.5) * H();
      const r = container.getBoundingClientRect();
      L.el.style.left = (r.left + x) + 'px'; L.el.style.top = (r.top + y) + 'px';
      L.el.style.opacity = L.cat && catOff.has(L.cat) ? 0 : L.always ? 0.95 : Math.max(0, Math.min(1, (facing + 0.05) * 2.6));
    }
    for (const cb of frameCbs) cb();
    composer.render();
  }
  frame();

  new ResizeObserver(() => {
    if (!W() || !H()) return;
    camera.aspect = W() / H(); camera.updateProjectionMatrix();
    renderer.setSize(W(), H()); composer.setSize(W(), H()); bloom.setSize(W(), H());
    hlMat.uniforms.uRes.value.set(W(), H());
  }).observe(container);

  // radio en pantalla de la esfera, para acomodar el anillo de hexágonos
  function screenFrame() {
    const r = container.getBoundingClientRect();
    const c = new THREE.Vector3(0, 0, 0).project(camera);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(brain.scale.x * world.scale.x);
    const e = right.project(camera);
    return { cx: r.left + (c.x * .5 + .5) * r.width, cy: r.top + (-c.y * .5 + .5) * r.height, R: Math.abs(e.x - c.x) * .5 * r.width };
  }

  return {
    focus(id) {
      const i = mainIndex[id]; if (i == null) return;
      selectedId = id; highlightLinks(id); applyDim();
      v3.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); brain.localToWorld(v3);
      const dir = v3.length() < 0.5 ? camera.position.clone().normalize() : v3.clone().normalize();
      fly = { t: 0, from: camera.position.clone(), to: dir.multiplyScalar(UI.BYID[id].cat === 'memoria' ? 2.6 : 2.9) };
    },
    clearSelection() {
      if (selectedId && camera.position.distanceTo(home) > 0.05) fly = { t: 0, from: camera.position.clone(), to: home.clone() };
      selectedId = null; highlightLinks(hoverId); applyDim();
    },
    replay() { introT0 = performance.now(); },
    setFilter(set) { filter = set; applyDim(); },
    setCatOff(set) { catOff = set; applyDim(); },
    setMotion(m) { motion = m; },
    setPaused(p) { paused = p; labels.forEach(L => L.el.style.display = p ? 'none' : ''); },
    onFrame(cb) { frameCbs.push(cb); },
    screenFrame,
    // ajusta el tamaño en pantalla: radio de la esfera de datos en pixeles
    fitRadius(px) { for (let k = 0; k < 2; k++) { const r = screenFrame().R; if (r > 0 && px > 0) world.scale.multiplyScalar(px / r); } },
    count: N
  };
}
