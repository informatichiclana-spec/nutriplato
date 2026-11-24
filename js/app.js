'use strict';
/* NutriPlato — escáner de productos, diario de comidas, macros, peso e IMC.
   Todo se guarda en el propio teléfono (localStorage). */

/* ---------- Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r0 = n => Math.round(n || 0);
const r1 = n => Math.round((n || 0) * 10) / 10;
const fmt1 = n => r1(n).toLocaleString('es-ES', { maximumFractionDigits: 1 });
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const DAY = 86400000;
const z2 = n => String(n).padStart(2, '0');
const dkey = d => d.getFullYear() + '-' + z2(d.getMonth() + 1) + '-' + z2(d.getDate());
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); };
const todayKey = () => dkey(new Date());
const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / DAY);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const stem = t => (t.length > 4 && t.endsWith('es')) ? t.slice(0, -2) : (t.length > 3 && t.endsWith('s')) ? t.slice(0, -1) : t;
const toks = s => norm(s).split(' ').filter(Boolean).map(stem);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- Constantes ---------- */
const MEALS = [
  { id: 'desayuno', name: 'Desayuno', ico: '☀️' },
  { id: 'mediamanana', name: 'Media mañana', ico: '🍎' },
  { id: 'comida', name: 'Comida', ico: '🍽️' },
  { id: 'merienda', name: 'Merienda', ico: '🥪' },
  { id: 'cena', name: 'Cena', ico: '🌙' },
  { id: 'picoteo', name: 'Picoteo y otros', ico: '🍿' },
];
const DISH_TYPES = ['Plato único', 'Primer plato', 'Segundo plato', 'Guarnición', 'Ensalada', 'Postre', 'Bebida', 'Pan'];
const CF_PRESETS = [
  [1, 'No cambia al cocinar'], [2.2, 'Pasta (pesa ×2,2 cocida)'], [2.7, 'Arroz (×2,7 cocido)'],
  [2.5, 'Legumbre seca (×2,5)'], [2.4, 'Cuscús / quinoa (×2,4)'], [0.75, 'Carne (pierde ~25%)'],
  [0.8, 'Pescado (pierde ~20%)'], [0.65, 'Bacon / muy graso (pierde ~35%)'],
];
const ACT = [
  [1.2, 'Sedentario (poco o nada de ejercicio)'], [1.375, 'Ligero (1-3 días/semana)'],
  [1.55, 'Moderado (3-5 días/semana)'], [1.725, 'Alto (6-7 días/semana)'], [1.9, 'Muy alto (doble sesión o trabajo físico)'],
];
const NK = ['kcal', 'p', 'c', 's', 'f', 'sf', 'fi', 'na'];
const NL = { kcal: 'Calorías', p: 'Proteínas', c: 'Hidratos', s: 'Azúcares', f: 'Grasas', sf: 'Saturadas', fi: 'Fibra', na: 'Sal' };
const CAT_EMOJI = { Cereales: '🍝', Tubérculos: '🥔', Legumbres: '🫘', Carnes: '🥩', Embutidos: '🥓', Pescados: '🐟', 'Huevos y lácteos': '🥛', Verduras: '🥦', Frutas: '🍎', 'Grasas y salsas': '🫒', 'Frutos secos': '🥜', Platos: '🍲', Dulces: '🍫', Bebidas: '🥤', Suplementos: '💪', Snacks: '🍟' };
const BASE = window.BASE_FOODS || [];
const BASE_MAP = Object.fromEntries(BASE.map(f => [f.id, f]));

/* ---------- Estado y guardado ---------- */
const KEY = 'nutriplato_v1';
const DEF = () => ({ v: 1, profile: null, weights: [], products: {}, days: {}, fav: [], usage: {}, lastG: {} });
let S = load();
const UI = { tab: 'hoy', date: todayKey(), range: 90, foodFilter: 'todos', foodQ: '' };

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v) return Object.assign(DEF(), s);
  } catch (e) { /* datos corruptos: empezar de cero */ }
  return DEF();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('⚠️ No se pudo guardar (almacenamiento lleno)'); }
  if (!save._p && navigator.storage && navigator.storage.persist) { save._p = 1; navigator.storage.persist().catch(() => {}); }
}

/* ---------- Alimentos ---------- */
const getFood = id => S.products[id] || BASE_MAP[id] || null;
const allFoods = () => [...Object.values(S.products), ...BASE];

function guessCF(name) {
  const n = norm(name);
  if (/(cocid|bote|conserva|lata|precocinad|microondas|vasito|ya hecho|listo)/.test(n)) return 1;
  if (/(fresc[ao]|rellen|gnocchi|noqui)/.test(n) && /(pasta|ravioli|tortellini)/.test(n)) return 1;
  if (/(macarr|espague|spaghet|tallarin|fideo|pasta|helice|penne|plumas|lazos|fusilli|tagliatel|lasana|canelon|codito|estrellita)/.test(n)) return 2.2;
  if (/arroz/.test(n) && !/(bebida|tortita|leche|galleta|harina|inflado)/.test(n)) return 2.7;
  if (/(lenteja|garbanzo|alubia|judia blanca|frijol|fabe)/.test(n)) return 2.5;
  if (/(cuscus|cous|quinoa|bulgur)/.test(n)) return 2.4;
  if (/(fiambre|lonchas|asad|jamon|cocido|ahumad|pechuga de pavo braseada)/.test(n)) return 1;
  if (/(bacon|panceta|beicon)/.test(n)) return 0.65;
  if (/(pollo|pechuga|ternera|cerdo|lomo|filete|hamburguesa|picada|solomillo|chuleta|pavo|cordero|secreto|presa)/.test(n)) return 0.75;
  if (/(salmon|merluza|bacalao|pescado|dorada|lubina|atun fresco|emperador|lenguado|rape)/.test(n)) return 0.8;
  return 1;
}

function searchFoods(q, scope = 'todos') {
  let list = allFoods();
  if (scope === 'mios') list = list.filter(f => f.src !== 'base');
  if (scope === 'base') list = list.filter(f => f.src === 'base');
  const qt = toks(q);
  if (!qt.length) {
    return list.sort((a, b) => (usage(b) - usage(a)) || ((a.src === 'base') - (b.src === 'base')) || a.name.localeCompare(b.name, 'es'));
  }
  const out = [];
  for (const f of list) {
    const hay = norm(`${f.name} ${f.brand || ''} ${f.alias || ''} ${f.barcode || ''}`);
    const ht = hay.split(' ').map(stem);
    let sc = 0, all = true;
    for (const t of qt) {
      if (ht.some(h => h.startsWith(t))) sc += 3;
      else if (hay.includes(t)) sc += 1;
      else { all = false; break; }
    }
    if (!all) continue;
    if (f.src !== 'base') sc += 2;
    if (toks(f.name)[0]?.startsWith(qt[0])) sc += 2;
    sc += Math.min(usage(f), 5) * 0.3;
    out.push([sc, f]);
  }
  return out.sort((a, b) => b[0] - a[0]).map(x => x[1]);
}
// Si no hay coincidencia exacta, sugiere genéricos que coincidan con alguna palabra.
function fuzzyBase(q) {
  const qt = toks(q).filter(t => t.length >= 3);
  if (!qt.length) return [];
  const out = [];
  for (const f of BASE) {
    const ht = norm(`${f.name} ${f.alias}`).split(' ').map(stem);
    let sc = 0;
    for (const t of qt) if (ht.some(h => h.startsWith(t) || t.startsWith(h) && h.length >= 4)) sc++;
    if (sc) out.push([sc, f]);
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, 6).map(x => x[1]);
}
const usage = f => (S.usage[f.id] || 0);

/* Puntuación de salud 0-100 al estilo semáforo */
function scoreOf(f) {
  const ns = (f.ns || '').toLowerCase();
  const n = f.n || {};
  let s;
  if ('abcde'.includes(ns) && ns) {
    s = { a: 88, b: 70, c: 50, d: 30, e: 12 }[ns];
  } else {
    s = 100;
    s -= Math.min(Math.max(0, (n.kcal - 150) / 10), 25);
    s -= Math.min((n.s || 0) * 1.5, 30);
    s -= Math.min((n.sf || 0) * 3, 25);
    s -= Math.min((n.na || 0) * 12, 20);
    s += Math.min(n.p || 0, 20) * 0.6 + Math.min(n.fi || 0, 8) * 1.5;
    s = Math.max(2, Math.min(98, s));
  }
  s = Math.round(s);
  const lb = s >= 75 ? ['Excelente', 'sc-ex', '#16a34a'] : s >= 50 ? ['Bueno', 'sc-go', '#65a30d'] : s >= 25 ? ['Mediocre', 'sc-me', '#f59e0b'] : ['Malo', 'sc-ba', '#dc2626'];
  return { s, label: lb[0], cls: lb[1], color: lb[2] };
}

/* ---------- Cálculos nutricionales ---------- */
function rawGrams(it) { return (it.st === 'cocinado' && it.cf && it.cf !== 1) ? it.g / it.cf : it.g; }
function calcItem(it) {
  const k = rawGrams(it) / 100, o = {};
  for (const x of NK) o[x] = (it.n?.[x] || 0) * k;
  return o;
}
const zero = () => Object.fromEntries(NK.map(k => [k, 0]));
function addTo(a, b) { for (const k of NK) a[k] += b[k] || 0; return a; }
function dishTotals(d) { return d.items.reduce((a, it) => addTo(a, calcItem(it)), zero()); }
function mealTotals(m) { return (m?.dishes || []).reduce((a, d) => addTo(a, dishTotals(d)), zero()); }
function dayTotals(day) { return MEALS.reduce((a, m) => addTo(a, mealTotals(day?.meals?.[m.id])), zero()); }

function getDay(k, create = false) {
  let d = S.days[k];
  if (!d && create) d = S.days[k] = { meals: {}, water: 0 };
  return d || { meals: {}, water: 0 };
}
function getMeal(k, mid, create = false) {
  const d = getDay(k, create);
  if (!d.meals[mid] && create) d.meals[mid] = { dishes: [] };
  return d.meals[mid] || { dishes: [] };
}
function findDish(k, mid, did) { return getMeal(k, mid).dishes.find(d => d.id === did); }

