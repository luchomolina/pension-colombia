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
  minWeeks, puedeTransladarse, resolverAnos, anosLab, salMid, trayDens, trayIbc, fmtPesos,
  ANOS_RANGE, AFP_RETURN_REAL, RET_AGE, BASE_WEEKS };`;
vm.runInContext(m[1] + shim, sandbox);
const T = sandbox.__T;

// Caso base válido (hombre, perfil intermedio)
function mk(o = {}) {
  return Object.assign({
    edad: 40, sexo: 'M', fondo_actual: 'Porvenir',
    semanas_actuales: 700, semanas_julio25: 650, saldo_afp: 0,
    ha_trasladado: 'no', especiales: [],
    salario: '3-5', anos_lab: '10-15', trayectoria: 'pleno',
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
//  Colpensiones — tasa de reemplazo decreciente con el ingreso (Ley 100 art. 34)
// ════════════════════════════════════════════════
test('Colpensiones: la tasa de reemplazo baja cuando sube el salario', () => {
  // mismas semanas (mismo bonus), distinto salario → el ingreso es lo único que cambia
  const comun = { edad: 55, semanas_actuales: 1300, anos_lab: '<5', trayectoria: 'pleno' };
  const bajo = T.evalColp(mk({ ...comun, salario: '1-2' }));   // IBL ≈ 1.5 SMMLV
  const alto = T.evalColp(mk({ ...comun, salario: 'gt8' }));   // IBL ≈ 11 SMMLV
  assert.ok(bajo.tasa > alto.tasa, `tasa baja-renta (${bajo.tasa}%) > alta-renta (${alto.tasa}%)`);
  // La diferencia ≈ 0.5 × (11 − 1.5) ≈ 4.75 puntos
  const gap = bajo.tasa - alto.tasa;
  assert.ok(gap >= 4 && gap <= 6, `diferencia ~5 puntos por el ingreso (fue ${gap})`);
});

test('Colpensiones: la tasa nunca baja de 55% ni pasa de 80%', () => {
  const muyAlto = T.evalColp(mk({ edad: 60, semanas_actuales: 2000, anos_lab: '<5', salario: 'gt8' }));
  assert.ok(muyAlto.tasa >= 55 && muyAlto.tasa <= 80, `tasa en [55,80] (fue ${muyAlto.tasa})`);
});

// ════════════════════════════════════════════════
//  Régimen de transición (Ley 2381)
// ════════════════════════════════════════════════
test('enTransicion: por semanas, diferenciado por sexo (Ley 2381 art. 75)', () => {
  // Hombres: umbral 900
  assert.strictEqual(T.enTransicion(mk({ sexo: 'M', semanas_julio25: 899 })), false);
  assert.strictEqual(T.enTransicion(mk({ sexo: 'M', semanas_julio25: 900 })), true);
  // Mujeres: umbral 750
  assert.strictEqual(T.enTransicion(mk({ sexo: 'F', semanas_julio25: 749 })), false);
  assert.strictEqual(T.enTransicion(mk({ sexo: 'F', semanas_julio25: 750 })), true);
  // La edad NO otorga transición por sí sola
  assert.strictEqual(T.enTransicion(mk({ sexo: 'M', edad: 60, semanas_julio25: 400 })), false);
  // El caso auditado: hombre con 795 semanas NO es transición
  assert.strictEqual(T.enTransicion(mk({ sexo: 'M', semanas_julio25: 795 })), false);
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
//  minWeeks — hijos como string (coerción segura)
// ════════════════════════════════════════════════
test('minWeeks: hijos como string se parsea correctamente', () => {
  // El formulario guarda hijos como string '0'–'3'; el parseInt debe funcionar igual.
  assert.strictEqual(T.minWeeks(mk({ sexo: 'F', hijos: '3' })), 1275);
  assert.strictEqual(T.minWeeks(mk({ sexo: 'F', hijos: '0' })), 1300);
  assert.strictEqual(T.minWeeks(mk({ sexo: 'F', hijos: null })), 1300); // null → 0
});

// ════════════════════════════════════════════════
//  womenBaseWeeks — Sentencia C-197/2023
// ════════════════════════════════════════════════
test('womenBaseWeeks: en 2026 sigue siendo 1300 (reducción empieza 2027)', () => {
  // YEAR=2026 en el módulo producción — la reducción todavía no aplica
  assert.strictEqual(T.minWeeks(mk({ sexo: 'F', hijos: '0' })), 1300);
});

// ════════════════════════════════════════════════
//  evalAFP — Garantía de Pensión Mínima (GPM, 1150 semanas)
// ════════════════════════════════════════════════
test('AFP: garantía mínima se activa con 1150 semanas, no 1300', () => {
  // Persona con 1200 semanas (< 1300 mínimo, pero > 1150 GPM) y salario bajo →
  // el capital no alcanza 1 SMMLV pero el Estado garantiza 1 SMMLV de mesada.
  const r = T.evalAFP(mk({
    edad: 57, sexo: 'F', semanas_actuales: 1200, saldo_afp: 50,
    salario: 'lt1', anos_lab: '<5', trayectoria: 'reduciendo'
  }));
  // Con tan poco capital e ingresos la mesada bruta sería < 1 SMMLV,
  // pero la garantía estatal debe activarse (logra_pension = true, mesada = 1.0).
  assert.ok(r.garantia_min, 'debe activar garantia_min con ≥1150 semanas');
  assert.ok(r.logra_pension, 'logra_pension debe ser true por la garantía');
  assert.ok(r.mesada >= 1.0, `mesada debe ser ≥ 1 SMMLV (fue ${r.mesada})`);
});

test('AFP: sin garantía cuando las semanas proyectadas son < 1150', () => {
  // Con 1100 actuales, alab=2 (retirar_pronto en rango <5) y trayectoria reduciendo (d=0.35):
  // futW = 2 × 52 × 0.35 = 36 → totalW = 1136 < 1150 → garantia debe ser false.
  const r = T.evalAFP(mk({
    edad: 57, sexo: 'F', semanas_actuales: 1100, saldo_afp: 50,
    salario: 'lt1', anos_lab: '<5', trayectoria: 'reduciendo',
    preferencias: ['retirar_pronto'] // fuerza alab = lo = 2
  }));
  assert.ok(!r.garantia_min, `sin garantia_min con totalW < 1150 (semanas=${r.semanas_proy})`);
});

// ════════════════════════════════════════════════
//  evalAFP — regresión capital y mesada (perfil gt8)
// ════════════════════════════════════════════════
test('AFP: capital e mesada plausibles para el caso gt8 auditado', () => {
  // Perfil: 45, Porvenir, 842 sem, 183.3 SMMLV declarados, >8SMMLV, 10 años, siempre
  // stopAge=55, retireAge=62, gapYears=7.
  // Capital esperado (mid=3%): ≈ 500–520 SMMLV.
  // Mesada esperada (mid): ≈ 2.2–2.5 SMMLV.
  const r = T.evalAFP(mk({
    edad: 45, semanas_actuales: 842, saldo_afp: 183.3,
    salario: 'gt8', anos_lab: '5-10',
    trayectoria: 'pleno', preferencias: ['maximizar_mesada'] // alab = hi = 10
  }));
  assert.ok(r.capital >= 480 && r.capital <= 550,
    `capital ~500 SMMLV (fue ${r.capital})`);
  assert.ok(r.mesada >= 2.0 && r.mesada <= 2.7,
    `mesada ~2.3 SMMLV (fue ${r.mesada})`);
  assert.ok(r.mesada_lo < r.mesada && r.mesada < r.mesada_hi,
    'rango lo < mid < hi');
});

test('AFP: capital e mesada plausibles para un cotizante de 3-5 SMMLV', () => {
  // 40 años, saldo declarado 0 (se estima internamente), 3-5 SMMLV, 17 años (mid 15-20), siempre.
  // El modelo estima un saldo inicial razonable + acumula 17 años de aportes + 5 de gap.
  // Capital esperado ~280–380 SMMLV; mesada mid ~1.3–2.0 SMMLV.
  const r = T.evalAFP(mk({
    edad: 40, semanas_actuales: 700, saldo_afp: 0,
    salario: '3-5', anos_lab: '15-20',
    trayectoria: 'pleno', preferencias: []
  }));
  assert.ok(Number.isFinite(r.mesada) && r.mesada > 0, 'mesada finita y positiva');
  assert.ok(r.capital > 150 && r.capital < 500, `capital en rango plausible (fue ${r.capital})`);
  assert.ok(r.mesada_lo <= r.mesada, 'lo ≤ mid');
  assert.ok(r.mesada <= r.mesada_hi, 'mid ≤ hi');
});

// ════════════════════════════════════════════════
//  evalColp — advertencia IBL cuando hay brecha pre-retiro
// ════════════════════════════════════════════════
test('Colpensiones: iblNota presente cuando gap ≥ 2 años', () => {
  // stopAge = 45+10 = 55, pensionAge = 62 → gap = 7 años → iblNota obligatorio
  const r = T.evalColp(mk({
    edad: 45, semanas_actuales: 842, salario: 'gt8',
    anos_lab: '5-10', preferencias: ['maximizar_mesada'] // alab = 10
  }));
  assert.ok(r.iblNota && /IBL/i.test(r.iblNota),
    'iblNota debe mencionar IBL cuando se deja de cotizar 7 años antes');
  assert.ok(/10 años/i.test(r.iblNota) || /10 de/.test(r.iblNota),
    'iblNota debe mencionar la ventana de 10 años');
  // la nota de timing no debe contener el aviso IBL (están separadas)
  assert.doesNotMatch(r.nota || '', /IBL/i, 'nota timing no debe mezclar el aviso IBL');
});

test('Colpensiones: iblNota ausente cuando gap < 2 años', () => {
  // stopAge = 60+2 = 62 → pensionAge = 62 → gap = 0 → sin iblNota
  const r = T.evalColp(mk({
    edad: 60, semanas_actuales: 1200, salario: '3-5',
    anos_lab: '<5', preferencias: ['retirar_pronto'] // alab = lo = 2
  }));
  assert.ok(!r.iblNota, 'iblNota debe ser null cuando gap < 2 años');
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
