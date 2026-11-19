// Testy model.js. Dane syntetyczne, bez danych z Intervals. Uruchom: node --test
import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../model.js";

const FTP = 250, ZONES = [55, 75, 90, 105, 120, 150, 999];
const cfg = { ftp: FTP, zones: ZONES, sweat: 0.9, sodium: 700 };
const V = { base: 2400, floor: 1900, mass: 70, prot: 2, fat: 0.9, meals: 4, minMeal: null, wake: 390, sleep: 1350, hpCarb: 1 };
const step = (min, pct) => ({ duration: min * 60, power: { value: pct, units: "%ftp" } });
const ride = (id, steps, extra = {}) => ({ id, type: "Ride", category: "WORKOUT", name: "Jazda " + id, workout_doc: { steps, duration: steps.reduce((a, s) => a + (s.duration || 0) * (s.reps || 1), 0) }, ...extra });
const sess = (ev, start, prio = false) => ({ ...M.analyzeSession(ev, { ...cfg, prio }), start, off: false });
const plan = (sessions, extra = {}) => M.planDay({ sessions }, { settings: V, times: null, ...extra });
const sum = (list, k) => list.reduce((a, x) => a + x[k], 0);
const minCut = (p, m) => m.kind !== "main" ? M.K.SNACK_MIN : m.code === "L" ? Math.max(300, 0.7 * p.minMain) : p.minMain;

test("kJ z kroków: moc × czas, z powtórzeniami", () => {
  const ev = ride(1, [step(10, 60), { reps: 4, steps: [step(8, 100), step(2, 50)] }, step(10, 50)]);
  const s = M.analyzeSession(ev, cfg);
  const kj = (600 * 150 + 4 * (480 * 250 + 120 * 125) + 600 * 125) / 1000;
  assert.equal(s.kj, Math.round(kj));
  assert.equal(s.durSec, 60 * 60);
  assert.equal(s.hardMin, 32);
});

test("bloki 30 min: limit 60 g/h do 90 min i 90 g/h powyżej, pierwszy blok mniejszy", () => {
  const s90 = M.analyzeSession(ride(2, [step(90, 85)]), cfg);
  s90.blocks.forEach(b => assert.ok(b.intake <= 30));
  const s3h = M.analyzeSession(ride(3, [step(180, 75)]), cfg);
  assert.equal(s3h.blocks.length, 6);
  s3h.blocks.forEach(b => assert.ok(b.intake <= 45));
  assert.ok(s3h.blocks[0].intake < s3h.blocks[1].intake);
  s3h.blocks.slice(1).forEach(b => assert.ok(b.intake >= 20)); // min. 40 g/h na długiej jeździe
});

test("krótko i lekko: bez węgli w trakcie; krótko i ciężko: ok. 30 g/h", () => {
  assert.equal(M.analyzeSession(ride(4, [step(45, 60)]), cfg).intra, 0);
  const hard = M.analyzeSession(ride(5, [step(15, 55), step(20, 95), step(15, 55)]), cfg);
  assert.ok(hard.intra >= 20 && hard.intra <= 30);
});

for (const n of [3, 4, 5, 6]) for (const [label, start] of [["rano", 6 * 60 + 30], ["w południe", 12 * 60], ["wieczorem", 18 * 60]]) {
  test(`timeline: ${n} posiłki, trening ${label}`, () => {
    const s = sess(ride(10, [step(90, 70)]), start);
    const meals = M.buildTimeline([s], { wake: V.wake, sleep: V.sleep, meals: n });
    const end = start + 90;
    for (let i = 1; i < meals.length; i++) assert.ok(meals[i].t - meals[i - 1].t >= 30, "posiłki nie zlewają się");
    meals.forEach(m => assert.ok(!(m.t > start && m.t < end), "brak posiłku w trakcie jazdy"));
    if (end + 30 < V.sleep) assert.ok(meals.some(m => m.role === "recovery"), "jest regeneracja");
    if (start - V.wake > 25) assert.ok(meals.some(m => m.role === "pre" || m.role === "presnack"), "jest posiłek przed");
  });
}

test("plan dnia: suma makro zgodna z celem, węgle w zakresie kodów", () => {
  const p = plan([sess(ride(11, [step(120, 75)]), 17 * 60)]);
  assert.ok(Math.abs(sum(p.meals, "kcal") + 4 * p.intra - p.target) < 5);
  const pre = p.meals.find(m => m.role === "pre"), low = p.meals.filter(m => m.code === "L");
  low.forEach(m => assert.ok(m.c < pre.c));
});

