// fueling: model obliczeń. Bez DOM, testowalny w Node.
// Zasady: energia z pracy mechanicznej (kJ ≈ kcal wydatku), udział węglowodanów zależny od %FTP każdego kroku,
// węgle dopasowane do pracy (fuel for the work required, Impey i in. 2018), kodowanie posiłków LOW/MEDIUM/HIGH.

// Stałe modelu w jednym miejscu. Zmiana tutaj zmienia cały model.
export const K = {
  HARD: 0.88,          // próg „mocno” (%FTP): minuty liczone do węgli przed treningiem i krótkiej podaży
  VO2: 1.05,           // próg VO2max (%FTP)
  MAINT_KCAL_H: 90,    // część wydatku na treningu już zawarta w utrzymaniu (kcal/h)
  GYM_MET: 5.0,        // siłownia bez historii: MET × masa × h (Compendium 2024, trening oporowy intensywny)
  OTHER_MET: 5.0,      // inne aktywności: MET × masa × h
  SWEAT_MIN_MIN: 45,   // test potu: min. 45 min jazdy lub biegu
  INDOOR_SWEAT: 1.25,  // trenażer pocimy się mocniej niż na zewnątrz, gdy brak testów na trenażerze
  RUN_KCAL_KG_KM: 1.0, // bieg: koszt na km prawie niezależny od tempa (kcal/kg/km)
  RUN_KMH: 10,         // prędkość biegu, gdy brak dystansu w planie i biegów w historii
  FLUID_ML_KG: 35,     // płyny dzienne poza treningiem (ml/kg)
  PRE_ML_KG: 6,        // płyny w posiłku przed treningiem, ACSM 5–7 ml/kg
  REHYDRATE: 1.5,      // po treningu 150% niedoboru płynów (ACSM)
  KCAL_PER_KG: 7700,   // energia 1 kg masy ciała przy kalibracji
  SNACK_MIN: 150,      // minimum przekąski (kcal)
  MIN_ACT_SEC: 600,    // aktywność krótsza niż 10 min nie zmienia planu
  SMALL_MAIN: 450,     // dwa kolejne posiłki główne poniżej tego: jeden staje się przekąską
  SNACK_MAX: 250,      // przekąska z połączenia dwóch małych posiłków: 150–250 kcal
  WALK_GUARD_MIN: 90,  // spacer lub wędrówka od 90 min chroni posiłek przed i po
  STEP_MIN_DAYS: 3,    // min. dni danego typu z krokami, inaczej udział średniej ogólnej
};

// ---------- Deficyt (spec 2026-11-20) ----------
// Jedzenie dnia = większa z wartości: dzień przy biurku − deficyt bazowy albo pełny wydatek − maks. deficyt typu dnia.
// Każdy dzień od zera, bez przenoszenia. Dzień mocny: tylko A+ (ostatni posiłek) z limitem dnia wolnego.
export const CUT_BASE = { rest: 150, low: 150, mid: 0, high: 0 };
export const CUT_LEVELS = {
  light: { label: "Lekki", rest: 250, low: 400, mid: 200 },
  mid: { label: "Umiarkowany", rest: 300, low: 500, mid: 250 },
  strong: { label: "Mocny", rest: 350, low: 600, mid: 300 },
};
// Suwak: maks. deficyt dnia luźnego 0–600 kcal. Na punktach 400/500/600 limity z tabeli Tomasza, między nimi
// liniowo, poniżej 400 proporcjonalnie do poziomu lekkiego. 0 = utrzymanie.
export const CUT_MAX = 600, CUT_STEP = 50;
// Punkty suwaka bilansu (−600 … +300): ujemne = maks. deficyt dnia luźnego, dodatnie = nadwyżka dnia z siłownią.
export const CUT_PRESETS = [
  { key: "strong", label: "Mocny", low: 600, bal: -600 },
  { key: "mid", label: "Umiarkowany", low: 500, bal: -500 },
  { key: "light", label: "Lekki", low: 400, bal: -400 },
  { key: "recomp", label: "Rekompozycja", low: 250, bal: -250, recomp: true },
  { key: "maint", label: "Utrzymanie", low: 0, bal: 0 },
  { key: "gain", label: "Budowa", bal: 200 },
  { key: "gain2", label: "Budowa+", bal: 300 },
];
export const GAIN_MAX = 300, GAIN_MIN_PROT = 2.0, REC_PROT_KG = 0.4;
// Budowa (spec 2026-11-20, nadwyżka): wartość suwaka = nadwyżka dnia z siłownią; inne dni ułamek.
export const GAIN_SHARE = { gym: 1, afterGym: 0.5, high: 0.5, mid: 0.25, low: 0.25, rest: 0 };
export function gainFor({ gain, type, gym, afterGym }) {
  if (!(gain > 0)) return 0;
  const f = Math.max(gym ? GAIN_SHARE.gym : 0, afterGym ? GAIN_SHARE.afterGym : 0, GAIN_SHARE[type] || 0);
  return Math.round(gain * f / 10) * 10;
}
export const RECOMP_PROT = 2.2; // g/kg, minimum białka w rekompozycji (Helms i in. 2014)
export function cutLimits(lowMax) {
  const x = Math.max(0, Math.min(CUT_MAX, +lowMax || 0)), r = n => Math.round(n / 10) * 10;
  const A = [{ low: 0, rest: 0, mid: 0 }, CUT_LEVELS.light, CUT_LEVELS.mid, CUT_LEVELS.strong];
  let i = 1; while (i < A.length - 1 && x > A[i].low) i++;
  const lo = A[i - 1], hi = A[i], t = (x - lo.low) / (hi.low - lo.low);
  const p = CUT_PRESETS.find(q => q.bal === -x && !q.recomp);
  return { label: p ? p.label : `Własny (${x})`, low: x, rest: r(lo.rest + (hi.rest - lo.rest) * t), mid: r(lo.mid + (hi.mid - lo.mid) * t), high: 0 };
}
// type: rest | low | mid | high | aplus. desk: utrzymanie dnia przy biurku (średnie kroki dni wolnych),
// full: utrzymanie z krokami dnia + trening. floor: minimum dnia wolnego (RMR × 1,15).
export function dayDeficit({ desk, full, type, lim, tired = false, floor = 0 }) {
  const t = type === "aplus" ? "rest" : type;
  let bd = CUT_BASE[t] || 0, md = lim[t] || 0;
  if (tired) { bd /= 2; md = Math.min(150, md / 2); }
  let want = Math.max(0, Math.min(full - desk + bd, md));
  let floorHit = false;
  if (t === "rest" && type !== "aplus" && floor && full - want < floor) { want = Math.max(0, full - floor); floorHit = true; }
  return { want, food: full - want, bd, md, desk, full, floorHit };
}

// ---------- Kroki według typu dnia ----------
// rows: [{steps, type}] z 28 dni. Średnia typu z min. 3 dni, inaczej mocny 75%, średni 90%, luźny i wolny 100% średniej ogólnej.
export const STEP_FALLBACK = { high: 0.75, mid: 0.9, low: 1, rest: 1 };
export function stepsByType(rows, def = 7000) {
  const ok = (rows || []).filter(r => r.steps > 0), avg = a => a.reduce((s, r) => s + r.steps, 0) / a.length;
  const all = ok.length >= K.STEP_MIN_DAYS ? avg(ok) : def;
  const out = { all, measured: ok.length >= K.STEP_MIN_DAYS, n: {}, fb: {} };
  for (const t of ["rest", "low", "mid", "high"]) {
    const a = ok.filter(r => r.type === t); out.n[t] = a.length;
    if (a.length >= K.STEP_MIN_DAYS) { out[t] = avg(a); out.fb[t] = false; } else { out[t] = all * STEP_FALLBACK[t]; out.fb[t] = true; }
  }
  return out;
}

export const RIDES = new Set(["Ride", "VirtualRide", "MountainBikeRide", "GravelRide", "EBikeRide", "TrackRide", "Cyclocross", "Velomobile"]);
const RUNS = new Set(["Run", "VirtualRun", "TrailRun"]);