/* ---------- Perfil, objetivos, peso, IMC ---------- */
function ageOf(b) {
  if (!b) return null;
  const d = new Date(b), n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a;
}
const sortedWeights = () => [...S.weights].sort((a, b) => a.d.localeCompare(b.d));
const currentWeight = () => { const w = sortedWeights(); return w.length ? w[w.length - 1].kg : num(S.profile?.peso); };
function bmiOf(kg) { const h = num(S.profile?.altura) / 100; return h > 0 && kg > 0 ? kg / (h * h) : 0; }
function bmiCat(b) {
  if (!b) return { name: '—', color: 'var(--tx3)', lvl: 'info' };
  if (b < 18.5) return { name: 'Bajo peso', color: '#60a5fa', lvl: 'warn' };
  if (b < 25) return { name: 'Peso normal', color: '#22c55e', lvl: 'ok' };
  if (b < 30) return { name: 'Sobrepeso', color: '#f59e0b', lvl: 'warn' };
  if (b < 35) return { name: 'Obesidad grado I', color: '#f97316', lvl: 'bad' };
  if (b < 40) return { name: 'Obesidad grado II', color: '#ef4444', lvl: 'bad' };
  return { name: 'Obesidad grado III', color: '#b91c1c', lvl: 'bad' };
}
function targets() {
  const p = S.profile || {};
  const w = currentWeight() || 70, h = num(p.altura) || 170, age = ageOf(p.nacimiento) || 30;
  const bmr = 10 * w + 6.25 * h - 5 * age + (p.sexo === 'm' ? -161 : 5);
  const tdee = bmr * (num(p.actividad) || 1.375);
  const ritmo = num(p.ritmo) || 0.5;
  let kcal = tdee;
  if (p.objetivo === 'perder') kcal = tdee - ritmo * 1100;
  if (p.objetivo === 'ganar') kcal = tdee + ritmo * 1100;
  kcal = Math.max(kcal, p.sexo === 'm' ? 1200 : 1500);
  if (num(p.kcalManual) > 0) kcal = num(p.kcalManual);
  // Para la proteína se usa como tope el peso equivalente a un IMC de 27
  const refW = Math.min(w, 27 * (h / 100) ** 2);
  const pk = num(p.protKg) || (p.objetivo === 'mantener' ? 1.5 : 1.8);
  const P = refW * pk, F = kcal * 0.28 / 9, C = Math.max(0, (kcal - P * 4 - F * 9) / 4);
  return { kcal: r0(kcal), p: r0(P), c: r0(C), f: r0(F), s: r0(kcal * 0.1 / 4), sf: r0(kcal * 0.1 / 9), fi: r0(Math.max(25, kcal / 1000 * 14)), na: 5, bmr: r0(bmr), tdee: r0(tdee) };
}
function weighDue() {
  const w = sortedWeights();
  if (!w.length) return 'Aún no has registrado tu peso.';
  const d = daysBetween(w[w.length - 1].d, todayKey());
  return d >= 7 ? `Tu último pesaje fue hace ${d} días. Recomendado: una vez por semana.` : null;
}

/* Estado de cada nutriente → color */
function stTarget(v, t) { const r = v / t; return r > 1.2 ? 'bad' : r > 1.1 ? 'warn' : r >= 0.9 ? 'ok' : 'low'; }
function stProt(v, t) { const r = v / t; return r >= 0.9 ? (r > 1.6 ? 'warn' : 'ok') : 'low'; }
function stLimit(v, t) { const r = v / t; return r > 1 ? 'bad' : r > 0.8 ? 'warn' : 'ok'; }
function stMin(v, t) { return v >= t ? 'ok' : v >= t * 0.6 ? 'low' : 'low'; }
const ST_COLOR = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', low: 'var(--low)' };

function dayAlerts(tot, T, k) {
  const A = [];
  if (tot.kcal < 1) return [{ l: 'info', i: '📝', t: 'Aún no has apuntado nada este día. Pulsa «Añadir plato» en una comida o escanea un producto.' }];
  const past = k < todayKey();
  const late = past || new Date().getHours() >= 21;
  const kr = tot.kcal / T.kcal;
  if (kr > 1.1) A.push({ l: 'bad', i: '🔥', t: `Te has pasado <b>${r0(tot.kcal - T.kcal)} kcal</b> de tu objetivo (${T.kcal} kcal).` });
  else if (kr >= 0.9) A.push({ l: 'ok', i: '✅', t: `Calorías en tu objetivo: <b>${r0(tot.kcal)}</b> de ${T.kcal} kcal.` });
  else A.push({ l: late ? 'warn' : 'low', i: late ? '⚠️' : '🍽️', t: `Te quedan <b>${r0(T.kcal - tot.kcal)} kcal</b> para llegar a tu objetivo.` });

  if (tot.p < T.p * 0.9) A.push({ l: late ? 'warn' : 'low', i: '💪', t: `Te faltan <b>${r0(T.p - tot.p)} g de proteína</b> (llevas ${r0(tot.p)} de ${T.p} g). Ideas: pollo, huevos, atún, yogur proteico, legumbre.` });
  else A.push({ l: 'ok', i: '💪', t: `Proteína cubierta: ${r0(tot.p)} de ${T.p} g.` });
  if (tot.c > T.c * 1.15) A.push({ l: 'warn', i: '🍞', t: `Vas alto de hidratos: <b>${r0(tot.c)} g</b> (objetivo ${T.c} g).` });
  if (tot.f > T.f * 1.15) A.push({ l: tot.f > T.f * 1.3 ? 'bad' : 'warn', i: '🧈', t: `Vas alto de grasas: <b>${r0(tot.f)} g</b> (objetivo ${T.f} g).` });
  if (tot.s > T.s) A.push({ l: 'bad', i: '🍬', t: `Te has pasado de azúcar: <b>${r0(tot.s)} g</b> (máximo recomendado ${T.s} g).` });
  else if (tot.s > T.s * 0.8) A.push({ l: 'warn', i: '🍬', t: `Cuidado con el azúcar: ${r0(tot.s)} de ${T.s} g máximo.` });
  if (tot.sf > T.sf) A.push({ l: 'bad', i: '🥓', t: `Te has pasado de grasas saturadas: <b>${r0(tot.sf)} g</b> (máximo ${T.sf} g).` });
  if (tot.na > T.na) A.push({ l: 'bad', i: '🧂', t: `Te has pasado de sal: <b>${fmt1(tot.na)} g</b> (máximo ${T.na} g).` });
  if (late && tot.fi < T.fi * 0.7) A.push({ l: 'warn', i: '🥦', t: `Poca fibra: ${r0(tot.fi)} de ${T.fi} g. Añade verdura, fruta, legumbre o integrales.` });
  return A;
}

/* Veredicto: ¿vas bien, regular o mal? */
function verdict() {
  const p = S.profile || {}, w = sortedWeights(), T = targets();
  const reasons = [];
  let lvl = null;
  if (w.length >= 2) {
    const last = w[w.length - 1];
    let from = w.find(x => daysBetween(x.d, last.d) <= 35);
    if (from === last) from = w[w.length - 2];
    const days = Math.max(1, daysBetween(from.d, last.d));
    const rate = (last.kg - from.kg) / days * 7;
    const rTxt = `${rate > 0 ? '+' : ''}${fmt1(rate)} kg/semana en las últimas ${Math.round(days / 7) || 1} semanas`;
    const goalW = num(p.pesoObjetivo);
    if (p.objetivo === 'perder') {
      if (goalW && last.kg <= goalW) { lvl = 'bien'; reasons.push(`¡Has llegado a tu peso objetivo (${fmt1(goalW)} kg)! Puedes pasar a «Mantener».`); }
      else if (rate <= -0.2 && rate >= -1.2) { lvl = 'bien'; reasons.push(`Estás bajando a buen ritmo: ${rTxt}.`); }
      else if (rate < -1.2) { lvl = 'regular'; reasons.push(`Bajas demasiado rápido (${rTxt}). Puedes perder músculo: come algo más.`); }
      else if (rate <= 0.1) { lvl = 'regular'; reasons.push(`Estás estancado (${rTxt}). Revisa que apuntas todo y ajusta las cantidades.`); }
      else { lvl = 'mal'; reasons.push(`Estás subiendo de peso (${rTxt}) y tu objetivo es perder.`); }
    } else if (p.objetivo === 'ganar') {
      if (rate >= 0.1 && rate <= 0.6) { lvl = 'bien'; reasons.push(`Subes a buen ritmo: ${rTxt}.`); }
      else if (rate > 0.6 && rate <= 1) { lvl = 'regular'; reasons.push(`Subes algo rápido (${rTxt}); parte puede ser grasa.`); }
      else if (rate > -0.1 && rate < 0.1) { lvl = 'regular'; reasons.push(`Tu peso no se mueve (${rTxt}). Come un poco más.`); }
      else { lvl = 'mal'; reasons.push(rate < 0 ? `Estás bajando (${rTxt}) y tu objetivo es ganar.` : `Subes demasiado rápido (${rTxt}).`); }
    } else {
      const a = Math.abs(rate);
      lvl = a <= 0.25 ? 'bien' : a <= 0.5 ? 'regular' : 'mal';
      reasons.push(a <= 0.25 ? `Tu peso se mantiene estable (${rTxt}).` : `Tu peso está cambiando (${rTxt}) y tu objetivo es mantener.`);
    }
  }
  // Constancia con las calorías (últimos 7 días con registros)
  const logged = [];
  for (let i = 1; i <= 7; i++) { const k = addDays(todayKey(), -i); const t = dayTotals(S.days[k]); if (t.kcal > 300) logged.push(t.kcal); }
  if (logged.length >= 3) {
    const avg = logged.reduce((a, b) => a + b, 0) / logged.length, r = avg / T.kcal;
    let al = r >= 0.9 && r <= 1.1 ? 'bien' : r >= 0.8 && r <= 1.2 ? 'regular' : 'mal';
    reasons.push(`Media de los últimos días: ${r0(avg)} kcal (objetivo ${T.kcal}) → ${al === 'bien' ? 'muy constante 👍' : al === 'regular' ? 'algo desviado' : r > 1 ? 'te estás pasando' : 'comes demasiado poco'}.`);
    if (!lvl) lvl = al;
    else if (lvl === 'bien' && al === 'mal') lvl = 'regular';
  } else reasons.push('Apunta tus comidas al menos 3 días para valorar tu constancia.');
  const bmi = bmiOf(currentWeight()), cat = bmiCat(bmi);
  if (bmi) reasons.push(`IMC ${fmt1(bmi)}: ${cat.name.toLowerCase()}.`);
  if (!lvl) return { lvl: 'info', e: '🕐', title: 'Aún faltan datos', reasons: ['Registra tu peso una vez por semana y apunta tus comidas para ver cómo vas.', ...reasons] };
  const M = { bien: ['💚', '¡Vas bien!'], regular: ['🟡', 'Vas regular'], mal: ['🔴', 'Vas mal'] }[lvl];
  return { lvl, e: M[0], title: M[1], reasons };
}

/* ---------- Hojas inferiores (modales) con botón atrás de Android ---------- */
const sheets = [];
let popWaiters = [];
history.replaceState({ depth: 0 }, '');
function openSheet(html, o = {}) {
  const w = document.createElement('div');
  w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet-bg"></div><div class="sheet ${o.cls || ''}">${sheetInner(html, o.title)}</div>`;
  document.body.appendChild(w);
  sheets.push(w);
  history.pushState({ depth: sheets.length }, '');
  w._on = o.on || {};
  w._onClose = o.onClose;
  w.querySelector('.sheet-bg').addEventListener('click', () => closeSheet());
  w.addEventListener('click', e => {
    const el = e.target.closest('[data-x]');
    if (el && w.contains(el) && w._on[el.dataset.x]) w._on[el.dataset.x](el, e);
    if (e.target.closest('[data-a="close-sheet"]')) closeSheet();
  });
  requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('open')));
  if (o.mount) { try { o.mount(w); } catch (err) { console.error(err); } }
  return w;
}
function sheetInner(html, title) {
  return `<div class="sheet-grab"></div>${title ? `<div class="sheet-title"><h3>${title}</h3><button class="icon-btn" data-a="close-sheet" aria-label="Cerrar">✕</button></div>` : ''}<div class="sheet-body">${html}</div>`;
}
function closeSheet(n = 1) {
  n = Math.min(n, sheets.length);
  if (!n) return Promise.resolve();
  return new Promise(res => { popWaiters.push(res); history.go(-n); });
}
const closeAll = () => closeSheet(sheets.length);
window.addEventListener('popstate', e => {
  const depth = (e.state && e.state.depth) || 0;
  while (sheets.length > depth) {
    const w = sheets.pop();
    try { w._cleanup && w._cleanup(); w._onClose && w._onClose(); } catch (err) { console.error(err); }
    w.classList.remove('open');
    setTimeout(() => w.remove(), 260);
  }
  const ws = popWaiters; popWaiters = []; ws.forEach(f => f());
});