test("deficyt: posiłki LOW i MEDIUM, przed treningiem i regeneracja bez zmian, nic poniżej minimum cięcia", () => {
  const rest = plan([], { deficit: 250 });
  assert.ok(rest.def > 0 && rest.def <= 250.5, "dzień wolny: deficyt wchodzi");
  rest.meals.forEach(m => assert.ok(m.kcal >= minCut(rest, m) - 1));
  const s = sess(ride(12, [step(75, 70)]), 12 * 60);
  const a = plan([s]), b = plan([s], { deficit: 250 });
  assert.ok(b.def <= 250.5);
  for (const role of ["pre", "recovery"]) {
    const x = a.meals.find(m => m.role === role), y = b.meals.find(m => m.role === role);
    if (x) assert.ok(Math.abs(x.c - y.c) < 0.01, role + " zachowuje węgle");
  }
  b.meals.filter(m => m.cut).forEach(m => { assert.notEqual(m.code, "H"); assert.ok(m.kcal >= minCut(b, m) - 1); });
});

test("minimum posiłku: żaden posiłek główny poniżej minimum", () => {
  const p = plan([], {});
  p.meals.filter(m => m.kind === "main").forEach(m => assert.ok(m.kcal >= p.minMain - 5));
});

test("ładowanie: start priorytetowy 3 h jutro daje 10 g/kg, za 2 dni 8 g/kg", () => {
  const s = { prio: true, durSec: 180 * 60 };
  assert.equal(M.loadingFor([{ offset: 1, s }]), 10);
  assert.equal(M.loadingFor([{ offset: 2, s }]), 8);
  assert.equal(M.loadingFor([{ offset: 1, s: { ...s, prio: false } }]), 0);
  const p = plan([], { loadKg: 10 });
  assert.ok(p.cKg >= 9.9);
});

test("start: posiłek przed min. 2 g/kg węgli", () => {
  const p = plan([sess(ride(13, [step(120, 85)]), 12 * 60, true)]);
  const pre = p.meals.find(m => m.role === "pre");
  assert.ok(pre.c >= 2 * V.mass - 1);
});

// ---------- Wykonanie i przeliczenie dnia ----------
const act = (o = {}) => ({ id: 99, type: "Ride", name: "Jazda", start_date_local: "2026-11-19T12:00:00", moving_time: 7200, icu_joules: 1800000, icu_average_watts: 250, icu_weighted_avg_watts: 260, ...o });

test("aktywność: energia z icu_joules, za krótka pomijana, podaż z carbs_ingested", () => {
  const s = M.analyzeActivity(act({ carbs_ingested: 110 }), cfg);
  assert.equal(s.kj, 1800); assert.equal(s.durSec, 7200); assert.equal(s.start, 12 * 60);
  assert.ok(Math.abs(s.kcal - (1800 - 2 * M.K.MAINT_KCAL_H)) < 0.01);
  assert.equal(s.intra, 110); assert.equal(s.intraAssumed, false);
  assert.equal(M.analyzeActivity(act({ moving_time: 300 }), cfg), null);
  assert.equal(M.analyzeActivity({ id: 1, type: "Ride" }, cfg), null); // skrót ze Stravy bez danych
  const run = M.analyzeActivity({ id: 2, type: "Run", start_date_local: "2026-11-19T07:00:00", moving_time: 3600, calories: 800 }, cfg);
  assert.ok(Math.abs(run.kcal - 710) < 0.01);
});

function liveCase(actualKj, now) {
  const ev = ride(20, [step(120, 70)]);
  const planned = sess(ev, 12 * 60);
  const done = { ...M.analyzeActivity(act({ icu_joules: actualKj * 1000 }), cfg), start: 12 * 60, off: false, intra: planned.intra };
  return { a: plan([planned]), b: plan([done]), now };
}

test("przeliczenie: dłuższy trening podnosi resztę dnia, minione posiłki bez zmian", () => {
  const { a, b, now } = liveCase(2400, 15 * 60);
  const L = M.liveAdjust(a, b, now, V.mass);
  assert.ok(b.target > a.target);
  L.meals.filter(m => m.past).forEach(m => { const o = a.meals.find(x => Math.abs(x.t - m.t) < 1 && x.role === m.role); if (o) assert.ok(Math.abs(o.kcal - m.kcal) < 0.01); });
  // suma: minione wg planu + reszta = cel z wykonania
  assert.ok(Math.abs(sum(L.meals, "kcal") + 4 * L.intra - b.target) < 10);
  assert.ok(L.meals.filter(m => !m.past).every(m => m.adj == null || m.adj.kcal >= 0));
  assert.equal(L.live.unabsorbed, 0);
});

