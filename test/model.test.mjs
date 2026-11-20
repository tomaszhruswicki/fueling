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

// ---------- Deficyt v2 (spec 2026-11-20): przypadki z punktu 6, dane syntetyczne ----------
const DESK = 2430, MASS = 74, LIM = M.cutLimits(500);
const V2 = { ...V, base: DESK, mass: MASS, floor: 1950 };
const dayV2 = (sessions, base, extra = {}) => {
  const act = sessions.filter(s => !s.off), type = extra.type || M.dayIntensity(act);
  const c = M.dayDeficit({ desk: DESK, full: base + sum(act, "kcal"), type, lim: LIM, floor: V2.floor });
  const p = M.planDay({ sessions }, { settings: { ...V2, base }, times: null, deficit: c.want, aplus: type === "aplus", eaMin: Math.round(30 * 0.85 * MASS), walks: extra.walks });
  return { c, p };
};
const cfg74 = { ...cfg, mass: MASS };

test("v2 dzień wolny ze spacerem: jedzenie prawie jak bez spaceru, deficyt maks. 300", () => {
  const a = dayV2([], DESK), b = dayV2([], DESK + 200);
  assert.equal(a.c.want, 150); assert.ok(Math.abs(a.p.target - 2280) < 1);
  assert.equal(b.c.want, 300); assert.ok(b.p.target - a.p.target <= 50.5, "spacer +200 podnosi jedzenie najwyżej o 50");
});

test("v2 19.11 wędrówka 3 h: jedzenie ok. 2600, deficyt 300, posiłek przed i po wędrówce bez cięcia", () => {
  const walk = { start: 10 * 60, durMin: 180 };
  const { c, p } = dayV2([], DESK + 470, { walks: [walk] });
  assert.equal(c.want, 300); assert.ok(Math.abs(p.target - 2600) < 1); assert.ok(p.def > 299);
  const before = p.meals.filter(m => m.t <= walk.start).slice(-1)[0], after = p.meals.find(m => m.t >= walk.start + walk.durMin);
  assert.ok(!before.cut && !after.cut);
  const short = dayV2([], DESK + 470, { walks: [{ start: 10 * 60, durMin: 60 }] });
  assert.ok(short.p.meals.filter(m => m.cut).length > 2, "krótki spacer nie chroni posiłków");
});

test("v2 luźna jazda 60 min: maks. deficyt 500, posiłki przy treningu bez zmian", () => {
  const s = sess(ride(70, [step(60, 62)]), 17 * 60);
  const { c, p } = dayV2([s], DESK), zero = M.planDay({ sessions: [s] }, { settings: V2, times: null });
  assert.equal(c.want, 500); assert.equal(c.food, DESK + s.kcal - 500);
  assert.ok(p.def > 400 && p.def <= 500.5);
  for (const role of ["pre", "recovery"]) { const x = zero.meals.find(m => m.role === role), y = p.meals.find(m => m.role === role); assert.ok(Math.abs(x.kcal - y.kcal) < 0.5, role); }
  assert.ok(!p.low, "węgle w zakresie dnia mimo deficytu");
});

test("v2 siłownia 60 min: deficyt 250, posiłki przy treningu nie przejmują energii dnia", () => {
  const g = { ...M.analyzeSession(gym(71), cfg74), start: 17 * 60 };
  const { c, p } = dayV2([g], DESK - 30);
  assert.equal(c.want, 250); assert.ok(Math.abs(p.target - (DESK - 30 + g.kcal - 250)) < 1);
  const tr = p.meals.filter(m => ["pre", "recovery"].includes(m.role)), rest = p.meals.filter(m => !["pre", "presnack", "recovery"].includes(m.role));
  tr.forEach(m => assert.ok(m.kcal < 750, m.name + " " + Math.round(m.kcal)));
  rest.forEach(m => assert.ok(m.kcal > 450, m.name + " " + Math.round(m.kcal)));
  tr.forEach(m => assert.ok(m.c <= 1.6 * MASS, m.name + " węgle " + Math.round(m.c)));
});

test("v2 mocna niedziela: bez deficytu poza A+, kroki mocnego dnia 75% średniej", () => {
  const hard = sess(ride(72, [step(20, 60), { reps: 5, steps: [step(5, 110), step(5, 50)] }, step(60, 70)]), 9 * 60);
  const full = DESK + hard.kcal;
  assert.equal(M.dayDeficit({ desk: DESK, full, type: "high", lim: LIM }).want, 0);
  const ap = M.dayDeficit({ desk: DESK, full, type: "aplus", lim: LIM });
  assert.equal(ap.want, LIM.rest, "A+: limit dnia wolnego");
  const rows = [...Array(10)].map((_, i) => ({ steps: 10000, type: i < 7 ? "rest" : "low" })).concat([{ steps: 5000, type: "high" }]);
  const pr = M.stepsByType(rows);
  assert.ok(Math.abs(pr.high - 0.75 * pr.all) < 0.01, "za mało mocnych dni: 75% średniej");
  assert.ok(Math.abs(pr.mid - 0.9 * pr.all) < 0.01);
  assert.equal(pr.rest, 10000); assert.equal(pr.low, 10000);
  const pr2 = M.stepsByType(rows.concat([{ steps: 6000, type: "high" }, { steps: 7000, type: "high" }]));
  assert.equal(pr2.high, 6000, "min. 3 mocne dni: ich średnia");
});