function ask({ title, text = '', input = null, ok = 'Aceptar', danger = false, placeholder = '' }) {
  return new Promise(res => {
    let done = false;
    const w = openSheet(`${text ? `<p class="muted">${text}</p>` : ''}${input !== null ? `<input class="in" id="askIn" value="${esc(input)}" placeholder="${esc(placeholder)}">` : ''}
      <div class="btn-row mt2"><button class="btn" data-x="no">Cancelar</button><button class="btn ${danger ? 'danger' : 'pri'}" data-x="yes">${ok}</button></div>`, {
      title,
      on: {
        no: () => closeSheet(),
        yes: () => { done = true; const v = input !== null ? $('#askIn', w).value.trim() : true; closeSheet().then(() => res(v)); },
      },
      onClose: () => { if (!done) res(null); },
      mount: w => { const i = $('#askIn', w); if (i) setTimeout(() => i.focus(), 250); },
    });
  });
}
function menu(title, items) {
  openSheet(`<div class="menu-list">${items.map((it, i) => `<button data-x="m" data-i="${i}" class="${it.danger ? 'danger' : ''}"><span>${it.ico || ''}</span>${it.label}</button>`).join('')}</div>`, {
    title,
    on: { m: el => { const it = items[+el.dataset.i]; closeSheet().then(() => it.fn()); } },
  });
}

/* ---------- Gráficos SVG ---------- */
function svgRing(pct, color, inner) {
  const R = 56, C = 2 * Math.PI * R, p = Math.max(0, Math.min(1, pct));
  return `<div class="ring"><svg viewBox="0 0 132 132" width="132" height="132">
    <circle cx="66" cy="66" r="${R}" fill="none" stroke="var(--bg2)" stroke-width="12"/>
    <circle cx="66" cy="66" r="${R}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(C * p).toFixed(1)} ${C.toFixed(1)}"/>
  </svg><div class="rc">${inner}</div></div>`;
}
function svgLine(pts, o = {}) {
  if (!pts.length) return '<div class="empty">Sin datos todavía</div>';
  const W = 340, H = o.h || 180, P = { l: 36, r: 12, t: 16, b: 22 };
  let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x));
  if (x1 - x0 < DAY * 6) { const m = (x0 + x1) / 2; x0 = m - DAY * 3; x1 = m + DAY * 3; }
  const yv = pts.map(p => p.y); if (o.target != null) yv.push(o.target);
  let y0 = Math.min(...yv), y1 = Math.max(...yv);
  const pad = Math.max((y1 - y0) * 0.15, o.minPad || 1); y0 -= pad; y1 += pad;
  const X = x => P.l + (x - x0) / (x1 - x0) * (W - P.l - P.r);
  const Y = y => P.t + (1 - (y - y0) / (y1 - y0)) * (H - P.t - P.b);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}">`;
  for (const b of (o.bands || [])) {
    const a = Math.max(b.from, y0), c = Math.min(b.to, y1);
    if (c > a) s += `<rect x="${P.l}" y="${Y(c).toFixed(1)}" width="${W - P.l - P.r}" height="${(Y(a) - Y(c)).toFixed(1)}" fill="${b.color}" opacity=".16"/>`;
  }
  for (let i = 0; i <= 3; i++) {
    const v = y0 + (y1 - y0) * i / 3;
    s += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${P.l - 5}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${fmt1(v)}</text>`;
  }
  if (o.target != null) s += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(o.target).toFixed(1)}" y2="${Y(o.target).toFixed(1)}" stroke="var(--acc)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${P.l + 4}" y="${(Y(o.target) - 4).toFixed(1)}" style="fill:var(--acc)">${o.targetLabel || 'Objetivo'}</text>`;
  for (let i = 0; i < 4; i++) {
    const x = x0 + (x1 - x0) * i / 3, d = new Date(x);
    s += `<text x="${X(x).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}">${d.getDate()}/${d.getMonth() + 1}</text>`;
  }
  const col = o.color || 'var(--acc)';
  const path = pts.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
  s += `<path d="${path}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  pts.forEach((p, i) => { s += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${i === pts.length - 1 ? 5 : 3}" fill="${p.color || col}" stroke="var(--card)" stroke-width="1.5"/>`; });
  const lp = pts[pts.length - 1];
  s += `<text x="${Math.min(X(lp.x), W - P.r - 2).toFixed(1)}" y="${(Y(lp.y) - 9).toFixed(1)}" text-anchor="end" style="fill:var(--tx);font-weight:700;font-size:11px">${fmt1(lp.y)}</text>`;
  return s + '</svg>';
}
function svgBars(arr, target) {
  const W = 340, H = 170, P = { l: 34, r: 8, t: 16, b: 22 };
  const max = Math.max(target * 1.3, ...arr.map(a => a.v)) || 1;
  const bw = (W - P.l - P.r) / arr.length;
  const Y = v => P.t + (1 - v / max) * (H - P.t - P.b);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}">`;
  [0, 0.5, 1].forEach(f => { const v = max * f; s += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${P.l - 5}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${r0(v)}</text>`; });
  arr.forEach((a, i) => {
    const x = P.l + i * bw + bw * 0.18, w = bw * 0.64, y = Y(a.v);
    if (a.v > 0) s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(Y(0) - y).toFixed(1)}" rx="5" fill="${a.color}"/><text x="${(x + w / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" style="font-size:9px">${r0(a.v)}</text>`;
    s += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" style="${a.today ? 'fill:var(--tx);font-weight:700' : ''}">${a.label}</text>`;
  });
  s += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(target).toFixed(1)}" y2="${Y(target).toFixed(1)}" stroke="var(--acc)" stroke-dasharray="5 4" stroke-width="1.5"/>`;
  return s + '</svg>';
}
function bmiGauge(b) {
  const seg = [[15, 18.5, '#60a5fa'], [18.5, 25, '#22c55e'], [25, 30, '#f59e0b'], [30, 35, '#f97316'], [35, 40, '#ef4444']];
  const pos = Math.max(0, Math.min(100, (b - 15) / 25 * 100));
  return `<div class="gauge-wrap"><div class="gauge">${seg.map(s => `<div style="width:${(s[1] - s[0]) / 25 * 100}%;background:${s[2]}"></div>`).join('')}</div>
    ${b ? `<div class="gauge-mk" style="left:${pos}%"></div>` : ''}</div>
    <div class="gauge-lb"><span>15</span><span>18,5</span><span>25</span><span>30</span><span>35</span><span>40</span></div>`;
}

/* ---------- Texto de fechas ---------- */
function dayLabel(k) {
  const t = todayKey();
  if (k === t) return 'Hoy';
  if (k === addDays(t, -1)) return 'Ayer';
  if (k === addDays(t, 1)) return 'Mañana';
  return parseKey(k).toLocaleDateString('es-ES', { weekday: 'long' });
}
const fmtLong = k => parseKey(k).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = k => parseKey(k).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' });