// Udział energii z węglowodanów w funkcji %FTP (przybliżenie danych kalorymetrii pośredniej u wytrenowanych kolarzy).
const CHO_CURVE = [[0.3, 0.30], [0.5, 0.45], [0.6, 0.55], [0.7, 0.65], [0.8, 0.77], [0.9, 0.87], [1.0, 0.95], [1.1, 1.0]];
export function choFraction(p) {
  if (p <= CHO_CURVE[0][0]) return CHO_CURVE[0][1];
  for (let i = 1; i < CHO_CURVE.length; i++) {
    const [x1, y1] = CHO_CURVE[i];
    if (p <= x1) { const [x0, y0] = CHO_CURVE[i - 1]; return y0 + (y1 - y0) * (p - x0) / (x1 - x0); }
  }
  return 1;
}

// %LTHR -> %FTP, gdy krok ma cel tętna zamiast mocy (przybliżenie).
const HR_CURVE = [[0.6, 0.40], [0.7, 0.52], [0.8, 0.66], [0.9, 0.82], [0.95, 0.90], [1.0, 1.0], [1.05, 1.08]];
function interp(curve, x) {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) if (x <= curve[i][0]) { const [a, b] = curve[i - 1], [c, d] = curve[i]; return b + (d - b) * (x - a) / (c - a); }
  return curve[curve.length - 1][1];
}

function mid(t) { if (t == null) return null; if (t.value != null) return +t.value; if (t.start != null && t.end != null) return (+t.start + +t.end) / 2; if (t.start != null) return +t.start; if (t.end != null) return +t.end; return null; }

function stepWatts(s, ftp, zones) {
  const p = s.power;
  if (p) {
    const v = mid(p);
    if (v != null) {
      if (p.units === "w") return v;
      if (p.units === "%ftp") return v * ftp / 100;
      if (p.units === "power_zone" && zones && zones.length) {
        const z = Math.max(1, Math.min(zones.length, Math.round(v)));
        const hi = Math.min(zones[z - 1], 160), lo = z > 1 ? zones[z - 2] : 40;
        return (lo + hi) / 2 * ftp / 100;
      }
    }
  }
  const h = s.hr;
  if (h) {
    const v = mid(h);
    if (v != null && (h.units === "%lthr" || h.units === "%hr")) {
      const frac = h.units === "%hr" ? v / 100 / 0.92 : v / 100; // %HRmax ≈ /0.92 do %LTHR
      return interp(HR_CURVE, frac) * ftp;
    }
  }
  return null;
}

// Spłaszcza kroki (z powtórzeniami) do listy odcinków {dur, w}.
export function flattenSteps(steps, ftp, zones, fallbackW) {
  const out = [];
  const walk = list => {
    for (const s of list || []) {
      if (s.steps && s.steps.length) { const n = Math.max(1, s.reps || 1); for (let i = 0; i < n; i++) walk(s.steps); continue; }
      const dur = +s.duration || 0;
      if (dur <= 0) continue;
      let w = stepWatts(s, ftp, zones);
      if (w == null) w = fallbackW;
      out.push({ dur, w: Math.max(0, w) });
    }
  };
  walk(steps);
  return out;
}

// Plan jedzenia w trakcie jazdy w 30-minutowych odcinkach. Podaż wyprzedza wysiłek (średnia z bieżącego i kolejnego odcinka).
export function fuelBlocks(segs, ftp, totalSec) {
  const B = 1800, n = Math.ceil(totalSec / B);
  const burn = new Array(n).fill(0), hard = new Array(n).fill(0);
  let t = 0;
  for (const s of segs) {
    let left = s.dur, cur = t;
    const kcalPerSec = s.w / 1000, f = choFraction(s.w / ftp);
    while (left > 0) {
      const b = Math.min(n - 1, Math.floor(cur / B)), room = Math.min(left, (b + 1) * B - cur);
      burn[b] += kcalPerSec * room * f / 4;
      if (s.w / ftp >= K.HARD) hard[b] += room;
      cur += room; left -= room;
    }
    t += s.dur;
  }
  const hardTotal = hard.reduce((a, x) => a + x, 0);
  const short = totalSec <= 65 * 60, mid90 = totalSec <= 90 * 60;
  // Krótko i ciężko (45–65 min, min. 10 min ≥ 88% FTP): ok. 30 g/h, głównie przed i w trakcie części mocnej.
  if (short && totalSec >= 45 * 60 && hardTotal >= 600) {
    return burn.map((g, i) => { const len = Math.min(B, totalSec - i * B); return { from: i * 30, to: Math.round((i * B + len) / 60), burn: Math.round(g), hardMin: Math.round(hard[i] / 60), intake: Math.round(15 * len / B / 5) * 5 }; });
  }
  const cap = mid90 ? 30 : 45; // g na 30 min: 60 g/h do 90 min, potem do 90 g/h
  const blocks = burn.map((g, i) => {
    const len = Math.min(B, totalSec - i * B);
    const ahead = i + 1 < n ? burn[i + 1] * B / Math.max(1, Math.min(B, totalSec - (i + 1) * B)) : g * B / len;
    let intake = short ? 0 : 0.5 * (g * B / len + ahead) / 2;
    if (i === 0) intake *= 0.6;              // start jedzenia ok. 15. minuty
    intake = Math.min(cap, intake) * len / B;
    intake = Math.round(intake / 5) * 5;
    return { from: i * 30, to: Math.round((i * B + len) / 60), burn: Math.round(g), hardMin: Math.round(hard[i] / 60), intake };
  });
  // Długie jazdy: minimum 40 g/h, żeby nie zostawić pustych odcinków przy lekkim tlenie.
  if (totalSec > 90 * 60) blocks.forEach((b, i) => { if (i > 0) b.intake = Math.max(b.intake, Math.round(20 * (b.to - b.from) / 30 / 5) * 5); });
  return blocks;
}

// Dystans biegu z planu (km): pole distance treningu albo workout_doc; bez niego czas × prędkość z historii (cfg.runSpeed).
export function runKm(ev, cfg, durSec) {
  const m = +ev.distance || +(ev.workout_doc || {}).distance || 0;
  return m > 0 ? m / 1000 : durSec / 3600 * (cfg.runSpeed || K.RUN_KMH);
}

// Intensywność dnia według najmocniejszej jednostki: mocny (jakość, długo, start), średni, luźny, wolny.
export function dayIntensity(act) {
  if (!act.length) return "rest";
  if (act.some(s => s.high || s.long || s.prio || s.race)) return "high";
  if (act.some(s => s.gym || s.run || (s.ride && (s.durSec >= 75 * 60 || Math.max(s.ifp || 0, s.rel || 0) >= 0.65)))) return "mid";
  return "low";
}

// Wydatek netto (ponad utrzymanie) na godzinę siłowni i innych aktywności. cfg.gymKcalH: z historii (calc.js).
export const gymKcalH = cfg => cfg.gymKcalH || Math.max(0, K.GYM_MET * (cfg.mass || 72) - K.MAINT_KCAL_H);
export const otherKcalH = cfg => Math.max(0, K.OTHER_MET * (cfg.mass || 72) - K.MAINT_KCAL_H);