test("przeliczenie: krótszy trening zabiera z posiłków poza treningiem, regeneracja zachowuje węgle", () => {
  const { a, b } = liveCase(900, 14 * 60 + 10);
  const L = M.liveAdjust(a, b, 14 * 60 + 10, V.mass);
  assert.ok(b.target < a.target);
  const recB = b.meals.find(m => m.role === "recovery"), recL = L.meals.find(m => m.role === "recovery");
  assert.ok(recL.c >= recB.c - 0.01, "regeneracja nie oddaje węgli");
  L.meals.filter(m => !m.past).forEach(m => assert.ok(m.kcal >= (m.kind === "main" ? b.minMain : M.K.SNACK_MIN) - 1));
  const got = sum(L.meals, "kcal") + 4 * L.intra;
  assert.ok(Math.abs(got - L.live.unabsorbed - b.target) < 10);
});

test("przeliczenie wieczorem bez kolejnych posiłków: komunikat o brakujących kcal", () => {
  const { a, b } = liveCase(2400, 23 * 60);
  const L = M.liveAdjust(a, b, 23 * 60, V.mass);
  assert.equal(L.live.noFuture, true);
  assert.ok(L.live.unabsorbed < 0);
});

test("kontrola wpisu: kcal niezgodne z makro albo ponad 1,8 × planu", () => {
  assert.equal(M.dayCheck({ kcalConsumed: 2400, protein: 140, carbohydrates: 300, fatTotal: 70 }, 2500).length, 0);
  assert.equal(M.dayCheck({ kcalConsumed: 4800, protein: 140, carbohydrates: 300, fatTotal: 70 }, 2500).length, 2);
  assert.equal(M.dayCheck({ kcalConsumed: 3000 }, 2500).length, 0);
});

test("trend masy: regresja liniowa", () => {
  const pts = Array.from({ length: 10 }, (_, i) => ({ day: i * 2, w: 72 - 0.05 * i * 2 + (i % 2 ? 0.2 : -0.2) }));
  assert.ok(Math.abs(M.weightSlope(pts) + 0.05) < 0.03);
});


test("dopasowanie aktywności: tylko paired_event_id z Intervals", () => {
  const plan18 = [{ id: "10", type: "Ride", start: 18 * 60 }];
  const a = (h, o = {}) => ({ id: 1, type: "Ride", start_date_local: `2026-11-19T${h}:00:00`, ...o });
  assert.equal(M.matchActivity(a("08"), plan18), -1, "poranny dojazd bez parowania jest poza planem");
  assert.equal(M.matchActivity(a("18"), plan18), -1, "nawet o tej samej porze bez parowania");
  assert.equal(M.matchActivity(a("08", { paired_event_id: 10 }), plan18), 0, "sparowane w Intervals: zawsze");
  assert.equal(M.matchActivity(a("18", { paired_event_id: 10 }), plan18, new Set([0])), -1, "trening już wykonany");
});

test("przeliczenie: posiłek, którego nie było w planie, a jego pora minęła, nie liczy się jako zjedzony", () => {
  const ev = ride(30, [step(90, 70)]);
  const planned = sess(ev, 18 * 60);
  const extra = { ...M.analyzeActivity(act({ id: 31, start_date_local: "2026-11-19T08:00:00", moving_time: 3600, icu_joules: 600000 }), cfg), off: false };
  const a = plan([planned]), b = plan([extra, planned]);
  const L = M.liveAdjust(a, b, 17 * 60, V.mass);
  const pastK = sum(L.meals.filter(m => m.past), "kcal"), pastA = sum(a.meals.filter(m => m.t <= 17 * 60), "kcal");
  assert.ok(Math.abs(pastK - pastA) < 1, "minione = to, co było w planie");
  assert.ok(sum(L.meals.filter(m => !m.past), "kcal") > sum(a.meals.filter(m => m.t > 17 * 60), "kcal"), "dodatkowa energia trafia do reszty dnia");
});

// ---------- Deficyt w rytmie treningu (spec 2026-11-19) ----------
const gym = (id) => ({ id, type: "WeightTraining", category: "WORKOUT", name: "Siłownia", moving_time: 3600 });
const run = (id, extra = {}) => ({ id, type: "Run", category: "WORKOUT", name: "Bieg", moving_time: 3600, ...extra });