/* ---------- Render principal ---------- */
function render() {
  const nav = $('#nav');
  if (!S.profile) {
    nav.classList.add('hidden-nav');
    $('#topRight').innerHTML = '';
    $('#main').innerHTML = `<div class="welcome"><img src="icons/icon-192.png" alt=""><h1>Bienvenido a NutriPlato</h1>
      <p class="muted">Escanea productos, apunta tus comidas y controla calorías, macros, peso e IMC. Empieza creando tu perfil.</p></div>${profileFormHTML(true)}`;
    mountProfileForm(true);
    return;
  }
  nav.classList.remove('hidden-nav');
  $$('#nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  const bmi = bmiOf(currentWeight()), cat = bmiCat(bmi);
  $('#topRight').innerHTML = bmi ? `<button class="chip" data-a="goto" data-t="progreso"><span class="dot" style="background:${cat.color}"></span>IMC ${fmt1(bmi)}</button>` : '';
  const V = { hoy: viewHoy, alimentos: viewAlimentos, progreso: viewProgreso, perfil: viewPerfil }[UI.tab] || viewHoy;
  $('#main').innerHTML = V();
  if (UI.tab === 'perfil') mountProfileForm(false);
  if (UI.tab === 'alimentos') mountAlimentos();
}

/* ---------- Vista HOY ---------- */
function macroBar(label, v, t, st, unit = 'g', cls = '') {
  const pct = Math.min(100, t ? v / t * 100 : 0);
  return `<div class="bar"><div class="bl"><span class="${cls}"><b>${label}</b></span><span><b class="${st}-tx">${r0(v)}</b> / ${t} ${unit}</span></div>
    <div class="track"><div class="fill" style="width:${pct}%;background:${ST_COLOR[st]}"></div></div></div>`;
}
function miniBox(label, v, t, st, dec = false) {
  return `<div><div class="v"><span class="tag" style="background:${ST_COLOR[st]}"></span>${dec ? fmt1(v) : r0(v)}</div><div class="l">${label} · ${dec ? 'máx' : label === 'Fibra' ? 'mín' : 'máx'} ${t}</div></div>`;
}
function itemLine(it) {
  const t = calcItem(it);
  const stTxt = it.quick ? 'cantidad libre' : `${r0(it.g)} g${it.cf && it.cf !== 1 ? ' · ' + it.st : ''}`;
  return `<div class="macro-line"><b class="mp">P ${r0(t.p)}</b> · <b class="mc">H ${r0(t.c)}</b> · <b class="mf">G ${r0(t.f)}</b> · ${stTxt}</div>`;
}
function viewHoy() {
  const k = UI.date, day = getDay(k), T = targets(), tot = dayTotals(day);
  const isToday = k === todayKey();
  let h = `<div class="datenav"><button class="icon-btn" data-a="day-prev" aria-label="Día anterior">‹</button>
    <div class="center" data-a="day-today"><div class="d">${dayLabel(k)}</div><div class="small muted">${fmtLong(k)}</div></div>
    <button class="icon-btn" data-a="day-next" aria-label="Día siguiente">›</button></div>`;

  const due = weighDue();
  if (due && isToday) h += `<div class="banner"><span style="font-size:26px">⚖️</span><div class="grow"><b>Toca pesarse</b><div class="small muted">${due}</div></div><button class="btn sm pri" data-a="add-weight">Registrar</button></div>`;

  const kst = stTarget(tot.kcal, T.kcal);
  const remain = T.kcal - tot.kcal;
  h += `<section class="card"><div class="summary">
    ${svgRing(tot.kcal / T.kcal, ST_COLOR[kst === 'low' ? 'ok' : kst], `<div class="big">${r0(tot.kcal)}</div><div class="tiny muted">de ${T.kcal} kcal</div><div class="tiny ${remain >= 0 ? 'ok-tx' : 'bad-tx'}" style="font-weight:700;margin-top:2px">${remain >= 0 ? 'Quedan ' + r0(remain) : '+' + r0(-remain) + ' de más'}</div>`)}
    <div>
      ${macroBar('Proteínas', tot.p, T.p, stProt(tot.p, T.p), 'g', 'mp')}
      ${macroBar('Hidratos', tot.c, T.c, stTarget(tot.c, T.c), 'g', 'mc')}
      ${macroBar('Grasas', tot.f, T.f, stTarget(tot.f, T.f), 'g', 'mf')}
    </div></div>
    <div class="mini">
      ${miniBox('Azúcar', tot.s, T.s, stLimit(tot.s, T.s))}
      ${miniBox('Saturadas', tot.sf, T.sf, stLimit(tot.sf, T.sf))}
      ${miniBox('Fibra', tot.fi, T.fi, stMin(tot.fi, T.fi))}
      ${miniBox('Sal', tot.na, T.na, stLimit(tot.na, T.na), true)}
    </div></section>`;

  h += `<section class="card"><div class="card-h"><h3>Cómo vas hoy</h3></div><div class="alerts">${dayAlerts(tot, T, k).map(a => `<div class="alert ${a.l}"><span class="ai">${a.i}</span><span>${a.t}</span></div>`).join('')}</div></section>`;

  for (const m of MEALS) {
    const meal = day.meals?.[m.id], mt = mealTotals(meal), dishes = meal?.dishes || [];
    h += `<section class="card meal"><div class="meal-h"><span class="mi">${m.ico}</span><span class="mn">${m.name}</span><span class="mk">${r0(mt.kcal)} kcal</span>
      <button class="icon-btn" data-a="meal-menu" data-m="${m.id}" aria-label="Opciones">⋯</button></div><div class="meal-b">`;
    for (const d of dishes) {
      const dt = dishTotals(d);
      h += `<div class="dish"><div class="dish-h"><span>${esc(d.name)}</span><span class="dk">${r0(dt.kcal)} kcal</span>
        <button class="icon-btn" style="width:30px;height:30px" data-a="dish-menu" data-m="${m.id}" data-d="${d.id}" aria-label="Opciones del plato">⋯</button></div>`;
      for (const it of d.items) {
        h += `<div class="item" data-a="edit-item" data-m="${m.id}" data-d="${d.id}" data-i="${it.id}"><div class="in2"><div class="nm">${esc(it.name)}</div>${itemLine(it)}</div><div class="kc">${r0(calcItem(it).kcal)}</div></div>`;
      }
      h += `<button class="add-line" data-a="add-food" data-m="${m.id}" data-d="${d.id}">＋ Añadir alimento</button></div>`;
    }
    h += `<button class="add-line" data-a="add-dish" data-m="${m.id}">＋ Añadir plato${dishes.length ? '' : ' a ' + m.name.toLowerCase()}</button></div></section>`;
  }

  const water = day.water || 0;
  h += `<section class="card"><div class="card-h"><h3>💧 Agua</h3><span class="muted small">${(water * 0.25).toLocaleString('es-ES')} L de 2 L</span></div>
    <div class="water"><button class="btn sm" data-a="water" data-v="-1">−</button><div class="glasses">${Array.from({ length: Math.max(8, water) }, (_, i) => `<span class="${i < water ? 'on' : ''}">🥛</span>`).join('')}</div><button class="btn sm pri" data-a="water" data-v="1">＋</button></div></section>`;
  return h;
}

/* ---------- Vista ALIMENTOS ---------- */
function foodRow(f, attr) {
  const sc = scoreOf(f);
  return `<div class="fi" ${attr} data-id="${esc(f.id)}"><div class="th">${f.img ? `<img src="${esc(f.img)}" loading="lazy" alt="">` : (CAT_EMOJI[f.cat] || '🥫')}</div>
    <div class="in2"><div class="nm">${esc(f.name)}</div><div class="sub"><span class="tag" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sc.color};margin-right:4px"></span>${f.src === 'base' ? '<span class="badge b-base">Genérico</span>' : '<span class="badge b-mine">Mío</span>'} ${esc(f.brand || f.cat || '')}</div></div>
    <div class="kc">${r0(f.n.kcal)} kcal<small>por 100 g</small></div></div>`;
}
function viewAlimentos() {
  const mine = Object.keys(S.products).length;
  return `<h2 style="margin-top:8px">Alimentos</h2><p class="muted small">${mine} productos tuyos + ${BASE.length} genéricos para apuntar lo que no tengas escaneado.</p>
    <div class="btn-row mt"><button class="btn pri" data-a="scan-main">📷 Escanear</button><button class="btn" data-a="new-food">✍️ Crear</button><button class="btn" data-a="online-search">🌐 Internet</button></div>
    <div class="searchbox mt"><span class="si">🔍</span><input class="in" id="foodQ" type="search" placeholder="Buscar: macarrones, tomate frito, salchicha…" value="${esc(UI.foodQ)}" autocomplete="off"></div>
    <div class="chips mt" id="foodFilter">${[['todos', 'Todos'], ['mios', 'Mis productos'], ['base', 'Genéricos']].map(([v, l]) => `<button data-v="${v}" class="${UI.foodFilter === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    <section class="card flist" id="foodList"></section>`;
}
function mountAlimentos() {
  const draw = () => {
    const res = searchFoods(UI.foodQ, UI.foodFilter).slice(0, 80);
    $('#foodList').innerHTML = res.length ? res.map(f => foodRow(f, 'data-a="open-food"')).join('')
      : `<div class="empty">No hay resultados para «${esc(UI.foodQ)}».<br><br><button class="btn sm" data-a="online-search">🌐 Buscar en internet</button> <button class="btn sm" data-a="new-food">✍️ Crearlo</button></div>`;
  };
  $('#foodQ').addEventListener('input', e => { UI.foodQ = e.target.value; draw(); });
  $('#foodFilter').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; UI.foodFilter = b.dataset.v; $$('#foodFilter button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  draw();
}

/* ---------- Vista PROGRESO ---------- */
function viewProgreso() {
  const p = S.profile, w = sortedWeights(), kg = currentWeight(), bmi = bmiOf(kg), cat = bmiCat(bmi);
  const h2 = (num(p.altura) / 100) ** 2;
  const v = verdict();
  let h = `<h2 style="margin-top:8px">Progreso</h2>`;

  h += `<section class="card ${v.lvl !== 'info' ? 'v-' + v.lvl : ''}"><div class="verdict"><span class="ve">${v.e}</span><div><h3>${v.title}</h3><div class="small muted">Objetivo: ${{ perder: 'perder peso', mantener: 'mantener', ganar: 'ganar peso' }[p.objetivo] || 'mantener'}${num(p.pesoObjetivo) ? ' · ' + fmt1(p.pesoObjetivo) + ' kg' : ''}</div></div></div>
    <ul class="reasons">${v.reasons.map(r => `<li>${r}</li>`).join('')}</ul></section>`;

  h += `<section class="card"><div class="card-h"><h3>Índice de masa corporal (IMC)</h3></div>
    <div class="bmi-big"><span class="v" style="color:${cat.color}">${bmi ? fmt1(bmi) : '—'}</span><b style="color:${cat.color}">${cat.name}</b></div>
    ${bmiGauge(bmi)}
    <div class="kv mt"><div><div class="l">Peso actual</div><div class="v">${kg ? fmt1(kg) + ' kg' : '—'}</div></div>
    <div><div class="l">Peso saludable para tu altura</div><div class="v">${h2 ? r0(18.5 * h2) + '–' + r0(24.9 * h2) + ' kg' : '—'}</div></div>
    ${w.length >= 2 ? `<div><div class="l">Cambio total</div><div class="v">${(w[w.length - 1].kg - w[0].kg) > 0 ? '+' : ''}${fmt1(w[w.length - 1].kg - w[0].kg)} kg</div></div>` : ''}
    ${num(p.pesoObjetivo) ? `<div><div class="l">Te faltan para el objetivo</div><div class="v">${fmt1(Math.abs(kg - num(p.pesoObjetivo)))} kg</div></div>` : ''}</div>
    <button class="btn pri block mt" data-a="add-weight">⚖️ Registrar peso</button></section>`;

  const now = Date.now();
  const inRange = w.filter(x => !UI.range || now - parseKey(x.d) <= UI.range * DAY);
  const ranges = [[30, '1 mes'], [90, '3 meses'], [180, '6 meses'], [365, '1 año'], [0, 'Todo']];
  h += `<section class="card"><div class="card-h"><h3>Evolución del peso</h3></div>
    <div class="chips">${ranges.map(([d, l]) => `<button data-a="range" data-v="${d}" class="${UI.range === d ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${svgLine(inRange.map(x => ({ x: +parseKey(x.d), y: x.kg })), { target: num(p.pesoObjetivo) || null, targetLabel: 'Objetivo' })}
    <div class="card-h mt"><h3>Evolución del IMC</h3></div>
    ${svgLine(inRange.map(x => { const b = bmiOf(x.kg); return { x: +parseKey(x.d), y: b, color: bmiCat(b).color }; }), {
      minPad: 0.5, color: 'var(--tx2)',
      bands: [{ from: 0, to: 18.5, color: '#60a5fa' }, { from: 18.5, to: 25, color: '#22c55e' }, { from: 25, to: 30, color: '#f59e0b' }, { from: 30, to: 60, color: '#ef4444' }],
    })}
    <div class="small muted">Zona verde = peso normal · amarilla = sobrepeso · roja = obesidad.</div></section>`;

  const T = targets(), bars = [];
  let sum = zero(), n = 0;
  for (let i = 6; i >= 0; i--) {
    const k = addDays(UI.date === todayKey() ? todayKey() : todayKey(), -i), t = dayTotals(S.days[k]);
    const st = t.kcal ? stTarget(t.kcal, T.kcal) : 'low';
    bars.push({ label: parseKey(k).toLocaleDateString('es-ES', { weekday: 'short' }).slice(0, 2), v: t.kcal, color: ST_COLOR[st === 'low' ? 'low' : st], today: i === 0 });
    if (t.kcal > 300) { addTo(sum, t); n++; }
  }
  h += `<section class="card"><div class="card-h"><h3>Calorías últimos 7 días</h3><span class="small muted">objetivo ${T.kcal}</span></div>${svgBars(bars, T.kcal)}
    ${n ? `<div class="kv mt"><div><div class="l">Media kcal/día</div><div class="v">${r0(sum.kcal / n)}</div></div><div><div class="l">Media proteína/día</div><div class="v">${r0(sum.p / n)} g <span class="small muted">/ ${T.p}</span></div></div>
    <div><div class="l">Media hidratos/día</div><div class="v">${r0(sum.c / n)} g</div></div><div><div class="l">Media grasas/día</div><div class="v">${r0(sum.f / n)} g</div></div></div>` : '<div class="small muted">Cuando apuntes varios días verás aquí tus medias.</div>'}</section>`;

  h += `<section class="card wlist"><div class="card-h"><h3>Historial de pesajes</h3></div>${w.length ? [...w].reverse().map((x, i, arr) => {
    const prev = arr[i + 1], d = prev ? x.kg - prev.kg : 0;
    return `<div class="wi"><div class="grow"><b>${fmt1(x.kg)} kg</b> <span class="small muted">· IMC ${fmt1(bmiOf(x.kg))}</span><div class="small muted">${fmtLong(x.d)}</div></div>
      ${prev ? `<span class="small ${(d < 0) === (p.objetivo !== 'ganar') && d !== 0 ? 'ok-tx' : d === 0 ? 'muted' : 'warn-tx'}" style="font-weight:700">${d > 0 ? '+' : ''}${fmt1(d)}</span>` : ''}
      <button class="icon-btn" data-a="del-weight" data-v="${x.d}" aria-label="Borrar">🗑️</button></div>`;
  }).join('') : '<div class="empty">Sin pesajes todavía</div>'}</section>`;
  return h;
}

/* ---------- Vista PERFIL ---------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (UI.tab === 'perfil') render(); });
function profileFormHTML(first) {
  const p = S.profile || {};
  const opt = (arr, val) => arr.map(([v, l]) => `<option value="${v}" ${String(val) === String(v) ? 'selected' : ''}>${l}</option>`).join('');
  return `<form class="card" id="pf" autocomplete="off">
    <h3>${first ? 'Tu perfil' : 'Datos personales'}</h3>
    <div class="grid2"><label class="f"><span>Nombre</span><input class="in" name="nombre" value="${esc(p.nombre)}" required></label>
    <label class="f"><span>Apellidos</span><input class="in" name="apellidos" value="${esc(p.apellidos)}"></label></div>
    <div class="grid2"><label class="f"><span>Fecha de nacimiento</span><input class="in" type="date" name="nacimiento" value="${esc(p.nacimiento)}" required></label>
    <label class="f"><span>Sexo</span><select class="in" name="sexo">${opt([['h', 'Hombre'], ['m', 'Mujer']], p.sexo || 'h')}</select></label></div>
    <div class="grid2"><label class="f"><span>Altura (cm)</span><input class="in" name="altura" inputmode="decimal" value="${esc(p.altura)}" placeholder="175" required></label>
    <label class="f"><span>Peso ${first ? 'actual' : 'de hoy'} (kg)</span><input class="in" name="peso" inputmode="decimal" value="${first ? esc(p.peso) : ''}" placeholder="${first ? '80' : fmt1(currentWeight()) + ' (vacío = no cambia)'}" ${first ? 'required' : ''}></label></div>
    <label class="f"><span>Actividad física</span><select class="in" name="actividad">${opt(ACT, p.actividad || 1.375)}</select></label>
    <div class="grid2"><label class="f"><span>Objetivo</span><select class="in" name="objetivo">${opt([['perder', 'Perder peso'], ['mantener', 'Mantener'], ['ganar', 'Ganar peso / músculo']], p.objetivo || 'perder')}</select></label>
    <label class="f"><span>Ritmo semanal</span><select class="in" name="ritmo">${opt([[0.25, '0,25 kg/semana (suave)'], [0.5, '0,5 kg/semana (recomendado)'], [0.75, '0,75 kg/semana (rápido)']], p.ritmo || 0.5)}</select></label></div>
    <label class="f"><span>Peso objetivo (kg, opcional)</span><input class="in" name="pesoObjetivo" inputmode="decimal" value="${esc(p.pesoObjetivo)}" placeholder="75"></label>
    ${first ? '' : `<details class="mt"><summary class="muted small" style="font-weight:600">Ajustes avanzados de objetivos</summary>
      <div class="grid2"><label class="f"><span>Calorías fijas (vacío = automático)</span><input class="in" name="kcalManual" inputmode="numeric" value="${esc(p.kcalManual)}" placeholder="auto"></label>
      <label class="f"><span>Proteína (g por kg)</span><input class="in" name="protKg" inputmode="decimal" value="${esc(p.protKg)}" placeholder="auto"></label></div></details>`}
    <button class="btn pri block mt2" type="submit">${first ? 'Empezar' : 'Guardar cambios'}</button>
  </form>`;
}
function mountProfileForm(first) {
  const f = $('#pf'); if (!f) return;
  f.addEventListener('submit', e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const altura = num(d.altura), peso = num(d.peso);
    if (altura < 100 || altura > 250) return toast('Revisa la altura (en cm, por ejemplo 175)');
    if (first && (peso < 30 || peso > 300)) return toast('Revisa el peso (en kg, por ejemplo 80)');
    if (!first && d.peso && (peso < 30 || peso > 300)) return toast('Revisa el peso');
    const prev = S.profile || {};
    S.profile = { ...prev, ...d, altura, actividad: num(d.actividad), ritmo: num(d.ritmo), pesoObjetivo: num(d.pesoObjetivo) || '', kcalManual: num(d.kcalManual) || '', protKg: num(d.protKg) || '' };
    if (first) S.profile.peso = peso; else delete S.profile.peso;
    if (peso) upsertWeight(todayKey(), peso);
    save();
    toast(first ? '¡Perfil creado!' : 'Perfil guardado');
    UI.tab = 'hoy';
    render();
    window.scrollTo(0, 0);
  });
}
function viewPerfil() {
  const p = S.profile, T = targets(), age = ageOf(p.nacimiento);
  const standalone = matchMedia('(display-mode: standalone)').matches;
  return `<h2 style="margin-top:8px">${esc(p.nombre)} ${esc(p.apellidos || '')}</h2><p class="muted small">${age != null ? age + ' años · ' : ''}${esc(p.altura)} cm · ${fmt1(currentWeight())} kg</p>
    <section class="card"><div class="card-h"><h3>Tus objetivos diarios</h3>${num(p.kcalManual) ? '<span class="badge b-mine">manual</span>' : '<span class="badge b-base">automático</span>'}</div>
    <div class="kv"><div><div class="l">Calorías</div><div class="v">${T.kcal} kcal</div></div><div><div class="l">Proteínas</div><div class="v mp">${T.p} g</div></div>
    <div><div class="l">Hidratos</div><div class="v mc">${T.c} g</div></div><div><div class="l">Grasas</div><div class="v mf">${T.f} g</div></div>
    <div><div class="l">Azúcar (máx.)</div><div class="v">${T.s} g</div></div><div><div class="l">Fibra (mín.)</div><div class="v">${T.fi} g</div></div></div>
    <p class="small muted mt">Metabolismo basal ${T.bmr} kcal · gasto diario estimado ${T.tdee} kcal (fórmula Mifflin-St Jeor). Se recalcula solo cuando registras un peso nuevo.</p></section>
    ${profileFormHTML(false)}
    <section class="card"><h3>Instalar en el móvil</h3>
      ${standalone ? '<p class="small ok-tx">✅ La app ya está instalada.</p>' : installEvt ? '<button class="btn pri block mt" data-a="install">📲 Instalar NutriPlato</button>' : '<p class="small muted">En Chrome pulsa el menú ⋮ → «Añadir a pantalla de inicio» → «Instalar».</p>'}
    </section>
    <section class="card"><h3>Tus datos</h3><p class="small muted">Todo se guarda solo en este teléfono. Haz una copia de vez en cuando por si cambias de móvil.</p>
      <div class="btn-row mt"><button class="btn" data-a="export">⬇️ Exportar copia</button><button class="btn" data-a="import">⬆️ Importar copia</button></div>
      <button class="btn danger block mt" data-a="wipe">🗑️ Borrar todos los datos</button></section>
    <p class="center tiny muted mt2">NutriPlato 1.0 · Datos de productos: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener" style="color:inherit">Open Food Facts</a> (ODbL) · <a href="privacidad.html" target="_blank" style="color:inherit">Privacidad</a><br>Valores orientativos: no sustituyen el consejo de un profesional.</p>`;
}

function upsertWeight(d, kg) {
  S.weights = S.weights.filter(x => x.d !== d);
  S.weights.push({ d, kg: r1(kg) });
}

/* ---------- Pesaje ---------- */
function openWeight() {
  openSheet(`<label class="f"><span>Fecha</span><input class="in" type="date" id="wD" value="${todayKey()}" max="${todayKey()}"></label>
    <label class="f"><span>Peso (kg)</span><input class="in" id="wK" inputmode="decimal" placeholder="${fmt1(currentWeight())}" style="font-size:24px;font-weight:800;text-align:center"></label>
    <div class="note">Consejo: pésate siempre el mismo día de la semana, por la mañana, en ayunas y tras ir al baño.</div>
    <button class="btn pri block mt2" data-x="ok">Guardar peso</button>`, {
    title: '⚖️ Registrar peso',
    mount: w => setTimeout(() => $('#wK', w).focus(), 250),
    on: {
      ok: (el) => {
        const w = el.closest('.sheet'), kg = num($('#wK', w).value), d = $('#wD', w).value || todayKey();
        if (kg < 30 || kg > 300) return toast('Escribe un peso válido');
        const prev = currentWeight();
        upsertWeight(d, kg); save();
        closeSheet().then(() => {
          render();
          const diff = kg - prev;
          toast(`Guardado · IMC ${fmt1(bmiOf(kg))}${prev && d === todayKey() && diff ? ` · ${diff > 0 ? '+' : ''}${fmt1(diff)} kg` : ''}`);
        });
      },
    },
  });
}

/* ---------- Escáner de códigos de barras ---------- */
function validEAN(code) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return /^\d{6,}$/.test(code);
  const d = code.split('').map(Number), check = d.pop();
  const sum = d.reverse().reduce((a, n, i) => a + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
let zxingLoading = null;
function loadZXing() {
  if (window.ZXing) return Promise.resolve();
  if (!zxingLoading) zxingLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return zxingLoading;
}
function openScanner(onCode) {
  const w = openSheet(`<div class="scan"><video playsinline muted autoplay></video><div class="scan-frame"><div class="scan-line"></div></div>
    <div class="scan-tip">Coloca el código de barras dentro del recuadro</div><div class="scan-err"></div>
    <div class="scan-actions"><button class="btn hidden" data-x="torch">🔦 Linterna</button><button class="btn" data-x="manual">⌨️ Escribir código</button></div></div>`, {
    cls: 'full', title: 'Escanear producto',
    on: {
      manual: async () => {
        stopped = true; cleanup();
        await closeSheet();
        const c = await ask({ title: 'Código de barras', text: 'Escribe los números que aparecen bajo el código.', input: '', placeholder: '8480000123456', ok: 'Buscar' });
        if (c) onCode(c.replace(/\D/g, ''));
      },
      torch: async () => { try { torch = !torch; await track.applyConstraints({ advanced: [{ torch }] }); } catch (e) { toast('Linterna no disponible'); } },
    },
  });
  const video = $('video', w), err = $('.scan-err', w);
  let stream, track, stopped = false, timer, torch = false, reader, last = '', hits = 0;
  const cleanup = () => { stopped = true; clearTimeout(timer); try { reader && reader.reset(); } catch (e) {} stream && stream.getTracks().forEach(t => t.stop()); };
  w._cleanup = cleanup;
  const found = async code => {
    if (stopped) return;
    if (!validEAN(code)) return;
    // Exige dos lecturas iguales seguidas para evitar errores
    if (code !== last) { last = code; hits = 1; return; }
    if (++hits < 2) return;
    stopped = true;
    navigator.vibrate && navigator.vibrate(70);
    cleanup();
    await closeSheet();
    onCode(code);
  };
  (async () => {
    if (!navigator.mediaDevices?.getUserMedia) { err.innerHTML = 'Este navegador no permite usar la cámara aquí.<br>La app debe abrirse desde una dirección <b>https://</b>. Puedes escribir el código a mano.'; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, focusMode: 'continuous' }, audio: false });
    } catch (e) {
      err.innerHTML = 'No se pudo abrir la cámara.<br>Revisa que has dado permiso a la cámara (Ajustes → Aplicaciones → Chrome → Permisos).';
      return;
    }
    if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
    track = stream.getVideoTracks()[0];
    try { if (track.getCapabilities?.().torch) $('[data-x="torch"]', w).classList.remove('hidden'); } catch (e) {}
    video.srcObject = stream;
    try { await video.play(); } catch (e) {}
    let detector = null;
    if ('BarcodeDetector' in window) {
      try {
        const sup = await BarcodeDetector.getSupportedFormats();
        const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter(f => sup.includes(f));
        if (want.length) detector = new BarcodeDetector({ formats: want });
      } catch (e) { detector = null; }
    }
    if (detector) {
      const loop = async () => {
        if (stopped) return;
        try {
          if (video.readyState >= 2) {
            const codes = await detector.detect(video);
            if (codes.length) await found(codes[0].rawValue);
          }
        } catch (e) {}
        if (!stopped) timer = setTimeout(loop, 120);
      };
      loop();
    } else {
      try {
        await loadZXing();
        if (stopped) return;
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E]);
        reader = new ZXing.BrowserMultiFormatReader(hints);
        reader.decodeFromVideoElementContinuously(video, res => { if (res) found(res.getText()); });
      } catch (e) {
        err.innerHTML = 'No se pudo cargar el lector de códigos (¿sin conexión?). Puedes escribir el código a mano.';
      }
    }
  })();
}