// Analiza jednej jednostki z kalendarza.
export function analyzeSession(ev, cfg) {
  const ftp = cfg.ftp || 250, zones = cfg.zones;
  const type = ev.type || "Other";
  const wd = ev.workout_doc || {};
  const ifp = ev.icu_intensity ? ev.icu_intensity / 100 : null;
  let durSec = +wd.duration || +ev.moving_time || 0;
  const base = { id: String(ev.id), name: ev.name || type, type, race: /^RACE/.test(ev.category || ""), durSec, ifp, assumed: false };

  if (RIDES.has(type) || type === "NordicSki" || type === "VirtualSki") {
    const fallbackW = wd.average_watts || (ifp ? ifp * ftp * 0.96 : 0.6 * ftp);
    let segs = flattenSteps(wd.steps, ftp, zones, fallbackW);
    let source = "kroki";
    if (!segs.length) {
      if (!durSec) { durSec = 90 * 60; base.assumed = true; }
      const w = wd.average_watts || (ifp ? ifp * ftp * 0.96 : (base.race ? 0.8 : 0.7) * ftp);
      segs = [{ dur: durSec, w }];
      source = wd.average_watts ? "średnia moc" : ifp ? "IF" : "założenie";
      if (!ifp && !wd.average_watts) base.assumed = true;
    }
    durSec = segs.reduce((a, s) => a + s.dur, 0);
    const kj = segs.reduce((a, s) => a + s.w * s.dur, 0) / 1000;
    const cho = segs.reduce((a, s) => a + s.w * s.dur / 1000 * choFraction(s.w / ftp) / 4, 0);
    const hardMin = segs.filter(s => s.w / ftp >= K.HARD).reduce((a, s) => a + s.dur, 0) / 60;
    const vo2Min = segs.filter(s => s.w / ftp >= K.VO2).reduce((a, s) => a + s.dur, 0) / 60;
    const blocks = fuelBlocks(segs, ftp, durSec);
    const prio = !!cfg.prio;
    if (prio && durSec > 65 * 60) {
      const cap = durSec <= 90 * 60 ? 30 : 45; // start lub trening priorytetowy: pełna podaż od ok. 15. minuty
      blocks.forEach((b, i) => { const len = b.to - b.from; b.intake = Math.round(cap * len / 30 * (i === 0 ? 0.6 : 1) / 5) * 5; });
    }
    const intra = blocks.reduce((a, b) => a + b.intake, 0);
    const h = durSec / 3600;
    const long = durSec >= 150 * 60;
    const high = prio || base.race || hardMin >= 12 || vo2Min >= 6 || kj >= 1800;
    const avgW = Math.round(kj * 1000 / Math.max(1, durSec));
    const s = {
      ...base, durSec, ride: true, source, segs, kj: Math.round(kj), cho: Math.round(cho), hardMin: Math.round(hardMin), vo2Min: Math.round(vo2Min),
      blocks, intra, gph: h ? Math.round(intra / h) : 0, avgW, rel: avgW / ftp, prio,
      kcal: kj - K.MAINT_KCAL_H * h, // kJ ≈ kcal wydatku, minus część już zawarta w utrzymaniu
      long, high, key: high || long, demand: high || long ? "high" : durSec >= 75 * 60 ? "mid" : "low",
    };
    return withFluids(s, cfg, ev.indoor || type === "VirtualRide", avgW / ftp);
  }
  if (!durSec) { durSec = 60 * 60; base.assumed = true; }
  const min = durSec / 60;
  if (type === "WeightTraining") return withFluids({ ...base, durSec, gym: true, kcal: gymKcalH(cfg) * min / 60, intra: 0, key: false, demand: "mid" }, cfg, true, 0.5);
  if (RUNS.has(type)) { const hi = !!cfg.prio || (ifp || 0) >= 0.85; const km = runKm(ev, cfg, durSec); return withFluids({ ...base, durSec, run: true, prio: !!cfg.prio, km, kcal: Math.max(0, (cfg.mass || 72) * km * K.RUN_KCAL_KG_KM - K.MAINT_KCAL_H * durSec / 3600), intra: min > 75 ? Math.round(40 * min / 60) : 0, key: hi || min >= 100, high: hi, demand: hi ? "high" : "mid" }, cfg, false, ifp || 0.7); }
  return withFluids({ ...base, durSec, kcal: otherKcalH(cfg) * min / 60, intra: 0, key: false, demand: "low" }, cfg, false, 0.5);
}

// Płyny i sód w trakcie. Pot: L/h dla ok. 70% FTP (na zewnątrz cfg.sweat, na trenażerze cfg.sweatIn albo × 1,25),
// korekta na intensywność. Wartości z testów potu (sweatProfile) albo z ustawień.
export const sweatIntensity = rel => rel < 0.6 ? 0.8 : rel > 0.8 ? 1.15 : 1;
export function withFluids(s, cfg, indoor, rel) {
  const ref = indoor ? cfg.sweatIn || (cfg.sweat || 0.9) * K.INDOOR_SWEAT : cfg.sweat || 0.9;
  const sweat = ref * sweatIntensity(rel) * (s.gym ? 0.6 : 1);
  const h = s.durSec / 3600;
  let mlh = Math.min(1000, sweat * 1000 * 0.75);
  if (s.durSec <= 60 * 60) mlh = Math.min(mlh, 600);
  mlh = Math.round(mlh / 50) * 50;
  const fluid = Math.round(mlh * h / 50) * 50;
  const na = s.durSec > 60 * 60 ? Math.round(mlh / 1000 * (cfg.sodium || 700) / 50) * 50 : 0;
  const loss = Math.max(0, sweat * 1000 * h - fluid); // niedobór do uzupełnienia po treningu
  if (s.blocks) s.blocks.forEach(b => { b.ml = Math.round(mlh * (b.to - b.from) / 60 / 50) * 50; });
  return { ...s, mlh, fluid, na, sweatLoss: Math.round(sweat * 1000 * h), deficitMl: Math.round(loss / 50) * 50, bottles: Math.round(fluid / 750 * 2) / 2, indoor: !!indoor };
}

// ---------- Test potu ----------
// Potliwość z ważenia przed i po (kg) i wypitych płynów (ml): (przed − po) + wypite, na godzinę.
// norm: wynik sprowadzony do ok. 70% FTP (jak ustawienie), żeby testy o różnej intensywności dało się uśrednić.
// Zwraca { rate, norm } albo { error }.
export function sweatTest({ pre, post, ml, durSec, rel }) {
  if (!(pre > 0 && post > 0)) return { error: "Wpisz wagę przed i po." };
  if (!(durSec >= K.SWEAT_MIN_MIN * 60)) return { error: `Test wymaga min. ${K.SWEAT_MIN_MIN} min aktywności.` };
  const h = durSec / 3600, rate = (pre - post + (ml || 0) / 1000) / h;
  if (rate < 0.2 || rate > 3.5) return { error: `Wychodzi ${Math.round(rate * 100) / 100} l/h, poza zakresem 0,2–3,5. Sprawdź wagi i płyny.` };
  return { rate: Math.round(rate * 100) / 100, norm: Math.round(rate / sweatIntensity(rel ?? 0.7) * 100) / 100 };
}
const median = xs => { const a = xs.slice().sort((x, y) => x - y), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; };
// Potliwość z testów: mediana osobno na zewnątrz i na trenażerze (ostatnie 6 każdego rodzaju).
// Brak testów jednego rodzaju: przeliczenie z drugiego przez 1,25. Brak testów: null (zostaje ustawienie).
export function sweatProfile(tests) {
  const last = f => (tests || []).filter(f).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 6).map(t => t.norm);
  const o = last(t => !t.indoor), i = last(t => t.indoor);
  if (!o.length && !i.length) return null;
  const r2 = x => Math.round(x * 100) / 100;
  const out = o.length ? median(o) : median(i) / K.INDOOR_SWEAT, inn = i.length ? median(i) : median(o) * K.INDOOR_SWEAT;
  return { out: r2(out), in: r2(inn), nOut: o.length, nIn: i.length };
}

// Krótki zapis struktury treningu, np. "10' 170–200 W · 4×(8' 300–310 W / 2' 130 W)".
export function stepSummary(steps, ftp) {
  const tgt = s => {
    const p = s.power; if (!p) return s.hr ? (mid(s.hr) + "% " + (s.hr.units === "%lthr" ? "LTHR" : "HR")) : "";
    const u = p.units === "%ftp" ? "%" : p.units === "w" ? " W" : p.units === "power_zone" ? "" : "";
    const pre = p.units === "power_zone" ? "Z" : "";
    if (p.value != null) return pre + p.value + u;
    if (p.start != null && p.end != null) return p.start === p.end ? pre + p.start + u : `${pre}${p.start}–${p.end}${u}`;
    return "";
  };
  const dur = d => d >= 60 ? (d % 60 ? `${Math.floor(d / 60)}'${d % 60}"` : `${d / 60}'`) : `${d}"`;
  const one = s => `${dur(+s.duration || 0)}${tgt(s) ? " " + tgt(s) : ""}`;
  const out = [];
  for (const s of steps || []) {
    if (s.steps && s.steps.length) out.push(`${s.reps || 1}×(${s.steps.map(one).join(" / ")})`);
    else if (+s.duration) out.push(one(s));
  }
  const txt = out.join(" · ");
  return txt.length > 180 ? txt.slice(0, 177).replace(/ ·[^·]*$/, "") + " …" : txt;
}