test("intensywność dnia", () => {
  assert.equal(M.dayIntensity([]), "rest");
  assert.equal(M.dayIntensity([sess(ride(40, [step(60, 60)]), 600)]), "low");
  assert.equal(M.dayIntensity([sess(ride(41, [step(90, 65)]), 600)]), "mid");
  assert.equal(M.dayIntensity([{ ...M.analyzeSession(gym(42), cfg), start: 600 }]), "mid");
  const hard = sess(ride(43, [step(15, 55), { reps: 4, steps: [step(5, 110), step(3, 50)] }, step(15, 55)]), 1080);
  assert.equal(M.dayIntensity([hard]), "high");
  assert.equal(M.dayIntensity([sess(ride(44, [step(60, 60)]), 420), hard]), "high");
});

test("bieg zaplanowany: dystans × masa, bez dystansu prędkość z historii", () => {
  const h = 1, net = km => 70 * km - M.K.MAINT_KCAL_H * h;
  assert.ok(Math.abs(M.analyzeSession(run(50, { distance: 10000 }), { ...cfg, mass: 70 }).kcal - net(10)) < 0.01);
  assert.ok(Math.abs(M.analyzeSession(run(51), { ...cfg, mass: 70, runSpeed: 12 }).kcal - net(12)) < 0.01);
  assert.ok(Math.abs(M.analyzeSession(run(52), { ...cfg, mass: 70 }).kcal - net(10)) < 0.01);
});

test("deficyt w dzień luźny: wchodzi, maks. 30% posiłku, regeneracja i posiłek przed bez zmian", () => {
  const s = sess(ride(60, [step(60, 60)]), 17 * 60);
  const a = plan([s]), b = plan([s], { deficit: 200 });
  assert.ok(b.def > 150, "deficyt " + b.def);
  b.meals.forEach((m, i) => {
    const o = a.meals[i];
    if (["pre", "presnack", "recovery"].includes(m.role) || m.code === "H") assert.ok(Math.abs(o.kcal - m.kcal) < 0.5, m.name + " bez zmian");
    assert.ok(m.kcal >= 0.7 * o.kcal - 0.5, m.name + " maks. 30%");
    if (m.cut) assert.ok(m.kcal >= minCut(b, m) - 1, m.name + " nad minimum");
  });
});

test("dwa posiłki przed mocnym treningiem bez cięcia", () => {
  const hard = sess(ride(61, [step(15, 55), { reps: 4, steps: [step(5, 110), step(3, 50)] }, step(15, 55)]), 18 * 60);
  const a = plan([hard]), b = plan([hard], { deficit: 300 });
  const before = a.meals.filter(m => m.t < hard.start && m.role !== "recovery").slice(-2);
  before.forEach(o => { const m = b.meals.find(x => x.t === o.t); assert.ok(Math.abs(o.kcal - m.kcal) < 0.5, o.name); });
});

test("A+: tylko ostatni posiłek, gdy min. 4 h po regeneracji", () => {
  const hard = sess(ride(62, [step(15, 55), { reps: 4, steps: [step(5, 110), step(3, 50)] }, step(15, 55)]), 7 * 60);
  const a = plan([hard]), b = plan([hard], { deficit: 150, aplus: true });
  const last = b.meals[b.meals.length - 1];
  assert.ok(last.cut && b.def > 50);
  b.meals.slice(0, -1).forEach((m, i) => assert.ok(Math.abs(a.meals[i].kcal - m.kcal) < 0.5));
  const eve = sess(ride(63, [step(60, 90)]), 18 * 60);
  assert.equal(plan([eve], { deficit: 150, aplus: true }).def, 0, "trening wieczorem: brak miejsca na A+");
});

test("próg dostępności energii ogranicza deficyt", () => {
  const p = plan([], { deficit: 400, eaMin: V.base - 100 });
  assert.ok(p.def <= 100.5); assert.equal(p.cutLimit, "ea");
});

test("przeliczenie: kafelki = cel dnia, brakujące makro bez kolejnych posiłków", () => {
  const { a, b } = liveCase(2400, 23 * 60);
  const L = M.liveAdjust(a, b, 23 * 60, V.mass);
  assert.ok(Math.abs(L.cT - b.cT) < 0.01 && Math.abs(L.pT - b.pT) < 0.01 && Math.abs(L.fT - b.fT) < 0.01);
  assert.ok(L.live.missing.kcal > 0 && L.live.missing.c > 0);
});