/* ---------- Open Food Facts ---------- */
const OFF_FIELDS = 'code,product_name,product_name_es,generic_name_es,brands,nutriments,image_front_small_url,image_front_url,nutriscore_grade,nova_group,serving_quantity,serving_size,quantity';
function offToFood(p, code) {
  const n = p.nutriments || {};
  const g = k => { const v = n[k + '_100g']; return v == null || v === '' ? 0 : num(v); };
  let kcal = g('energy-kcal');
  if (!kcal && g('energy')) kcal = g('energy') / 4.184;
  const name = (p.product_name_es || p.product_name || p.generic_name_es || '').trim() || 'Producto ' + code;
  const brand = String(Array.isArray(p.brands) ? (p.brands[0] || '') : (p.brands || '')).split(',')[0].trim();
  const units = [];
  const sq = num(p.serving_quantity);
  if (sq > 0 && sq < 2000) units.push({ l: 'ración', g: r0(sq) });
  const pq = String(p.quantity || '').match(/^\s*(\d+(?:[.,]\d+)?)\s*(g|gr|ml)\b/i);
  if (pq && num(pq[1]) > 0 && num(pq[1]) <= 3000) units.push({ l: 'paquete', g: r0(num(pq[1])) });
  return {
    id: 'p:' + code, src: 'scan', barcode: code, name, brand,
    img: p.image_front_small_url || p.image_front_url || '',
    n: { kcal: r1(kcal), p: r1(g('proteins')), c: r1(g('carbohydrates')), s: r1(g('sugars')), f: r1(g('fat')), sf: r1(g('saturated-fat')), fi: r1(g('fiber')), na: Math.round(g('salt') * 100) / 100 },
    ns: (p.nutriscore_grade || '').length === 1 ? p.nutriscore_grade : '',
    nova: p.nova_group || '',
    qty: p.quantity || '',
    cf: guessCF(name), units, added: Date.now(),
    incomplete: !kcal,
  };
}
async function fetchOFF(code) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?lc=es&fields=${OFF_FIELDS}`, { signal: ctl.signal });
    if (r.status === 404) return null;
    const j = await r.json();
    if (j.status !== 1 || !j.product) return null;
    return offToFood(j.product, code);
  } finally { clearTimeout(t); }
}
async function searchOFF(q) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=30&langs=es&fields=${OFF_FIELDS}`;
    const r = await fetch(url, { signal: ctl.signal });
    const j = await r.json();
    const seen = new Set();
    return (j.hits || []).filter(p => p.code && p.nutriments).map(p => offToFood(p, p.code))
      .filter(f => f.n.kcal > 0 && !seen.has(f.id) && seen.add(f.id));
  } finally { clearTimeout(t); }
}