test("v2 brak kroków w wellness: 7000 jako średnia, mocny 75%, średni 90%", () => {
  const pr = M.stepsByType([]);
  assert.equal(pr.measured, false); assert.equal(pr.all, 7000);
  assert.equal(pr.high, 5250); assert.equal(pr.mid, 6300); assert.equal(pr.rest, 7000);
  assert.equal(M.stepsByType([{ steps: 9000, type: "rest" }, { steps: 0, type: "rest" }]).all, 7000, "mniej niż 3 dni: domyślne");
});

test("v2 limity: punkty suwaka według tabeli, między nimi liniowo, Zmęczenie, minimum dnia wolnego", () => {
  const pick = L => [L.rest, L.low, L.mid];
  assert.deepEqual(pick(M.cutLimits(400)), [250, 400, 200]);
  assert.deepEqual(pick(M.cutLimits(500)), [300, 500, 250]);
  assert.deepEqual(pick(M.cutLimits(600)), [350, 600, 300]);
  assert.deepEqual(pick(M.cutLimits(450)), [280, 450, 230]);
  assert.deepEqual(pick(M.cutLimits(250)), [160, 250, 130], "rekompozycja: poniżej lekkiego proporcjonalnie");
  assert.deepEqual(pick(M.cutLimits(0)), [0, 0, 0]);
  assert.equal(M.cutLimits(500).label, "Umiarkowany"); assert.equal(M.cutLimits(450).label, "Własny (450)");
  assert.equal(M.dayDeficit({ desk: DESK, full: DESK + 600, type: "low", lim: M.cutLimits(0) }).want, 0, "utrzymanie");
  assert.equal(M.dayDeficit({ desk: DESK, full: DESK + 600, type: "low", lim: LIM, tired: true }).want, 150);
  assert.equal(M.dayDeficit({ desk: DESK, full: DESK, type: "mid", lim: LIM }).want, 0, "średni: bez deficytu bazowego");
  const f = M.dayDeficit({ desk: 2000, full: 2100, type: "rest", lim: LIM, floor: 2000 });
  assert.equal(f.want, 100); assert.ok(f.floorHit);
});

test("v2 dwa kolejne małe posiłki: przekąska 150–250 i większy posiłek bliżej treningu", () => {
  const kc = m => 4 * m.p + 4 * m.c + 9 * m.f;
  const mk = (t, name) => { const m = { t, name, role: "meal", kind: "main", code: "L", p: 30, c: 40, f: 12, ml: 450 }; m.kcal = kc(m); return m; };
  const meals = [mk(420, "Śniadanie"), mk(660, "II śniadanie"), { t: 900, role: "pre", kind: "main", p: 40, c: 100, f: 10, ml: 450, name: "Obiad przed treningiem" }];
  meals[2].kcal = kc(meals[2]);
  const tot = meals[0].kcal + meals[1].kcal;
  M.mergeSmall(meals, [{ start: 1080 }], kc);
  assert.equal(meals[0].kind, "snack"); assert.ok(meals[0].kcal >= 150 && meals[0].kcal <= 250);
  assert.ok(Math.abs(meals[0].kcal + meals[1].kcal - tot) < 0.5, "energia zachowana");
  const dinner = [mk(900, "Posiłek"), mk(1140, "Kolacja")];
  M.mergeSmall(dinner, [], kc);
  assert.equal(dinner[0].kind, "snack", "bez treningu większa zostaje kolacja");
});

test("suwak: deficyt rośnie z wartością, dzień wolny w rekompozycji maks. 160", () => {
  let prev = -1;
  for (let x = 0; x <= 600; x += 50) { const w = M.dayDeficit({ desk: DESK, full: DESK + 500, type: "low", lim: M.cutLimits(x) }).want; assert.ok(w >= prev); prev = w; }
  assert.equal(M.dayDeficit({ desk: DESK, full: DESK + 300, type: "rest", lim: M.cutLimits(250) }).want, 160);
});

// ---------- Budowa (nadwyżka) ----------
test("budowa: udziały typu dnia", () => {
  assert.equal(M.gainFor({ gain: 200, type: "mid", gym: true }), 200);
  assert.equal(M.gainFor({ gain: 200, type: "rest", afterGym: true }), 100);
  assert.equal(M.gainFor({ gain: 300, type: "high" }), 150);
  assert.equal(M.gainFor({ gain: 300, type: "low" }), 80);
  assert.equal(M.gainFor({ gain: 200, type: "rest" }), 0);
  assert.equal(M.gainFor({ gain: 0, type: "mid", gym: true }), 0);
});