// Zakresy dziennych węglowodanów (Burke i in. 2011, Impey i in. 2018), g/kg.
export function carbBand(day) {
  const rideH = day.sessions.filter(s => s.ride).reduce((a, s) => a + s.durSec, 0) / 3600;
  const totH = day.sessions.reduce((a, s) => a + s.durSec, 0) / 3600;
  if (rideH >= 4) return { lo: 8, hi: 12, label: "bardzo wysoki" };
  if (day.key || rideH >= 1.5) return { lo: 6, hi: 10, label: "wysoki" };
  if (totH >= 0.75) return { lo: 5, hi: 7, label: "umiarkowany" };
  return { lo: 3, hi: 5, label: "niski" };
}

// ---------- Timeline posiłków ----------
const hm = m => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}`;
export const fmtTime = hm;
export const parseHM = s => { const [h, m] = String(s || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };

const ROLE_RANK = { pre: 6, recovery: 5, presnack: 4, breakfast: 3, dinner: 2, meal: 1 };

// Równy podział: śniadanie 30 min po pobudce, kolacja 3 h przed snem.
export function evenTimes(wake, sleep, n) {
  const N = Math.max(2, Math.min(7, Math.round(n || 4))), first = wake + 30, last = sleep - 180, step = (last - first) / (N - 1);
  return Array.from({ length: N }, (_, i) => Math.round((first + i * step) / 5) * 5);
}

export function buildTimeline(sessions, opt) {
  const W = opt.wake, Bt = opt.sleep;
  const ss = sessions.filter(s => !s.off).slice().sort((a, b) => a.start - b.start);
  let meals = [];
  const add = (t, role, kind, s) => meals.push({ t: Math.round(t), role, kind, s: s ? s.id : null, sess: s || null });

  // 1. Posiłki bazowe (ustawienie): równo od śniadania do kolacji 3 h przed snem. Przy 5+ co drugi to przekąska.
  // Pory własne (dzień, dzień tygodnia, ustawienia) mają pierwszeństwo przed równym podziałem.
  const times = (opt.times && opt.times.length ? opt.times.slice() : evenTimes(W, Bt, opt.meals)).sort((a, b) => a - b);
  const N = times.length;
  const step = N > 1 ? (times[N - 1] - times[0]) / (N - 1) : 240;
  times.forEach((t, i) => {
    const role = i === 0 && t < 11 * 60 ? "breakfast" : i === N - 1 && N > 1 && t >= 17 * 60 ? "dinner" : "meal";
    add(t, role, N >= 5 && i % 2 === 1 && i !== N - 1 ? "snack" : "main");
  });
  // 2. Trening przejmuje najbliższe posiłki bazowe (przed i po), a brakujące dokłada.
  const free = m => !m.sess;
  ss.forEach((s, i) => {
    const end = s.start + s.durSec / 60;
    const prevEnd = i ? ss[i - 1].start + ss[i - 1].durSec / 60 : -1;
    meals = meals.filter(m => !(free(m) && m.t > s.start - 75 && m.t < end + 15));
    const own = meals.filter(m => free(m) && m.kind === "main" && m.t >= Math.max(s.start - 240, prevEnd + 30) && m.t <= s.start - 75).sort((a, b) => b.t - a.t)[0];
    if (own) { own.role = "pre"; own.s = s.id; own.sess = s; }
    else if (s.start - 180 >= W + 30 && s.start - 180 > prevEnd + 60) add(s.start - 180, "pre", "main", s);
    else if (s.start - (W + 30) >= 45 && s.start - prevEnd > 90) add(Math.max(W + 30, prevEnd + 30, s.start - 120), "pre", s.start - Math.max(W + 30, prevEnd + 30) >= 120 ? "main" : "snack", s);
    else if (s.start - W > 25) add(Math.max(W, s.start - 30), "presnack", "snack", s);
    const fedRecently = meals.some(m => m.role !== "presnack" && m.t >= s.start - 120 && m.t <= s.start - 30) || prevEnd + 30 >= s.start - 120;
    if ((s.high || s.long) && s.start - 60 > W && !fedRecently) add(s.start - 60, "presnack", "snack", s);
    const rec = meals.filter(m => free(m) && m.t >= end + 15 && m.t <= end + 100).sort((a, b) => a.t - b.t)[0];
    if (rec) { rec.role = "recovery"; rec.kind = "main"; rec.t = Math.round(end + 30); rec.s = s.id; rec.sess = s; }
    else if (end + 30 < Bt) add(end + 30, "recovery", "main", s);
  });

  const inSession = t => ss.some(s => t > s.start - 20 && t < s.start + s.durSec / 60 + 15);
  // 3. Dzień treningowy: wypełnij przerwy dłuższe niż odstęp bazowy + 1 h (poza jazdą).
  const maxGap = Math.max(270, step + 60);
  for (let guard = 0; guard < (ss.length ? 8 : 0); guard++) {
    meals.sort((a, b) => a.t - b.t);
    let inserted = false;
    for (let i = 0; i + 1 < meals.length; i++) {
      const a = meals[i], b = meals[i + 1];
      if (b.t - a.t <= maxGap) continue;
      if (ss.some(s => s.start >= a.t && s.start <= b.t)) continue;
      let t = (a.t + b.t) / 2;
      if (inSession(t)) continue;
      add(t, "meal", b.t - a.t > 360 ? "main" : "snack"); inserted = true; break;
    }
    if (!inserted) break;
  }
  // Scal posiłki bliżej niż 75 min.
  meals.sort((a, b) => a.t - b.t);
  const merged = [];
  for (const m of meals) {
    const last = merged[merged.length - 1];
    if (last && m.t - last.t < 75 && !(last.role === "presnack" || m.role === "presnack")) {
      const keep = ROLE_RANK[m.role] > ROLE_RANK[last.role] ? m : last;
      merged[merged.length - 1] = { ...keep, kind: last.kind === "main" || m.kind === "main" ? "main" : "snack" };
    } else if (last && m.t - last.t < 30) {
      const keep = ROLE_RANK[m.role] > ROLE_RANK[last.role] ? m : last; merged[merged.length - 1] = keep;
    } else merged.push(m);
  }
  return merged.filter(m => m.t >= W - 30 && m.t <= Bt);
}

function mealName(m) {
  const t = m.t;
  if (m.role === "presnack") return "Przekąska przed treningiem";
  if (m.role === "recovery") return m.kind === "main" ? (t < 10.5 * 60 ? "Śniadanie po treningu" : t < 16 * 60 ? "Obiad po treningu" : "Kolacja po treningu") : "Regeneracja";
  if (m.role === "pre") return m.kind === "main" ? (t < 10.5 * 60 ? "Śniadanie przed treningiem" : t < 16 * 60 ? "Obiad przed treningiem" : "Posiłek przed treningiem") : "Lekki posiłek przed treningiem";
  if (m.kind === "snack") return t < 12 * 60 ? "II śniadanie" : "Podwieczorek";
  if (m.role === "breakfast" || (m.role !== "meal" && t < 10.5 * 60)) return "Śniadanie";
  if (t < 11.5 * 60) return "II śniadanie";
  if (t < 15 * 60) return "Obiad";
  if (t < 18 * 60) return "Posiłek";
  return "Kolacja";
}

// ---------- Dzień ----------
export const CODE_LABEL = { L: "LOW", M: "MEDIUM", H: "HIGH" };

export const suggestMinMeal = (base, n) => Math.round(Math.max(400, base / Math.max(2, n || 4) * 0.8) / 50) * 50;

const GENERIC = ["II śniadanie", "Obiad", "Posiłek", "Podwieczorek", "Kolacja"];
function codeAndName(meals, act, tomorrowKey, tomorrowLong) {
  const last = meals.length - 1;
  meals.forEach((m, i) => {
    const s = m.sess;
    let code = "L";
    if (m.role === "pre") code = s.demand === "high" ? "H" : (s.gym || s.demand === "mid") ? "M" : "L";
    else if (m.role === "presnack") code = "H";
    else if (m.role === "recovery") {
      const nextSoon = act.some(o => o !== s && o.start > s.start && o.start - (s.start + s.durSec / 60) < 8 * 60);
      code = s.key || nextSoon || (tomorrowKey && i >= last - 1) ? "H" : "M";
    }
    if (i === last && !["recovery", "pre", "presnack"].includes(m.role)) code = tomorrowKey ? "H" : tomorrowLong ? "M" : code;
    if (code === "L" && i > 0 && meals.slice(0, i).some(x => x.role === "recovery" && x.sess && x.sess.key)) code = "M";
    m.code = code;
    m.name = mealName(m);
    const prev = meals.slice(0, i).map(x => x.name);
    if (/^Śniadanie/.test(m.name) && prev.some(x => /^Śniadanie/.test(x))) m.name = m.name.replace(/^Śniadanie/, "II śniadanie");
    const g = GENERIC.find(w => m.name === w);
    if (g && prev.some(x => x.startsWith(g))) m.name = m.kind === "snack" ? "Przekąska" : "Posiłek";
    if (m.name === "Posiłek" && prev.includes("Posiłek")) m.name = "Posiłek " + (prev.filter(x => x.startsWith("Posiłek")).length + 1);
  });
}

export function planDay(day, ctx) {
  const v = ctx.settings;
  const act = day.sessions.filter(s => !s.off);
  const train = act.reduce((a, s) => a + s.kcal, 0);
  const intra = act.reduce((a, s) => a + (s.intra || 0), 0);
  const maint = v.base + train;
  const P = v.prot * v.mass, F = v.fat * v.mass;
  const minMain = v.minMeal || suggestMinMeal(v.base, ctx.times && ctx.times.length ? ctx.times.length : v.meals), minSnack = K.SNACK_MIN;
  const isTraining = m => ["pre", "presnack", "recovery"].includes(m.role);
  let meals = buildTimeline(act, { wake: v.wake, sleep: v.sleep, meals: v.meals, times: ctx.times }).map(m => ({ ...m }));
  let res = null;
  for (let iter = 0; iter < 5; iter++) {
    res = allocate(meals.map(m => ({ ...m })));
    const small = res.meals.filter(m => m.kind === "main" && !isTraining(m) && (m.kPre ?? m.kcal) < minMain - 5); // przed deficytem
    if (!small.length) break;
    const free = meals.filter(m => m.kind === "main" && !isTraining(m));
    if (free.length <= 1) break;
    // Za mało energii na tyle posiłków: usuń najmniejszy posiłek bazowy (najpierw środkowe, potem śniadanie/kolację).
    const worst = small.sort((a, b) => (a.role === "meal" ? 0 : 1) - (b.role === "meal" ? 0 : 1) || a.kcal - b.kcal)[0];
    meals = meals.filter(m => !(m.t === worst.t && m.role === worst.role));
  }
  return res;

  function allocate(meals) {
    codeAndName(meals, act, !!ctx.tomorrowKey, !!ctx.tomorrowLong);
    // Rozdział (spec 2026-11-20): suma dnia jak wcześniej (białko i tłuszcz z ustawień, węgle reszta w granicach
    // zakresu dnia). Posiłek dostaje węgle według kodu (LOW 0,4, MEDIUM 0,9, HIGH 1,35 g/kg), a pozostała energia
    // rozkłada się równo na posiłki. Tłuszcz domyka energię posiłku: więcej w LOW, mało przy treningu.
    const wE = m => m.role === "presnack" ? 0.25 : m.kind === "snack" ? 0.5 : 1;
    const wsum = meals.reduce((a, m) => a + wE(m), 0) || 1;
    meals.forEach(m => m.p = P * wE(m) / wsum);
    // Ładowanie, start, tryb HP: minimalne węgle dnia i podniesienie kodów.
    const minKg = Math.max(ctx.loadKg || 0, act.some(s => s.prio) ? carbBand({ sessions: act, key: true }).lo : 0);
    if (ctx.loadKg || act.some(s => s.prio)) meals.forEach(m => { if (m.code === "L") m.code = "M"; });
    // Węglowodany dnia
    const band = carbBand({ sessions: act, key: act.some(s => s.key) });
    const cBase = (maint - 4 * P - 9 * F) / 4;
    const hpAdd = ctx.hp ? (v.hpCarb || 1) * v.mass : 0;
    let cTotal = Math.max(cBase + hpAdd, minKg * v.mass);
    const surplus = (cTotal - cBase) * 4;
    const eDay = maint + surplus;
    // Granice zakresu: powyżej górnej nadwyżka idzie w tłuszcz; poniżej dolnej węgle kosztem tłuszczu (min. 0,6 g/kg).
    if (!minKg && cTotal > band.hi * v.mass) cTotal = band.hi * v.mass;
    if (cTotal < band.lo * v.mass) cTotal = Math.min(band.lo * v.mass, cTotal + Math.max(0, (eDay - 4 * P - 4 * cTotal) / 9 - 0.6 * v.mass) * 9 / 4);
    const cMeals = Math.max(0, cTotal - intra);
    const G = { L: 0.4, M: 0.9, H: 1.35 };
    const c0 = m => (m.role === "presnack" ? 0.5 : G[m.code] * (m.kind === "snack" ? 0.5 : 1)) * v.mass;
    const sum0 = meals.reduce((a, m) => a + c0(m), 0);
    if (sum0 <= cMeals) meals.forEach(m => m.c = c0(m) + (cMeals - sum0) * wE(m) / wsum);
    else { // za mało węgli na kody: najpierw z posiłków poza treningiem (do 0,2 g/kg), potem po równo
      const soft = meals.filter(m => !isTraining(m)), hard = meals.filter(m => isTraining(m));
      const hardSum = hard.reduce((a, m) => a + c0(m), 0), softMin = soft.reduce((a, m) => a + 0.2 * v.mass * wE(m), 0);
      if (cMeals >= hardSum + softMin) {
        const softSum = soft.reduce((a, m) => a + c0(m), 0), k = (cMeals - hardSum - softMin) / Math.max(1e-9, softSum - softMin);
        hard.forEach(m => m.c = c0(m)); soft.forEach(m => { const lo = 0.2 * v.mass * wE(m); m.c = lo + (c0(m) - lo) * k; });
      } else meals.forEach(m => m.c = c0(m) * cMeals / sum0);
    }
    // Tłuszcz: energia posiłku równa (waga posiłku), tłuszcz domyka; minimum 5 g (przekąska przed treningiem 2 g).
    const eMeals = eDay - 4 * intra;
    const fMin = m => m.role === "presnack" ? 2 : 5;
    meals.forEach(m => m.f = Math.max(fMin(m), (eMeals * wE(m) / wsum - 4 * m.p - 4 * m.c) / 9));
    const fOver = meals.reduce((a, m) => a + m.f, 0) - (eMeals - 4 * P - 4 * cMeals) / 9;
    if (fOver > 0.01) { // minimum tłuszczu w posiłkach przy treningu: oddają te z większym tłuszczem
      const room = meals.reduce((a, m) => a + (m.f - fMin(m)), 0) || 1;
      meals.forEach(m => m.f -= fOver * (m.f - fMin(m)) / room);
    }
    // Start: posiłek przed min. 2 g/kg węgli (3 h przed), przekąska ok. 0,5 g/kg.
    act.filter(s => s.prio).forEach(s => {
      const pre = meals.find(m => m.role === "pre" && m.s === s.id), sn = meals.find(m => m.role === "presnack" && m.s === s.id);
      const need = (pre ? Math.max(0, 2 * v.mass - pre.c) : 0) + (sn ? Math.max(0, 0.5 * v.mass - sn.c) : 0);
      if (!need) return;
      const donors = meals.filter(m => m !== pre && m !== sn && m.code !== "H" && m.c > 0.3 * v.mass);
      let left = need;
      donors.forEach(m => { const take = Math.min(left, m.c - 0.3 * v.mass); m.c -= take; left -= take; });
      const got = need - left;
      if (pre) { const add = Math.min(got, Math.max(0, 2 * v.mass - pre.c)); pre.c += add; if (sn) sn.c += got - add; } else if (sn) sn.c += got;
    });
    const kc = m => 4 * m.p + 4 * m.c + 9 * m.f;
    meals.forEach(m => m.kcal = kc(m));
    // Minimalna wielkość posiłku: dobierz energię z największych posiłków (najpierw tłuszcz, potem węgle).
    for (const m of meals.filter(x => x.kind === "main" && x.kcal < minMain)) {
      let need = minMain - m.kcal;
      const donors = meals.filter(d => d !== m && d.role !== "presnack" && d.kcal > minMain + 50).sort((a, b) => b.kcal - a.kcal);
      for (const d of donors) {
        if (need <= 1) break;
        const room = d.kcal - minMain;
        const cFloor = d.code === "H" ? 1.0 * v.mass : 0.3 * v.mass;
        const df = Math.min(need / 9, Math.max(0, d.f - 8), room / 9);
        d.f -= df; m.f += df; need -= df * 9;
        const dc = Math.min(need / 4, Math.max(0, d.c - cFloor), (room - df * 9) / 4);
        if (dc > 0) { d.c -= dc; m.c += dc; need -= dc * 4; }
        d.kcal = kc(d); m.kcal = kc(m);
      }
    }
    // Nawodnienie: ok. 35 ml/kg na dzień poza treningiem, przed treningiem 5–7 ml/kg (ACSM), po treningu 150% niedoboru.
    const baseMl = K.FLUID_ML_KG * v.mass;
    meals.forEach(m => { m.ml = m.kind === "snack" ? 250 : 450; });
    meals.forEach(m => {
      if (m.role === "pre") m.ml = Math.round(K.PRE_ML_KG * v.mass / 50) * 50;
      if (m.role === "presnack") m.ml = 250;
      if (m.role === "recovery" && m.sess) m.ml = Math.round(Math.max(500, m.sess.deficitMl * K.REHYDRATE) / 50) * 50;
    });
    const mealMl = meals.reduce((a, m) => a + m.ml, 0);
    const intraMl = act.reduce((a, s) => a + (s.fluid || 0), 0);
    const betweenMl = Math.max(0, Math.round((baseMl + act.reduce((a, s) => a + (s.deficitMl || 0) * K.REHYDRATE, 0) - mealMl) / 50) * 50);
    // Deficyt (spec 2026-11-19): z posiłków LOW, potem MEDIUM, nigdy z posiłków HIGH, posiłku przed treningiem,
    // regeneracji ani dwóch ostatnich posiłków przed mocną jednostką. Po trochu z kilku posiłków (maks. 30% posiłku),
    // nie poniżej minimum. A+: w dzień mocny tylko ostatni posiłek, min. 4 h po regeneracji.
    // Próg dostępności energii: jedzenie − trening ≥ ctx.eaMin.
    meals.forEach(m => { m.kPre = m.kcal; });
    let def = 0, cutLimit = null;
    let want = ctx.deficit || 0;
    if (want > 0 && ctx.eaMin) { const room = v.base + surplus - ctx.eaMin; if (room < want) { want = Math.max(0, room); cutLimit = "ea"; } }
    // Węgle dnia nie schodzą przez deficyt poniżej dolnej granicy zakresu (potem tnie tłuszcz).
    let cRoom = meals.reduce((a, m) => a + m.c, 0) + intra - band.lo * v.mass;
    if (want > 0) {
      const guard = new Set();
      act.filter(s => s.high || s.long).forEach(s => meals.filter(m => m.t < s.start && m.role !== "recovery").slice(-2).forEach(m => guard.add(m)));
      // Spacer lub wędrówka od 90 min: posiłek przed i po bez cięcia.
      (ctx.walks || []).filter(w => w.durMin >= K.WALK_GUARD_MIN).forEach(w => {
        const before = meals.filter(m => m.t <= w.start).slice(-1)[0], after = meals.find(m => m.t >= w.start + w.durMin);
        if (before) guard.add(before); if (after) guard.add(after);
      });
      let cands = meals.filter(m => !isTraining(m) && m.code !== "H" && !guard.has(m));
      if (ctx.aplus) {
        const last = meals[meals.length - 1], rec = meals.filter(m => m.role === "recovery").map(m => m.t);
        cands = rec.length && cands.includes(last) && last.t - Math.max(...rec) >= 240 ? [last] : [];
      }
      const floorK = m => m.kind !== "main" ? minSnack : m.code === "L" ? Math.max(300, 0.7 * minMain) : minMain;
      cands.forEach(m => { m.k0 = m.kcal; });
      const room = m => Math.max(0, Math.min(m.k0 * 0.3 - (m.k0 - m.kcal), m.kcal - floorK(m)));
      // Udział węgli w cięciu: tyle, ile pozwala dolna granica zakresu dnia, reszta z tłuszczu (do 10 g), potem po równo.
      const cFrac = Math.max(0, Math.min(1, cRoom * 4 / want));
      const take = (m, amt) => {
        let left = amt;
        const dc = Math.min(left * cFrac / 4, Math.max(0, m.c - 0.3 * v.mass), Math.max(0, cRoom)); m.c -= dc; left -= dc * 4; cRoom -= dc;
        const df = Math.min(left / 9, Math.max(0, m.f - 10)); m.f -= df; left -= df * 9;
        if (left > 0.5) { const c2 = Math.min(left / 4, Math.max(0, m.c - 0.3 * v.mass), Math.max(0, cRoom)); m.c -= c2; left -= c2 * 4; cRoom -= c2; }
        if (left > 0.5) { const c2 = Math.min(left / 8, Math.max(0, m.c - 15)), f2 = Math.min((left - c2 * 4) / 9, Math.max(0, m.f - 6)); m.c -= c2; m.f -= f2; left -= c2 * 4 + f2 * 9; cRoom -= c2; }
        m.kcal = kc(m); return amt - left;
      };
      let left = want;
      for (let pass = 0; pass < 4 && left > 1; pass++) {
        const open = cands.filter(m => room(m) > 1), w = open.reduce((a, m) => a + m.kcal, 0);
        if (!w) break;
        let got = 0;
        open.forEach(m => { const g = take(m, Math.min(room(m), left * m.kcal / w)); if (g > 0.5) m.cut = true; got += g; });
        left -= got; def += got;
        if (got < 1) break;
      }
      cands.forEach(m => { delete m.k0; });
      if (left > 5 && !cutLimit) cutLimit = "meals";
    }
    const gain = applyGain(meals, act, ctx, v, kc);
    mergeSmall(meals, act, kc);
    const cT = meals.reduce((a, m) => a + m.c, 0) + intra, pT = meals.reduce((a, m) => a + m.p, 0), fT = meals.reduce((a, m) => a + m.f, 0);
    return {
      meals, maint, train, intra, def, surplus: surplus + gain, gain, target: maint - def + surplus + gain, cT, pT, fT, band, minMain, cutLimit, wantDef: ctx.deficit || 0,
      cKg: cT / v.mass, low: cT / v.mass < band.lo - 0.05, loadKg: ctx.loadKg || 0, hp: !!ctx.hp,
      fluids: { meals: mealMl, intra: intraMl, between: betweenMl, total: mealMl + intraMl + betweenMl },
    };
  }
}

// Nadwyżka dnia (tryb Budowa): do regeneracji po siłowni (albo po treningu) i następnego posiłku, 70% węgle,
// 30% białko; bez treningu do dwóch pierwszych posiłków głównych. W dzień siłowni przekąska przed snem z 30–40 g
// białka (Snijders i in. 2015), z nadwyżki; reszta do regeneracji i następnego posiłku.
// Regeneracja dostaje min. 0,4 g/kg białka.
export function applyGain(meals, act, ctx, v, kc) {
  const G = ctx.gain || 0; if (G <= 0) return 0;
  const isTr = m => ["pre", "presnack", "recovery"].includes(m.role);
  const k0 = meals.reduce((a, m) => a + m.kcal, 0);
  let left = G;
  // Przekąska przed snem: dodatkowe białko z nadwyżki (od +150 kcal), posiłki dnia bez zmian.
  if (ctx.bedtime && G >= 150 && meals.length && meals[meals.length - 1].t <= v.sleep - 120) {
    const b = { t: Math.round(v.sleep - 45), role: "bedtime", kind: "snack", code: "L", name: "Przed snem (białko)", p: Math.max(30, Math.min(40, 0.45 * v.mass)), c: 0.15 * v.mass, f: 3, ml: 250, s: null, sess: null };
    b.kcal = kc(b); left -= b.kcal; meals.push(b);
  }
  const rec = meals.filter(m => m.role === "recovery"), gymRec = rec.find(m => m.sess && m.sess.gym) || rec[0];
  let tgt;
  if (gymRec) { const i = meals.indexOf(gymRec), nx = meals.slice(i + 1).find(m => m.kind === "main" && m.role !== "bedtime"); tgt = nx ? [gymRec, nx] : [gymRec]; }
  else tgt = meals.filter(m => m.kind === "main").slice(0, 2);
  if (left > 5 && tgt.length) tgt.forEach(m => { const e = left / tgt.length; m.c += 0.7 * e / 4; m.p += 0.3 * e / 4; m.gain = true; m.kcal = kc(m); });
  // Regeneracja: min. 0,4 g/kg białka; białko z posiłków bez treningu, energia wyrównana tłuszczem.
  rec.forEach(r => {
    const need = REC_PROT_KG * v.mass - r.p; if (need <= 0.5) return;
    const donors = meals.filter(m => !isTr(m) && m.role !== "bedtime" && m.p > 0.3 * v.mass), pw = donors.reduce((a, m) => a + m.p, 0); if (!pw) return;
    const dp = Math.min(need, donors.reduce((a, m) => a + m.p - 0.3 * v.mass, 0));
    donors.forEach(m => { const x = dp * m.p / pw; m.p -= x; m.f += x * 4 / 9; m.kcal = kc(m); });
    r.p += dp; const df = Math.min(r.f - 3, dp * 4 / 9); r.f -= Math.max(0, df); r.kcal = kc(r);
  });
  meals.sort((a, b) => a.t - b.t);
  return meals.reduce((a, m) => a + m.kcal, 0) - k0; // faktycznie dodane (z wyrównaniem białka w regeneracji)
}

// Dwa kolejne posiłki główne poza treningiem poniżej ok. 450 kcal: jeden staje się przekąską 150–250 kcal, drugi
// przejmuje resztę. Większy zostaje ten bliżej kolejnego treningu; bez treningu później (kolacja).
export function mergeSmall(meals, act, kc) {
  const isTr = m => ["pre", "presnack", "recovery"].includes(m.role);
  for (let i = 0; i + 1 < meals.length; i++) {
    const a = meals[i], b = meals[i + 1];
    if (a.kind !== "main" || b.kind !== "main" || isTr(a) || isTr(b) || a.kcal >= K.SMALL_MAIN || b.kcal >= K.SMALL_MAIN) continue;
    const next = act.filter(s => s.start > b.t).sort((x, y) => x.start - y.start)[0];
    const big = next ? (next.start - b.t <= next.start - a.t ? b : a) : b, small = big === a ? b : a;
    const tot = a.kcal + b.kcal, sk = Math.min(K.SNACK_MAX, Math.max(K.SNACK_MIN, Math.round(tot * 0.25 / 10) * 10));
    const r = sk / small.kcal;
    for (const k of ["p", "c", "f"]) { const mv = small[k] * (1 - r); small[k] -= mv; big[k] += mv; }
    const ml = small.ml - 250; small.ml = 250; big.ml += Math.max(0, ml);
    small.kind = "snack"; small.merged = true; big.merged = true;
    small.name = small.t < 10.5 * 60 && /^Śniadanie/.test(small.name) ? "Małe śniadanie" : small.t < 12 * 60 ? "II śniadanie" : "Podwieczorek";
    small.kcal = kc(small); big.kcal = kc(big);
    i++;
  }
}

// Ładowanie węglowodanami przed startem priorytetowym (Burke i in. 2011): g/kg dla dnia d, gdy start jest za 1 lub 2 dni.
export function loadingFor(daysAhead) {
  let kg = 0;
  for (const { offset, s } of daysAhead) {
    if (!s.prio) continue;
    const min = s.durSec / 60;
    if (offset === 1 && min >= 90) kg = Math.max(kg, min >= 150 ? 10 : 8);
    if (offset === 2 && min >= 150) kg = Math.max(kg, 8);
  }
  return kg;
}

// ---------- Wykonanie ----------
// Wykonana aktywność z Intervals jako jednostka dnia. Energia z pracy (icu_joules), inaczej z kalorii urządzenia.
// Zwraca null, gdy aktywność jest za krótka albo nie ma danych (np. skrót ze Stravy bez czasu).
export function analyzeActivity(a, cfg) {
  const durSec = +a.moving_time || +a.elapsed_time || 0;
  if (durSec < K.MIN_ACT_SEC) return null;
  const ftp = cfg.ftp || 250, h = durSec / 3600, type = a.type || "Other";
  const t = (a.start_date_local || "").slice(11, 16);
  const ifp = a.icu_intensity ? a.icu_intensity / 100 : null;
  const ingested = +a.carbs_ingested > 0 ? Math.round(+a.carbs_ingested) : null;
  const base = { id: "a" + a.id, actId: String(a.id), name: a.name || type, type, durSec, ifp, done: true, start: t ? parseHM(t) : null, prio: !!cfg.prio, race: false, assumed: false };
  const isRide = RIDES.has(type) || type === "NordicSki" || type === "VirtualSki";
  const kj = +a.icu_joules > 0 ? a.icu_joules / 1000 : isRide && +a.icu_average_watts > 0 ? a.icu_average_watts * durSec / 1000 : null;
  const cal = +a.calories > 0 ? +a.calories : null;
  let s;
  if (isRide && kj) {
    const avgW = Math.round(kj * 1000 / durSec), rel = avgW / ftp;
    const np = +a.icu_weighted_avg_watts || avgW;
    const high = !!cfg.prio || (ifp || np / ftp) >= 0.85 || kj >= 1800;
    s = { ...base, ride: true, kj: Math.round(kj), avgW, rel, cho: Math.round(kj * choFraction(Math.max(rel, np / ftp * 0.95)) / 4), kcal: kj - K.MAINT_KCAL_H * h,
      long: durSec >= 150 * 60, high, key: high || durSec >= 150 * 60, demand: high || durSec >= 150 * 60 ? "high" : durSec >= 75 * 60 ? "mid" : "low" };
    // Bez wpisu „carbs_ingested” przyjmujemy typową podaż ok. 40 g/h powyżej 75 min; trening z planu dostaje podaż z planu.
    s.intra = ingested ?? (durSec > 75 * 60 ? Math.round(40 * h / 5) * 5 : 0); s.intraAssumed = ingested == null;
    return withFluids(s, cfg, !!a.trainer || type === "VirtualRide", rel);
  }
  const min = durSec / 60;
  if (type === "WeightTraining") s = { ...base, gym: true, kcal: cal ? cal - K.MAINT_KCAL_H * h : gymKcalH(cfg) * h, key: false, demand: "mid" };
  else if (RUNS.has(type)) { const hi = !!cfg.prio || (ifp || 0) >= 0.85; s = { ...base, run: true, kcal: cal ? cal - K.MAINT_KCAL_H * h : (cfg.mass || 72) * (+a.distance > 0 ? a.distance / 1000 : h * (cfg.runSpeed || K.RUN_KMH)) * K.RUN_KCAL_KG_KM - K.MAINT_KCAL_H * h, key: hi || min >= 100, high: hi, demand: hi ? "high" : "mid" }; }
  else if (isRide) s = { ...base, ride: true, kcal: cal ? cal - K.MAINT_KCAL_H * h : 0.6 * ftp * durSec / 1000 - K.MAINT_KCAL_H * h, key: false, demand: "low" };
  else s = { ...base, kcal: cal ? cal - K.MAINT_KCAL_H * h : otherKcalH(cfg) * h, key: false, demand: "low" };
  s.kcal = Math.max(0, s.kcal); s.intra = ingested ?? 0; s.intraAssumed = ingested == null;
  return withFluids(s, cfg, s.gym || !!a.trainer, ifp || 0.6);
}

// Dopasowanie wykonanej aktywności do treningu z planu: tylko po parowaniu w Intervals (paired_event_id).
// Zwraca indeks w planned albo −1 (aktywność poza planem). Zgadywanie po rodzaju sportu i godzinie odrzucone:
// poranny dojazd „wykonywał” wieczorny trening. Niesparowany trening z planu dostaje w widoku dnia podpowiedź.
export const sportFamily = t => RIDES.has(t) || t === "NordicSki" || t === "VirtualSki" ? "ride" : /Run/.test(t || "") ? "run" : t === "WeightTraining" ? "gym" : "other";
export function matchActivity(a, planned, taken = new Set()) {
  if (a.paired_event_id == null) return -1;
  return planned.findIndex((s, k) => !taken.has(k) && String(a.paired_event_id) === s.id);
}

// Przeliczenie reszty dnia po wykonanym treningu (jak Hexis Live).
// planned: plan dnia z planu treningów; actual: plan z wykonanymi aktywnościami; now: minuty od północy.
// Posiłki, których pora minęła, zostają takie, jak były w planie (zakładamy, że zostały zjedzone).
// Różnicę między celem dnia z wykonania a tym, co już zjedzone, przejmują posiłki od teraz.
// Posiłek przed treningiem i regeneracja nie oddają węgli. Żaden posiłek nie schodzi poniżej minimum.
export function liveAdjust(planned, actual, now, mass) {
  const isTraining = m => ["pre", "presnack", "recovery"].includes(m.role);
  let meals = actual.meals.map(m => ({ ...m }));
  const used = new Set();
  const twin = m => {
    let best = null, bd = 1e9;
    planned.meals.forEach((p, i) => { if (used.has(i)) return; const d = Math.abs(p.t - m.t) + (p.role === m.role ? 0 : 60); if (d < bd) { bd = d; best = i; } });
    if (best == null || bd > 150) return null; used.add(best); return planned.meals[best];
  };
  // Minione posiłki: wartości, nazwa i kod z planu, który był widoczny. Posiłek, którego w tamtym planie nie było
  // (np. regeneracja po treningu poza planem), nie mógł zostać zjedzony, więc wypada, a jego energię przejmuje reszta dnia.
  meals.filter(m => m.t <= now).forEach(m => { const p = twin(m); m.past = true; if (p) Object.assign(m, { p: p.p, c: p.c, f: p.f, kcal: p.kcal, ml: p.ml, code: p.code, cut: p.cut, name: p.name, role: p.role, kind: p.kind }); else m.gone = true; });
  meals = meals.filter(m => !m.gone);
  const past = meals.filter(m => m.past), future = meals.filter(m => !m.past);
  const shownBefore = future.map(m => twin(m)); // ten sam posiłek w planie sprzed treningu: zmiana pokazywana względem niego
  const sum = (list, k) => list.reduce((a, m) => a + m[k], 0);
  const goal = { p: sum(actual.meals, "p"), c: sum(actual.meals, "c"), f: sum(actual.meals, "f") };
  const minK = m => m.kind === "main" ? actual.minMain : K.SNACK_MIN;
  const kc = m => 4 * m.p + 4 * m.c + 9 * m.f;
  let left = 0;
  if (future.length) {
    const dP = goal.p - sum(past, "p") - sum(future, "p");
    const pw = sum(future, "p") || 1; future.forEach(m => { m.p = Math.max(0, m.p + dP * m.p / pw); });
    const move = (k, delta, floorG) => {
      if (delta >= 0) { const w = sum(future, k) || 1; future.forEach(m => { m[k] += delta * (m[k] || 0.01) / w; }); return 0; }
      let need = -delta;
      for (let pass = 0; pass < 3 && need > 0.5; pass++) {
        const donors = future.filter(m => !(k === "c" && isTraining(m)) && m[k] > floorG && kc(m) > minK(m) + 5);
        const w = donors.reduce((a, m) => a + m[k], 0); if (!w) break;
        let got = 0;
        donors.forEach(m => { const per = k === "c" ? 4 : 9; const cap = Math.min(m[k] - floorG, (kc(m) - minK(m)) / per); const take = Math.max(0, Math.min(cap, need * m[k] / w)); m[k] -= take; got += take; });
        need -= got; if (got < 0.5) break;
      }
      return need;
    };
    const leftC = move("c", goal.c - sum(past, "c") - sum(future, "c"), 15);
    const leftF = move("f", goal.f - sum(past, "f") - sum(future, "f"), 6);
    left = leftC * 4 + leftF * 9;
    future.forEach((m, i) => {
      m.kcal = kc(m); const o = shownBefore[i];
      if (!o) { m.adj = { added: true, kcal: m.kcal, c: m.c }; return; }
      const dk = m.kcal - o.kcal, dc = m.c - o.c;
      m.adj = Math.abs(dk) >= 20 || Math.abs(dc) >= 5 ? { kcal: dk, c: dc } : null;
    });
  } else left = -(goal.p - sum(past, "p")) * 4 - (goal.c - sum(past, "c")) * 4 - (goal.f - sum(past, "f")) * 9;
  const eaten = sum(past, "kcal");
  // Kafelki pokazują cel dnia z wykonania (jak liczba kcal). Brakujące makro: cel minus posiłki (minione i kolejne).
  const missing = { p: goal.p - sum(meals, "p"), c: goal.c - sum(meals, "c"), f: goal.f - sum(meals, "f") };
  missing.kcal = 4 * missing.p + 4 * missing.c + 9 * missing.f;
  const pT = actual.pT, fT = actual.fT, cT = actual.cT;
  // Odchylenie: dodatnie = nie udało się zabrać (posiłki na minimum), ujemne = brakuje posiłków, by dojeść.
  return {
    ...actual, meals, pT, fT, cT, cKg: actual.cKg,
    live: { now, plannedTarget: planned.target, delta: actual.target - planned.target, eaten, remaining: sum(future, "kcal"), biggest: future.reduce((a, m) => !a || m.kcal > a.kcal ? m : a, null), noFuture: !future.length, unabsorbed: Math.round(left), missing },
  };
}

// Kontrola wiarygodności wpisu z Dziennika: kcal zgodne z makro (4/4/9) i nie absurdalnie wysokie.
export function dayCheck(w, expected) {
  const out = [];
  if (w.kcalConsumed && w.protein != null && w.carbohydrates != null && w.fatTotal != null) {
    const m = 4 * w.protein + 4 * w.carbohydrates + 9 * w.fatTotal;
    if (Math.abs(w.kcalConsumed - m) / w.kcalConsumed > 0.10) out.push(`kcal (${Math.round(w.kcalConsumed)}) nie zgadzają się z makro (${Math.round(m)})`);
  }
  if (w.kcalConsumed && expected && w.kcalConsumed > 1.8 * expected) out.push(`kcal ponad 1,8 raza wyższe od planu (${Math.round(expected)})`);
  return out;
}

// Nachylenie trendu masy (kg/dzień) z regresji liniowej. points: [{day, w}], day w dniach.
export function weightSlope(points) {
  const n = points.length; if (n < 2) return 0;
  const mx = points.reduce((a, p) => a + p.day, 0) / n, my = points.reduce((a, p) => a + p.w, 0) / n;
  const sxy = points.reduce((a, p) => a + (p.day - mx) * (p.w - my), 0), sxx = points.reduce((a, p) => a + (p.day - mx) ** 2, 0);
  return sxx ? sxy / sxx : 0;
}