/* Flujo tras escanear. ctx = {date, meal, dish} cuando se escanea desde un plato. */
async function handleCode(code, ctx = {}) {
  const local = Object.values(S.products).find(p => p.barcode === code);
  if (local) { toast('Ya lo tenías guardado'); return afterProduct(local, ctx); }
  openSheet(`<div class="spinner"></div><p class="center muted">Buscando el código ${esc(code)}…</p>`, { title: 'Buscando producto' });
  let p = null, offline = false;
  try { p = await fetchOFF(code); } catch (e) { offline = true; }
  await closeSheet();
  if (p) {
    S.products[p.id] = p; save();
    toast('✅ Guardado en tus alimentos');
    if (p.incomplete) { toast('Faltan datos: complétalos con la etiqueta'); return openProductForm(p, f => afterProduct(f, ctx)); }
    return afterProduct(p, ctx);
  }
  openSheet(`<p style="font-size:40px;text-align:center;margin:6px 0">🤷</p>
    <p class="center"><b>${offline ? 'No hay conexión' : 'Este producto no está en la base de datos'}</b></p>
    <p class="center muted small">Código ${esc(code)}. Puedes crearlo tú copiando los valores de la etiqueta (por 100 g) y la próxima vez lo reconocerá al instante.</p>
    <button class="btn pri block mt" data-x="create">✍️ Crear producto con este código</button>
    <button class="btn block mt" data-x="again">📷 Escanear otro</button>`, {
    title: 'Producto no encontrado',
    on: {
      create: () => closeSheet().then(() => openProductForm({ barcode: code }, f => afterProduct(f, ctx))),
      again: () => closeSheet().then(() => openScanner(c => handleCode(c, ctx))),
    },
  });
}
function afterProduct(f, ctx = {}) {
  if (ctx.meal) openAmount({ food: f, ...ctx });
  else openProduct(f);
}

/* ---------- Ficha de producto ---------- */
function nutTable(f) {
  const u = (f.units || [])[0];
  const row = (k, sub) => {
    const v = f.n[k] || 0;
    const per = u ? v * u.g / 100 : null;
    const f1 = k === 'kcal' ? r0 : k === 'na' ? (x => (Math.round(x * 100) / 100).toLocaleString('es-ES')) : fmt1;
    return `<tr><td class="${sub ? 'sub' : ''}">${sub ? '· de las cuales ' : ''}${NL[k]}</td><td>${f1(v)} ${k === 'kcal' ? 'kcal' : 'g'}</td>${u ? `<td>${f1(per)} ${k === 'kcal' ? 'kcal' : 'g'}</td>` : ''}</tr>`;
  };
  return `<table class="nt"><tr><th></th><th>Por 100 g</th>${u ? `<th>Por ${esc(u.l)} (${u.g} g)</th>` : ''}</tr>
    ${row('kcal')}${row('f')}${row('sf', 1)}${row('c')}${row('s', 1)}${row('fi')}${row('p')}${row('na')}</table>`;
}
function openProduct(f) {
  const sc = scoreOf(f), mine = f.src !== 'base';
  const cfTxt = f.cf && f.cf !== 1 ? `<div class="note">🍳 Valores en <b>crudo</b>. Al cocinarlo su peso ${f.cf > 1 ? 'aumenta' : 'disminuye'} ×${String(f.cf).replace('.', ',')} (100 g en crudo ≈ ${r0(100 * f.cf)} g cocinado). Al añadirlo podrás indicar si pesaste en crudo o cocinado.</div>` : '';
  openSheet(`<div class="prod-head"><div class="pimg">${f.img ? `<img src="${esc(f.img)}" alt="">` : (CAT_EMOJI[f.cat] || '🥫')}</div>
    <div class="grow"><h3 style="font-size:17px">${esc(f.name)}</h3><div class="muted small">${esc(f.brand || f.cat || '')}${f.qty ? ' · ' + esc(f.qty) : ''}</div>
    ${f.barcode ? `<div class="tiny muted">EAN ${esc(f.barcode)}</div>` : ''}</div></div>
    <div class="score"><div class="sc ${sc.cls}">${sc.s}</div><div class="grow"><b>${sc.label}</b><div class="small muted">${f.ns ? `Nutri-Score <span class="ns ns-${esc(f.ns)}">${esc(f.ns.toUpperCase())}</span>` : 'Valoración calculada con sus nutrientes'}${f.nova ? ` · NOVA ${esc(f.nova)}` : ''}</div></div></div>
    ${nutTable(f)}${cfTxt}
    <button class="btn pri block mt2" data-x="add">🍽️ Añadir a una comida</button>
    <div class="btn-row mt">${mine ? '<button class="btn" data-x="edit">✏️ Editar</button><button class="btn danger" data-x="del">🗑️ Eliminar</button>' : '<button class="btn" data-x="copy">📋 Copiar a mis productos para editarlo</button>'}</div>
    ${f.src === 'scan' || f.src === 'off' ? '<p class="tiny muted mt">Datos de Open Food Facts. Si algún valor no coincide con la etiqueta, edítalo.</p>' : ''}`, {
    title: mine ? 'Tu producto' : 'Alimento genérico',
    on: {
      add: () => closeSheet().then(() => openAmount({ food: f })),
      edit: () => closeSheet().then(() => openProductForm(f, nf => openProduct(nf))),
      copy: () => closeSheet().then(() => openProductForm({ ...f, id: null, src: 'manual', name: f.name }, nf => openProduct(nf))),
      del: async () => {
        const ok = await ask({ title: 'Eliminar producto', text: `¿Eliminar «${esc(f.name)}» de tus alimentos? Las comidas ya apuntadas no cambian.`, ok: 'Eliminar', danger: true });
        if (!ok) return;
        delete S.products[f.id]; save(); await closeAll(); render(); toast('Producto eliminado');
      },
    },
  });
}

/* ---------- Crear / editar producto ---------- */
function openProductForm(f = {}, after) {
  const n = f.n || {};
  const isEdit = !!(f.id && S.products[f.id]);
  const cf = f.cf || guessCF(f.name || '');
  const presetHas = CF_PRESETS.some(p => p[0] === cf);
  const u = (f.units || [])[0] || {};
  const field = (k, label, ph = '0') => `<label class="f"><span>${label}</span><input class="in" name="${k}" inputmode="decimal" value="${n[k] != null && n[k] !== '' && (n[k] || isEdit || f.n) ? esc(String(n[k]).replace('.', ',')) : ''}" placeholder="${ph}"></label>`;
  openSheet(`<form id="prodF">
    <label class="f"><span>Nombre *</span><input class="in" name="name" value="${esc(f.name)}" placeholder="Macarrones Hacendado" required></label>
    <div class="grid2"><label class="f"><span>Marca</span><input class="in" name="brand" value="${esc(f.brand)}" placeholder="Hacendado"></label>
    <label class="f"><span>Código de barras</span><input class="in" name="barcode" inputmode="numeric" value="${esc(f.barcode)}" placeholder="opcional"></label></div>
    <button type="button" class="link-btn mt" data-x="guess">🪄 Rellenar con valores típicos según el nombre</button>
    <div id="guessBox"></div>
    <p class="sec-title" style="margin-top:14px">Información nutricional por 100 g</p>
    <div class="grid2">${field('kcal', 'Calorías (kcal) *', '350')}${field('p', 'Proteínas (g)')}</div>
    <div class="grid2">${field('c', 'Hidratos (g)')}${field('s', '· de ellos azúcares (g)')}</div>
    <div class="grid2">${field('f', 'Grasas (g)')}${field('sf', '· de ellas saturadas (g)')}</div>
    <div class="grid2">${field('fi', 'Fibra (g)')}${field('na', 'Sal (g)')}</div>
    <label class="f"><span>¿Cambia su peso al cocinarlo? (valores de la etiqueta en crudo)</span><select class="in" name="cf">
      ${CF_PRESETS.map(([v, l]) => `<option value="${v}" ${v === cf ? 'selected' : ''}>${l}</option>`).join('')}${presetHas ? '' : `<option value="${cf}" selected>Personalizado ×${cf}</option>`}</select></label>
    <div class="grid2"><label class="f"><span>Unidad rápida (opcional)</span><input class="in" name="ul" value="${esc(u.l || '')}" placeholder="unidad, ración, lata…"></label>
    <label class="f"><span>Gramos de esa unidad</span><input class="in" name="ug" inputmode="decimal" value="${esc(u.g || '')}" placeholder="125"></label></div>
    <button class="btn pri block mt2" type="submit">${isEdit ? 'Guardar cambios' : 'Guardar producto'}</button>
  </form>`, {
    title: isEdit ? 'Editar producto' : 'Nuevo producto',
    on: {
      guess: el => {
        const form = el.closest('form'), q = form.name.value;
        const list = fuzzyBase(q);
        $('#guessBox').innerHTML = list.length ? `<div class="note">Toca el más parecido para copiar sus valores:<div class="flist">${list.map(b => foodRow(b, 'data-x="useguess"')).join('')}</div></div>` : '<div class="note">Escribe primero un nombre (por ejemplo «salchichas»).</div>';
      },
      useguess: el => {
        const b = BASE_MAP[el.dataset.id], form = el.closest('form');
        for (const k of NK) form[k].value = String(b.n[k]).replace('.', ',');
        form.cf.value = String(b.cf);
        if (b.units[0] && !form.ul.value) { form.ul.value = b.units[0].l; form.ug.value = b.units[0].g; }
        $('#guessBox').innerHTML = `<div class="note">✅ Copiados los valores de «${esc(b.name)}». Corrígelos si tienes la etiqueta.</div>`;
      },
    },
    mount: w => {
      $('#prodF', w).addEventListener('submit', e => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        if (!d.name.trim()) return toast('Pon un nombre');
        if (!(num(d.kcal) > 0) && num(d.kcal) !== 0) return toast('Indica las calorías');
        if (d.kcal === '') return toast('Indica las calorías por 100 g');
        const code = (d.barcode || '').replace(/\D/g, '');
        let id = f.id && S.products[f.id] ? f.id : (code ? 'p:' + code : 'm:' + uid());
        if (id !== f.id && S.products[id] && !confirm('Ya existe un producto con ese código. ¿Sustituirlo?')) return;
        const prod = {
          ...(S.products[f.id] || {}), id, src: (S.products[f.id]?.src) || (code ? 'scan' : 'manual'),
          name: d.name.trim(), brand: d.brand.trim(), barcode: code, cat: f.cat || '',
          n: Object.fromEntries(NK.map(k => [k, num(d[k])])),
          cf: num(d.cf) || 1,
          units: d.ul && num(d.ug) > 0 ? [{ l: d.ul.trim(), g: num(d.ug) }, ...(f.units || []).slice(1)] : (f.units || []).filter((_, i) => i > 0),
          img: f.img || '', ns: f.ns || '', nova: f.nova || '', qty: f.qty || '', added: f.added || Date.now(), incomplete: false,
        };
        S.products[id] = prod; save();
        toast(isEdit ? 'Cambios guardados' : '✅ Producto guardado');
        closeSheet().then(() => { render(); after ? after(prod) : openProduct(prod); });
      });
    },
  });
}