test("budowa: siłownia +300 w regeneracji i następnym posiłku, przekąska przed snem 30–40 g białka", () => {
  const g = { ...M.analyzeSession(gym(80), cfg74), start: 12 * 60 };
  const ctx = { settings: V2, times: null };
  const a = M.planDay({ sessions: [g] }, ctx), b = M.planDay({ sessions: [g] }, { ...ctx, gain: 300, bedtime: true });
  assert.ok(Math.abs(b.target - a.target - 300) < 2, "cel +300");
  assert.ok(b.meals.find(m => m.role === "recovery").gain, "reszta w regeneracji");
  assert.ok(Math.abs(sum(b.meals, "kcal") + 4 * b.intra - b.target) < 2, "posiłki = cel");
  const bed = b.meals.find(m => m.role === "bedtime");
  assert.ok(bed && bed.p >= 30 && bed.p <= 40 && bed.t > b.meals[b.meals.length - 2].t);
  const rec = b.meals.find(m => m.role === "recovery");
  assert.ok(rec.p >= 0.4 * MASS - 0.5);
  const ra = a.meals.find(m => m.role === "recovery"); assert.ok(rec.c > ra.c, "więcej węgli w regeneracji");
  assert.ok(b.fT - a.fT < 5, "nadwyżka nie idzie w tłuszcz");
  a.meals.filter(m => m.role !== "recovery").forEach(o => { const m = b.meals.find(x => x.t === o.t); assert.ok(m.p >= o.p - 0.5, o.name + " bez utraty białka"); });
});

test("budowa: dzień po siłowni bez treningu, nadwyżka w dwóch pierwszych posiłkach, bez przekąski", () => {
  const ctx = { settings: V2, times: null };
  const a = M.planDay({ sessions: [] }, ctx), b = M.planDay({ sessions: [] }, { ...ctx, gain: 100 });
  assert.ok(Math.abs(b.target - a.target - 100) < 2);
  assert.ok(!b.meals.some(m => m.role === "bedtime"));
  assert.deepEqual(b.meals.map(m => !!m.gain), [true, true, false, false]);
});

test("B4: siłownia z masy (MET 5 minus utrzymanie), z historii gdy jest, wykonana z kalorii urządzenia", () => {
  const gym = { id: "g", type: "WeightTraining", category: "WORKOUT", name: "Siłownia", moving_time: 3600 };
  assert.equal(Math.round(M.analyzeSession(gym, { ...cfg, mass: 60 }).kcal), 5 * 60 - 90);
  assert.equal(Math.round(M.analyzeSession(gym, { ...cfg, mass: 90 }).kcal), 5 * 90 - 90);
  assert.equal(Math.round(M.analyzeSession(gym, { ...cfg, mass: 90, gymKcalH: 250 }).kcal), 250);
  const act = { id: 1, type: "WeightTraining", moving_time: 3600, start_date_local: "2026-11-20T10:00:00" };
  assert.equal(Math.round(M.analyzeActivity({ ...act, calories: 400 }, { ...cfg, mass: 80 }).kcal), 310);
  assert.equal(Math.round(M.analyzeActivity(act, { ...cfg, mass: 80 }).kcal), 310);
});

test("C3: test potu liczy l/h i sprowadza do 70% FTP, odrzuca krótkie i nierealne", () => {
  const t = M.sweatTest({ pre: 72.0, post: 71.0, ml: 500, durSec: 5400, rel: 0.7 });
  assert.equal(t.rate, 1);
  assert.equal(t.norm, 1);
  assert.equal(M.sweatTest({ pre: 72, post: 71.2, ml: 0, durSec: 3600, rel: 0.85 }).norm, Math.round(0.8 / 1.15 * 100) / 100);
  assert.ok(M.sweatTest({ pre: 72, post: 71, ml: 0, durSec: 1800, rel: 0.7 }).error);
  assert.ok(M.sweatTest({ pre: 72, post: 68, ml: 0, durSec: 3600, rel: 0.7 }).error);
});

test("C3: profil potu z mediany, brakujący rodzaj z 1,25, trenażer używa własnej wartości", () => {
  assert.equal(M.sweatProfile([]), null);
  const p = M.sweatProfile([{ date: "2026-11-01", norm: 0.8 }, { date: "2026-11-05", norm: 1.0 }, { date: "2026-11-09", norm: 1.2 }]);
  assert.equal(p.out, 1); assert.equal(p.in, 1.25); assert.equal(p.nIn, 0);
  const q = M.sweatProfile([{ date: "2026-11-01", norm: 0.8 }, { date: "2026-11-02", norm: 1.5, indoor: true }]);
  assert.equal(q.out, 0.8); assert.equal(q.in, 1.5);
  const ev = ride(90, [step(90, 70)], { type: "VirtualRide" });
  const a = M.analyzeSession(ev, { ...cfg, sweat: 0.8 }), b = M.analyzeSession(ev, { ...cfg, sweat: 0.8, sweatIn: 1.5 });
  assert.equal(a.sweatLoss, Math.round(0.8 * 1.25 * 1.5 * 1000));
  assert.equal(b.sweatLoss, Math.round(1.5 * 1.5 * 1000));
});
