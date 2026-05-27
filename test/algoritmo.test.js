'use strict';
// ════════════════════════════════════════════════════════════════════
//  Tests del algoritmo pensional.
//
//  No duplicamos código: cargamos el <script> real de index.html y lo
//  evaluamos en un sandbox de Node con stubs mínimos de DOM. Así los
//  tests siempre corren contra el código de producción.
//
//  Correr con:  node --test
// ════════════════════════════════════════════════════════════════════
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ── Cargar y evaluar el <script> de index.html ──
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('No se encontró el bloque <script> en index.html');

// El script solo toca el DOM con document.addEventListener al cargar.
const noop = () => {};
const sandbox = {
  document: { addEventListener: noop, getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  window: {},
  console
};
vm.createContext(sandbox);

// `var __T` se adhiere al global del contexto y puede ver consts del mismo script.
const shim = `;var __T = { decidir, evalColp, evalAFP, pesos, score, enTransicion,
  minWeeks, puedeTransladarse, resolverAnos, anosLab, salMid, dens, fmtPesos,
  ANOS_RANGE, AFP_RETURN_REAL, RET_AGE, BASE_WEEKS };`;
vm.runInContext(m[1] + shim, sandbox);
const T = sandbox.__T;

// Caso base válido (hombre, perfil intermedio)
function mk(o = {}) {
  return Object.assign({
    edad: 40, sexo: 'M', fondo_actual: 'Porvenir',
    semanas_actuales: 700, semanas_julio25: 650, saldo_afp: 0,
    ha_trasladado: 'no', especiales: [],
    salario: '3-5', anos_lab: '10-15', densidad: 'siempre',
    hijos: '0', preferencias: []
  }, o);
}
const sum = obj => Object.values(obj).reduce((a, b) => a + b, 0);

// ════════════════════════════════════════════════
//  pesos() — regresión del bug de peso negativo
// ════════════════════════════════════════════════
test('pesos: siempre suman 1 y ninguno es negativo', () => {
  const combos = [
    [], ['maximizar_mesada'], ['retirar_pronto'], ['heredar'],
    ['menor_riesgo'], ['garantia_estado'],
    ['menor_riesgo', 'garantia_estado'],            // el combo que producía mesada < 0
    ['maximizar_mesada', 'retirar_pronto', 'heredar', 'menor_riesgo', 'garantia_estado']
  ];
  for (const c of combos) {
    const p = T.pesos(c);
    assert.ok(Math.abs(sum(p) - 1) < 1e-9, `suman 1 para [${c}]`);
    for (const [k, v] of Object.entries(p)) {
      assert.ok(v >= 0, `peso ${k} no negativo para [${c}] (fue ${v})`);
    }
  }
});

test('pesos: menor_riesgo+garantia_estado no vuelve negativa la mesada', () => {
  assert.ok(T.pesos(['menor_riesgo', 'garantia_estado']).mesada >= 0);
});

// ════════════════════════════════════════════════
//  Colpensiones — elegibilidad por semanas (no por edad)
// ════════════════════════════════════════════════
test('Colpensiones: con semanas suficientes pero retiro antes de 62, SÍ pensiona a los 62', () => {
  // 47 años + 12 años cotizando (rango neutral) => ~1674 semanas, deja de cotizar a los 59
  const r = T.evalColp(mk({ edad: 47, semanas_actuales: 1100, anos_lab: '10-15' }));
  assert.strictEqual(r.logra_pension, true);
  assert.strictEqual(r.edad_pension, 62);
  assert.ok(r.nota && /62/.test(r.nota), 'la nota explica que la mesada empieza a los 62');
  assert.doesNotMatch(r.beneficio_desc || '', /indemniz/i);
});

test('Colpensiones: sin semanas suficientes => indemnización sustitutiva', () => {
  const r = T.evalColp(mk({ edad: 40, semanas_actuales: 200, anos_lab: '<5' }));
  assert.strictEqual(r.logra_pension, false);
  assert.strictEqual(r.edad_pension, null);
  assert.match(r.beneficio_desc, /indemniz/i);
});

// ════════════════════════════════════════════════
//  Régimen de transición (Ley 2381)
// ════════════════════════════════════════════════
test('enTransicion: por edad y por semanas al 1-jul-2025', () => {
  assert.strictEqual(T.enTransicion(mk({ sexo: 'M', edad: 54, semanas_julio25: 100 })), true);  // 53 en jul-25 ≥ 52
  assert.strictEqual(T.enTransicion(mk({ sexo: 'M', edad: 50, semanas_julio25: 100 })), false); // 49 < 52
  assert.strictEqual(T.enTransicion(mk({ sexo: 'F', edad: 48, semanas_julio25: 100 })), true);  // 47 ≥ 47
  assert.strictEqual(T.enTransicion(mk({ sexo: 'M', edad: 35, semanas_julio25: 800 })), true);  // ≥ 750 semanas
});

// ════════════════════════════════════════════════
//  minWeeks — reducción por hijos (mujeres)
// ════════════════════════════════════════════════
test('minWeeks: base 1300, reducciones para mujeres con hijos', () => {
  assert.strictEqual(T.minWeeks(mk({ sexo: 'M', hijos: 3 })), 1300);
  assert.strictEqual(T.minWeeks(mk({ sexo: 'F', hijos: 0 })), 1300);
  assert.strictEqual(T.minWeeks(mk({ sexo: 'F', hijos: 3 })), 1275);
  assert.strictEqual(T.minWeeks(mk({ sexo: 'F', hijos: 4 })), 1225);
});

// ════════════════════════════════════════════════
//  resolverAnos — rango según prioridades
// ════════════════════════════════════════════════
test('resolverAnos: prioridad decide la cota del rango', () => {
  const base = { anos_lab: '10-15' };
  assert.strictEqual(T.resolverAnos({ ...base, preferencias: [] }).anos, 12);
  assert.strictEqual(T.resolverAnos({ ...base, preferencias: ['retirar_pronto'] }).anos, 10);
  assert.strictEqual(T.resolverAnos({ ...base, preferencias: ['maximizar_mesada'] }).anos, 15);
  // contradictorias => punto medio
  assert.strictEqual(T.resolverAnos({ ...base, preferencias: ['retirar_pronto', 'maximizar_mesada'] }).anos, 12);
  // preferencia no relacionada => punto medio
  assert.strictEqual(T.resolverAnos({ ...base, preferencias: ['heredar'] }).anos, 12);
});

test('resolverAnos: solo hay nota cuando se usa una cota (no el medio)', () => {
  const base = { anos_lab: '10-15' };
  assert.strictEqual(T.resolverAnos({ ...base, preferencias: [] }).nota, null);
  assert.ok(T.resolverAnos({ ...base, preferencias: ['retirar_pronto'] }).nota);
  assert.ok(T.resolverAnos({ ...base, preferencias: ['maximizar_mesada'] }).nota);
});

// ════════════════════════════════════════════════
//  AFP — rendimiento REAL (no nominal) y rango
// ════════════════════════════════════════════════
test('AFP: la tasa real esperada es 3% (no volvió al 8% nominal)', () => {
  // comparación campo a campo (el objeto viene de otro realm del vm)
  assert.strictEqual(T.AFP_RETURN_REAL.lo, 0.015);
  assert.strictEqual(T.AFP_RETURN_REAL.mid, 0.03);
  assert.strictEqual(T.AFP_RETURN_REAL.hi, 0.045);
});

test('AFP: el rango de mesada está ordenado lo ≤ esperada ≤ hi', () => {
  const r = T.evalAFP(mk({ edad: 47, semanas_actuales: 1100, anos_lab: '10-15', salario: '5-8' }));
  assert.ok(Number.isFinite(r.mesada) && r.mesada > 0);
  assert.ok(r.mesada_lo <= r.mesada, `lo (${r.mesada_lo}) ≤ esperada (${r.mesada})`);
  assert.ok(r.mesada <= r.mesada_hi, `esperada (${r.mesada}) ≤ hi (${r.mesada_hi})`);
  // con años de cotización, un mayor rendimiento da estrictamente más mesada
  assert.ok(r.mesada_hi > r.mesada_lo, 'optimista > pesimista cuando hay años de aporte');
});

// ════════════════════════════════════════════════
//  decidir — integración, sin NaN ni excepciones
// ════════════════════════════════════════════════
test('decidir: produce una recomendación válida sin NaN', () => {
  const r = T.decidir(mk({ preferencias: ['menor_riesgo', 'garantia_estado'] }));
  assert.ok(r.mejor && typeof r.mejor.regimen === 'string');
  assert.ok(['alta', 'media', 'baja'].includes(r.confianza));
  for (const esc of [r.colp, r.afp]) {
    assert.ok(Number.isFinite(esc.mesada), `mesada de ${esc.regimen} es finita`);
  }
  // los puntajes viven en r.todos (escenarios evaluados y ordenados)
  for (const esc of r.todos) {
    assert.ok(Number.isFinite(esc.score), `score de ${esc.regimen} es finito`);
  }
});

test('decidir: caso tipo "César" recomienda Colpensiones (corrige sesgo pro-AFP)', () => {
  // Alto cotizante que se retira antes de los 62: con rendimiento real, gana RPM
  const r = T.decidir(mk({
    edad: 47, semanas_actuales: 1053, semanas_julio25: 1010,
    salario: '5-8', anos_lab: '10-15', preferencias: ['maximizar_mesada']
  }));
  assert.strictEqual(r.colp.logra_pension, true);
  assert.match(r.mejor.regimen, /Colpensiones/);
});

// ════════════════════════════════════════════════
//  fmtPesos — formato amigable (estructural, sin depender de locale exacto)
// ════════════════════════════════════════════════
test('fmtPesos: usa "millones" para montos grandes y no para pequeños', () => {
  assert.ok(T.fmtPesos(5.1).startsWith('$'));
  assert.match(T.fmtPesos(5.1), /millones/);     // 5.1 SMMLV ≈ 7,3M
  assert.match(T.fmtPesos(537.9), /millones/);   // capital
  assert.doesNotMatch(T.fmtPesos(0.3), /millones/); // < 1 millón
});