/* ---------- Selector de alimentos para un plato ---------- */
function openPicker(ctx) {
  const dish = findDish(ctx.date, ctx.meal, ctx.dish);
  openSheet(`<div class="searchbox"><span class="si">🔍</span><input class="in" id="pkQ" type="search" placeholder="Busca: macarrones, tomate frito, salchicha…" autocomplete="off"></div>
    <div class="btn-row mt"><button class="btn sm pri" data-x="scan">📷 Escanear</button><button class="btn sm" data-x="create">✍️ Crear</button><button class="btn sm" data-x="online">🌐 Internet</button><button class="btn sm" data-x="quick">⚡ Rápido</button></div>
    <div id="pkList" class="flist"></div>`, {
    title: `Añadir a ${esc(dish?.name || 'plato')}`,
    mount: w => {
      const inp = $('#pkQ', w), list = $('#pkList', w);
      const draw = () => {
        const q = inp.value.trim(), res = searchFoods(q).slice(0, 50);
        let h = '';
        if (!q) h += `<p class="sec-title" style="margin-top:12px">${Object.keys(S.products).length ? 'Tus alimentos y los más usados' : 'Alimentos genéricos'}</p>`;
        h += res.map(f => foodRow(f, 'data-x="pick"')).join('');
        if (q && !res.length) {
          const fz = fuzzyBase(q);
          h += `<div class="note">No tienes «${esc(q)}» registrado. ${fz.length ? 'Estos genéricos se parecen y te dan las calorías aproximadas:' : ''}</div>${fz.map(f => foodRow(f, 'data-x="pick"')).join('')}
            <div class="btn-row mt"><button class="btn sm" data-x="online">🌐 Buscar «${esc(q)}» en internet</button><button class="btn sm" data-x="create">✍️ Crearlo</button></div>`;
        }
        list.innerHTML = h;
      };
      inp.addEventListener('input', draw);
      draw();
    },
    on: {
      pick: el => openAmount({ food: getFood(el.dataset.id), ...ctx }),
      scan: () => openScanner(code => handleCode(code, ctx)),
      create: el => openProductForm({ name: $('#pkQ', el.closest('.sheet')).value.trim() }, f => openAmount({ food: f, ...ctx })),
      online: el => openOnline($('#pkQ', el.closest('.sheet')).value.trim(), ctx),
      quick: () => openQuick(ctx),
    },
  });
}

/* Búsqueda en Open Food Facts por nombre */
function openOnline(q = '', ctx = {}) {
  openSheet(`<form id="onF" class="row"><input class="in grow" name="q" value="${esc(q)}" placeholder="Ej: tomate frito hacendado" type="search"><button class="btn pri" type="submit">Buscar</button></form>
    <p class="tiny muted mt">Busca en Open Food Facts productos vendidos en España. Al tocar uno se guarda en tus alimentos.</p><div id="onRes" class="flist"></div>`, {
    title: '🌐 Buscar en internet',
    mount: w => {
      const f = $('#onF', w), box = $('#onRes', w);
      let found = [];
      const go = async () => {
        const qq = f.q.value.trim(); if (!qq) return;
        box.innerHTML = '<div class="spinner"></div>';
        try {
          found = await searchOFF(qq);
          w._found = found;
          box.innerHTML = found.length ? found.map(p => foodRow(p, 'data-x="pick"')).join('') : '<div class="empty">Sin resultados. Prueba con otras palabras o escanea el código.</div>';
        } catch (e) { box.innerHTML = '<div class="empty">No se pudo conectar. Revisa tu conexión a internet.</div>'; }
      };
      f.addEventListener('submit', e => { e.preventDefault(); go(); });
      if (q) go(); else setTimeout(() => f.q.focus(), 250);
    },
    on: {
      pick: el => {
        const w = el.closest('.sheet-wrap'), p = (w._found || []).find(x => x.id === el.dataset.id);
        if (!p) return;
        S.products[p.id] = S.products[p.id] || p; save();
        toast('✅ Guardado en tus alimentos');
        afterProduct(S.products[p.id], ctx);
      },
    },
  });
}

/* Apunte rápido: solo calorías (cuando no sabes el producto exacto) */
function openQuick(ctx) {
  openSheet(`<label class="f"><span>¿Qué has comido?</span><input class="in" id="qN" placeholder="Tapa de la boda, menú del día…"></label>
    <div class="grid2"><label class="f"><span>Calorías totales *</span><input class="in" id="qK" inputmode="numeric" placeholder="400"></label>
    <label class="f"><span>Proteínas (g)</span><input class="in" id="qP" inputmode="decimal" placeholder="opcional"></label></div>
    <div class="grid2"><label class="f"><span>Hidratos (g)</span><input class="in" id="qC" inputmode="decimal" placeholder="opcional"></label>
    <label class="f"><span>Grasas (g)</span><input class="in" id="qF" inputmode="decimal" placeholder="opcional"></label></div>
    <button class="btn pri block mt2" data-x="ok">Añadir</button>`, {
    title: '⚡ Apunte rápido',
    on: {
      ok: el => {
        const w = el.closest('.sheet'), k = num($('#qK', w).value);
        if (!(k > 0)) return toast('Indica las calorías');
        const dish = findDish(ctx.date, ctx.meal, ctx.dish);
        if (!dish) return;
        dish.items.push({ id: uid(), fid: 'quick', quick: true, name: $('#qN', w).value.trim() || 'Apunte rápido', n: { kcal: k, p: num($('#qP', w).value), c: num($('#qC', w).value), f: num($('#qF', w).value), s: 0, sf: 0, fi: 0, na: 0 }, cf: 1, g: 100, st: 'crudo' });
        save(); closeAll().then(() => { render(); toast('Añadido'); });
      },
    },
  });
}

/* ---------- Cantidad (gramos, crudo/cocinado) ---------- */
function defaultMeal() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  return h < 11 ? 'desayuno' : h < 13 ? 'mediamanana' : h < 16.5 ? 'comida' : h < 19.5 ? 'merienda' : 'cena';
}
function openAmount({ food, date, meal, dish, item }) {
  if (!food) return;
  date = date || UI.date;
  const chooseTarget = !meal;
  let selMeal = meal || defaultMeal(), selDish = dish || null;
  let st = item ? item.st : 'crudo';
  let g = item ? item.g : (S.lastG[food.id] || food.units?.[0]?.g || 100);
  const hasCF = food.cf && food.cf !== 1;
  const unitBtns = [{ l: '100 g', g: 100 }, ...(food.units || []).flatMap(u => [{ l: `1 ${u.l} (${u.g} g)`, g: u.g }, { l: `½ ${u.l}`, g: u.g / 2 }, { l: `2 ${u.l}`, g: u.g * 2 }])];

  const dishOptions = () => {
    const ds = getMeal(date, selMeal).dishes;
    return ds.map(d => `<option value="${d.id}">${esc(d.name)} (${r0(dishTotals(d).kcal)} kcal)</option>`).join('') +
      DISH_TYPES.map(t => `<option value="new:${t}">＋ Nuevo: ${t}</option>`).join('');
  };
  let w = null;
  openSheet(`<div class="row"><div class="grow"><h3 style="font-size:17px">${esc(food.name)}</h3><div class="small muted">${esc(food.brand || food.cat || '')} · ${r0(food.n.kcal)} kcal/100 g${hasCF ? ' en crudo' : ''}</div></div></div>
    ${chooseTarget ? `<p class="sec-title">¿Dónde lo añado? <span style="text-transform:none;font-weight:600">(${dayLabel(date).toLowerCase()})</span></p>
      <div class="chips" id="amMeal">${MEALS.map(m => `<button data-v="${m.id}" class="${m.id === selMeal ? 'on' : ''}">${m.ico} ${m.name}</button>`).join('')}</div>
      <select class="in mt" id="amDish"></select>` : ''}
    ${hasCF ? `<p class="sec-title">¿Cómo lo has pesado?</p><div class="seg" id="amSt"><button data-v="crudo" class="${st === 'crudo' ? 'on' : ''}">En crudo</button><button data-v="cocinado" class="${st === 'cocinado' ? 'on' : ''}">Cocinado / hecho</button></div>
      <div class="note" id="amCfNote"></div>` : ''}
    <div class="qty"><button class="stp" data-x="minus">−</button><input class="in" id="amG" inputmode="decimal" value="${String(r1(g)).replace('.', ',')}"><button class="stp" data-x="plus">＋</button></div>
    <p class="center tiny muted" style="margin-top:4px">gramos</p>
    <div class="chips" style="justify-content:center">${unitBtns.map((u, i) => `<button data-x="unit" data-i="${i}">${esc(u.l)}</button>`).join('')}</div>
    <div class="preview" id="amPrev"></div>
    <button class="btn pri block mt2" data-x="save">${item ? 'Guardar cambios' : 'Añadir'}</button>
    ${item ? '<button class="btn danger block mt" data-x="del">🗑️ Quitar del plato</button>' : ''}`, {
    title: item ? 'Editar cantidad' : 'Cantidad',
    mount: wrap => {
      w = wrap;
      if (chooseTarget) {
        const sel = $('#amDish', w);
        const fill = () => { sel.innerHTML = dishOptions(); selDish = sel.value; };
        fill();
        sel.addEventListener('change', () => { selDish = sel.value; });
        $('#amMeal', w).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; selMeal = b.dataset.v; $$('#amMeal button', w).forEach(x => x.classList.toggle('on', x === b)); fill(); });
      }
      if (hasCF) $('#amSt', w).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st = b.dataset.v; $$('#amSt button', w).forEach(x => x.classList.toggle('on', x === b)); upd(); });
      $('#amG', w).addEventListener('input', () => { g = num($('#amG', w).value); upd(); });
      upd();
    },
    on: {
      minus: () => { g = Math.max(0, g - (g > 50 ? 10 : 5)); setG(); },
      plus: () => { g = g + (g >= 50 ? 10 : 5); setG(); },
      unit: el => { g = unitBtns[+el.dataset.i].g; setG(); },
      save: async () => {
        if (!(g > 0)) return toast('Indica los gramos');
        let k = item ? item._date : date, mid = item ? item._meal : selMeal, did = item ? item._dish : selDish;
        let d;
        if (String(did).startsWith('new:')) {
          d = { id: uid(), name: did.slice(4), items: [] };
          getMeal(k, mid, true).dishes.push(d);
        } else {
          getDay(k, true);
          d = findDish(k, mid, did);
        }
        if (!d) return toast('No se encontró el plato');
        const snap = { fid: food.id, name: food.name, brand: food.brand || '', n: { ...food.n }, cf: food.cf || 1, g: r1(g), st: hasCF ? st : 'crudo' };
        if (item) Object.assign(d.items.find(x => x.id === item.id) || {}, snap);
        else d.items.push({ id: uid(), ...snap });
        if (!item) S.usage[food.id] = (S.usage[food.id] || 0) + 1;
        S.lastG[food.id] = r1(g);
        save();
        await closeAll();
        if (chooseTarget) { UI.tab = 'hoy'; UI.date = k; }
        render();
        toast(`${item ? 'Actualizado' : 'Añadido'}: ${r0(calcItem(snap).kcal)} kcal`);
      },
      del: async () => {
        const d = findDish(item._date, item._meal, item._dish);
        if (d) d.items = d.items.filter(x => x.id !== item.id);
        save(); await closeAll(); render(); toast('Quitado');
      },
    },
  });
  function setG() { $('#amG', w).value = String(r1(g)).replace('.', ','); upd(); }
  function upd() {
    const it = { n: food.n, cf: food.cf || 1, g, st: hasCF ? st : 'crudo' };
    const t = calcItem(it);
    $('#amPrev', w).innerHTML = `<div><div class="v">${r0(t.kcal)}</div><div class="l">kcal</div></div><div><div class="v mp">${fmt1(t.p)}</div><div class="l">Proteína g</div></div>
      <div><div class="v mc">${fmt1(t.c)}</div><div class="l">Hidratos g</div></div><div><div class="v mf">${fmt1(t.f)}</div><div class="l">Grasa g</div></div>`;
    const note = $('#amCfNote', w);
    if (note) note.innerHTML = st === 'cocinado'
      ? `${r0(g)} g cocinado ≈ <b>${r0(g / food.cf)} g en crudo</b> (factor ×${String(food.cf).replace('.', ',')}).`
      : `${r0(g)} g en crudo ≈ ${r0(g * food.cf)} g una vez cocinado.`;
  }
}

/* ---------- Platos ---------- */
function openAddDish(mid) {
  const m = MEALS.find(x => x.id === mid);
  openSheet(`<div class="chips">${DISH_TYPES.map(t => `<button data-x="type" data-v="${t}">${t}</button>`).join('')}<button data-x="custom">Otro…</button></div>
    ${S.fav.length ? `<p class="sec-title">Platos favoritos</p><div class="flist">${S.fav.map((f, i) => {
      const t = dishTotals(f);
      return `<div class="fi" data-x="fav" data-i="${i}"><div class="th">⭐</div><div class="in2"><div class="nm">${esc(f.name)}</div><div class="sub">${f.items.map(x => esc(x.name)).join(', ')}</div></div><div class="kc">${r0(t.kcal)} kcal</div></div>`;
    }).join('')}</div>` : '<p class="small muted mt">Consejo: guarda tus platos habituales como favoritos (menú ⋯ del plato) para añadirlos con un toque.</p>'}`, {
    title: `${m.ico} Nuevo plato en ${m.name}`,
    on: {
      type: el => createDish(mid, el.dataset.v),
      custom: async () => { await closeSheet(); const n = await ask({ title: 'Nombre del plato', input: '', placeholder: 'Ej: Ensalada de pasta' }); if (n) createDish(mid, n, true); },
      fav: el => {
        const f = S.fav[+el.dataset.i];
        getMeal(UI.date, mid, true).dishes.push({ id: uid(), name: f.name, items: f.items.map(x => ({ ...x, id: uid() })) });
        save(); closeAll().then(() => { render(); toast('Plato añadido'); });
      },
    },
  });
}
async function createDish(mid, name, closed) {
  const d = { id: uid(), name, items: [] };
  getMeal(UI.date, mid, true).dishes.push(d);
  save();
  if (!closed) await closeSheet();
  render();
  openPicker({ date: UI.date, meal: mid, dish: d.id });
}

/* ---------- Acciones globales ---------- */
const ACTIONS = {
  goto: el => { UI.tab = el.dataset.t; render(); window.scrollTo(0, 0); },
  'day-prev': () => { UI.date = addDays(UI.date, -1); render(); },
  'day-next': () => { UI.date = addDays(UI.date, 1); render(); },
  'day-today': () => { UI.date = todayKey(); render(); },
  'add-weight': () => openWeight(),
  water: el => { const d = getDay(UI.date, true); d.water = Math.max(0, (d.water || 0) + +el.dataset.v); save(); render(); },
  'add-dish': el => openAddDish(el.dataset.m),
  'add-food': el => openPicker({ date: UI.date, meal: el.dataset.m, dish: el.dataset.d }),
  'edit-item': el => {
    const d = findDish(UI.date, el.dataset.m, el.dataset.d), it = d?.items.find(x => x.id === el.dataset.i);
    if (!it) return;
    const ref = { ...it, _date: UI.date, _meal: el.dataset.m, _dish: el.dataset.d };
    if (it.quick) {
      return menu(esc(it.name), [{ ico: '🗑️', label: 'Quitar del plato', danger: true, fn: () => { d.items = d.items.filter(x => x.id !== it.id); save(); render(); } }]);
    }
    const f = getFood(it.fid);
    const food = f ? { ...f } : { id: it.fid, name: it.name, brand: it.brand, n: it.n, cf: it.cf, units: [] };
    openAmount({ food, date: UI.date, meal: el.dataset.m, dish: el.dataset.d, item: ref });
  },
  'dish-menu': el => {
    const mid = el.dataset.m, d = findDish(UI.date, mid, el.dataset.d); if (!d) return;
    menu(esc(d.name), [
      { ico: '＋', label: 'Añadir alimento', fn: () => openPicker({ date: UI.date, meal: mid, dish: d.id }) },
      { ico: '✏️', label: 'Cambiar nombre', fn: async () => { const n = await ask({ title: 'Nombre del plato', input: d.name }); if (n) { d.name = n; save(); render(); } } },
      { ico: '⭐', label: 'Guardar como plato favorito', fn: async () => {
        if (!d.items.length) return toast('El plato está vacío');
        const n = await ask({ title: 'Nombre del favorito', input: d.name === 'Plato único' || DISH_TYPES.includes(d.name) ? d.items.map(x => x.name.split(' ')[0]).join(' con ').slice(0, 40) : d.name });
        if (n) { S.fav.push({ id: uid(), name: n, items: d.items.map(x => ({ ...x })) }); save(); toast('⭐ Guardado en favoritos'); }
      } },
      { ico: '🗑️', label: 'Eliminar plato', danger: true, fn: async () => {
        if (d.items.length && !(await ask({ title: 'Eliminar plato', text: `Se quitará «${esc(d.name)}» con sus ${d.items.length} alimentos.`, ok: 'Eliminar', danger: true }))) return;
        const m = getMeal(UI.date, mid); m.dishes = m.dishes.filter(x => x.id !== d.id); save(); render();
      } },
    ]);
  },
  'meal-menu': el => {
    const mid = el.dataset.m, m = MEALS.find(x => x.id === mid);
    const prev = getMeal(addDays(UI.date, -1), mid);
    const items = [{ ico: '＋', label: 'Añadir plato', fn: () => openAddDish(mid) }];
    if (prev.dishes.length) items.push({ ico: '📋', label: `Copiar ${m.name.toLowerCase()} del día anterior`, fn: () => {
      getMeal(UI.date, mid, true).dishes.push(...prev.dishes.map(d => ({ ...d, id: uid(), items: d.items.map(x => ({ ...x, id: uid() })) })));
      save(); render(); toast('Copiado');
    } });
    if (getMeal(UI.date, mid).dishes.length) items.push({ ico: '🗑️', label: `Vaciar ${m.name.toLowerCase()}`, danger: true, fn: async () => {
      if (await ask({ title: 'Vaciar', text: `¿Quitar todos los platos de ${m.name.toLowerCase()}?`, ok: 'Vaciar', danger: true })) { getMeal(UI.date, mid).dishes = []; save(); render(); }
    } });
    menu(`${m.ico} ${m.name}`, items);
  },
  'scan-main': () => openScanner(code => handleCode(code, {})),
  'open-food': el => { const f = getFood(el.dataset.id); if (f) openProduct(f); },
  'new-food': () => openProductForm({ name: UI.tab === 'alimentos' ? UI.foodQ : '' }),
  'online-search': () => openOnline(UI.tab === 'alimentos' ? UI.foodQ : ''),
  range: el => { UI.range = +el.dataset.v; render(); },
  'del-weight': async el => {
    if (!(await ask({ title: 'Borrar pesaje', text: `¿Borrar el peso del ${fmtShort(el.dataset.v)}?`, ok: 'Borrar', danger: true }))) return;
    S.weights = S.weights.filter(x => x.d !== el.dataset.v); save(); render();
  },
  install: async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; render(); },
  export: () => {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `nutriplato-copia-${todayKey()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Copia descargada');
  },
  import: () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async () => {
      try {
        const data = JSON.parse(await i.files[0].text());
        if (!data || !data.v || typeof data.days !== 'object') throw new Error('formato');
        if (!(await ask({ title: 'Importar copia', text: 'Se sustituirán todos los datos actuales por los de la copia.', ok: 'Importar', danger: true }))) return;
        S = Object.assign(DEF(), data); save(); render(); toast('✅ Copia importada');
      } catch (e) { toast('Ese archivo no es una copia válida'); }
    };
    i.click();
  },
  wipe: async () => {
    if (!(await ask({ title: 'Borrar todo', text: 'Se borrará tu perfil, pesos, comidas y productos. No se puede deshacer. Te recomendamos exportar una copia antes.', ok: 'Borrar todo', danger: true }))) return;
    localStorage.removeItem(KEY); S = DEF(); UI.tab = 'hoy'; render();
  },
};

document.addEventListener('click', e => {
  if (sheets.length && e.target.closest('.sheet-wrap')) return; // las hojas gestionan sus propios clics
  const t = e.target.closest('[data-tab]');
  if (t) { UI.tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-a]');
  if (el && ACTIONS[el.dataset.a]) ACTIONS[el.dataset.a](el, e);
});

/* Al volver a la app otro día, salta a "hoy" */
let lastToday = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && todayKey() !== lastToday) { if (UI.date === lastToday) UI.date = todayKey(); lastToday = todayKey(); render(); }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

render();
