// fueling: model obliczeń. Bez DOM, testowalny w Node.
// Zasady: energia z pracy mechanicznej (kJ ≈ kcal wydatku), udział węglowodanów zależny od %FTP każdego kroku,
// węgle dopasowane do pracy (fuel for the work required, Impey i in. 2018), kodowanie posiłków LOW/MEDIUM/HIGH.

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
      if (s.w / ftp >= 0.88) hard[b] += room;
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
    const hardMin = segs.filter(s => s.w / ftp >= 0.88).reduce((a, s) => a + s.dur, 0) / 60;
    const vo2Min = segs.filter(s => s.w / ftp >= 1.05).reduce((a, s) => a + s.dur, 0) / 60;
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
      blocks, intra, gph: h ? Math.round(intra / h) : 0, avgW, prio,
      kcal: kj - 90 * h, // kJ ≈ kcal wydatku, minus część już zawarta w utrzymaniu
      long, high, key: high || long, demand: high || long ? "high" : durSec >= 75 * 60 ? "mid" : "low",
    };
    return withFluids(s, cfg, ev.indoor || type === "VirtualRide", avgW / ftp);
  }
  if (!durSec) { durSec = 60 * 60; base.assumed = true; }
  const min = durSec / 60;
  if (type === "WeightTraining") return withFluids({ ...base, durSec, gym: true, kcal: 280 * min / 60, intra: 0, key: false, demand: "mid" }, cfg, true, 0.5);
  if (RUNS.has(type)) { const hi = !!cfg.prio || (ifp || 0) >= 0.85; return withFluids({ ...base, durSec, run: true, prio: !!cfg.prio, kcal: 10 * min, intra: min > 75 ? Math.round(40 * min / 60) : 0, key: hi || min >= 100, high: hi, demand: hi ? "high" : "mid" }, cfg, false, ifp || 0.7); }
  return withFluids({ ...base, durSec, kcal: 6 * min, intra: 0, key: false, demand: "low" }, cfg, false, 0.5);
}

// Płyny i sód w trakcie. Pot: ustawienie w L/h dla jazdy ok. 70% FTP na zewnątrz, korekta na intensywność i trenażer.
export function withFluids(s, cfg, indoor, rel) {
  const sweat = (cfg.sweat || 0.9) * (rel < 0.6 ? 0.8 : rel > 0.8 ? 1.15 : 1) * (indoor ? 1.25 : 1) * (s.gym ? 0.6 : 1);
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

export function buildTimeline(sessions, opt) {
  const W = opt.wake, Bt = opt.sleep;
  const ss = sessions.filter(s => !s.off).slice().sort((a, b) => a.start - b.start);
  let meals = [];
  const add = (t, role, kind, s) => meals.push({ t: Math.round(t), role, kind, s: s ? s.id : null, sess: s || null });

  // 1. Posiłki bazowe (ustawienie): równo od śniadania do kolacji 3 h przed snem. Przy 5+ co drugi to przekąska.
  const N = Math.max(2, Math.min(7, Math.round(opt.meals || 4)));
  const first = W + 30, dinnerT = Bt - 180, step = (dinnerT - first) / (N - 1);
  for (let i = 0; i < N; i++) {
    const role = i === 0 ? "breakfast" : i === N - 1 ? "dinner" : "meal";
    add(first + i * step, role, N >= 5 && i % 2 === 1 && i !== N - 1 ? "snack" : "main");
  }
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
  const minMain = v.minMeal || suggestMinMeal(v.base, v.meals), minSnack = 150;
  const isTraining = m => ["pre", "presnack", "recovery"].includes(m.role);
  let meals = buildTimeline(act, { wake: v.wake, sleep: v.sleep, meals: v.meals }).map(m => ({ ...m }));
  let res = null;
  for (let iter = 0; iter < 5; iter++) {
    res = allocate(meals.map(m => ({ ...m })));
    const small = res.meals.filter(m => m.kind === "main" && !isTraining(m) && m.kcal < minMain - 5);
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
    // Białko
    const pw = meals.map(m => m.role === "presnack" ? 0.25 : m.kind === "snack" ? 0.6 : m.role === "recovery" ? 1.2 : 1);
    const pws = pw.reduce((a, x) => a + x, 0) || 1;
    meals.forEach((m, i) => m.p = P * pw[i] / pws);
    // Tłuszcz: więcej w posiłkach LOW, mało wokół treningu
    const fw = meals.map(m => ({ L: 1.6, M: 1, H: 0.5 }[m.code]) * (m.role === "presnack" ? 0.15 : m.kind === "snack" ? 0.45 : 1));
    const fws = fw.reduce((a, x) => a + x, 0) || 1;
    meals.forEach((m, i) => m.f = F * fw[i] / fws);
    // Ładowanie, start, tryb HP: minimalne węgle dnia i podniesienie kodów.
    const minKg = Math.max(ctx.loadKg || 0, act.some(s => s.prio) ? carbBand({ sessions: act, key: true }).lo : 0);
    if (ctx.loadKg || act.some(s => s.prio)) meals.forEach(m => { if (m.code === "L") m.code = "M"; });
    // Węglowodany
    const cBase = (maint - 4 * P - 9 * F) / 4;
    const hpAdd = ctx.hp ? (v.hpCarb || 1) * v.mass : 0;
    const cTotal = Math.max(cBase + hpAdd, minKg * v.mass);
    const surplus = (cTotal - cBase) * 4;
    const cMeals = Math.max(0, cTotal - intra);
    const lowFix = m => (m.kind === "snack" ? 0.2 : 0.4) * v.mass;
    const lows = meals.filter(m => m.code === "L"), others = meals.filter(m => m.code !== "L");
    const lowSum = lows.reduce((a, m) => a + lowFix(m), 0);
    if (!others.length) meals.forEach(m => m.c = cMeals * lowFix(m) / (lowSum || 1));
    else {
      const lowScale = lowSum > cMeals * 0.6 ? cMeals * 0.6 / lowSum : 1;
      lows.forEach(m => m.c = lowFix(m) * lowScale);
      const rest = cMeals - lowSum * lowScale;
      const cw = m => (m.code === "H" ? 2.2 : 1) * (m.role === "presnack" ? 0.35 : m.kind === "snack" ? 0.5 : 1);
      const cws = others.reduce((a, m) => a + cw(m), 0);
      others.forEach(m => m.c = rest * cw(m) / cws);
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
    const baseMl = 35 * v.mass;
    meals.forEach(m => { m.ml = m.kind === "snack" ? 250 : 450; });
    meals.forEach(m => {
      if (m.role === "pre") m.ml = Math.round(6 * v.mass / 50) * 50;
      if (m.role === "presnack") m.ml = 250;
      if (m.role === "recovery" && m.sess) m.ml = Math.round(Math.max(500, m.sess.deficitMl * 1.5) / 50) * 50;
    });
    const mealMl = meals.reduce((a, m) => a + m.ml, 0);
    const intraMl = act.reduce((a, s) => a + (s.fluid || 0), 0);
    const betweenMl = Math.max(0, Math.round((baseMl + act.reduce((a, s) => a + (s.deficitMl || 0) * 1.5, 0) - mealMl) / 50) * 50);
    // Deficyt: tylko z posiłków LOW (z dala od treningu), od wieczoru. Żaden posiłek nie schodzi poniżej minimum.
    let def = 0;
    const want = ctx.deficit || 0;
    if (want > 0) {
      let left = want;
      const cands = meals.filter(m => m.code === "L" && !isTraining(m)).sort((a, b) => b.t - a.t);
      for (const m of cands) {
        if (left <= 1) break;
        const floorK = m.kind === "main" ? minMain : minSnack;
        let take = Math.min(left, Math.max(0, m.kcal - floorK)), got = 0;
        const dc = Math.min(take / 4, Math.max(0, m.c - 15)); m.c -= dc; got += dc * 4; take -= dc * 4;
        const df = Math.min(take / 9, Math.max(0, m.f - 6)); m.f -= df; got += df * 9;
        if (got > 1) { m.kcal = kc(m); m.cut = true; left -= got; def += got; }
      }
    }
    const cT = meals.reduce((a, m) => a + m.c, 0) + intra, pT = meals.reduce((a, m) => a + m.p, 0), fT = meals.reduce((a, m) => a + m.f, 0);
    const band = carbBand({ sessions: act, key: act.some(s => s.key) });
    return {
      meals, maint, train, intra, def, surplus, target: maint - def + surplus, cT, pT, fT, band, minMain,
      cKg: cT / v.mass, low: cT / v.mass < band.lo - 0.05, loadKg: ctx.loadKg || 0, hp: !!ctx.hp,
      fluids: { meals: mealMl, intra: intraMl, between: betweenMl, total: mealMl + intraMl + betweenMl },
    };
  }
}

// Ładowanie węglowodanami przed startem priorytetowym (Burke i in. 2011): g/kg dla dnia d, gdy start jest za 1 lub 2 dni.
export function loadingFor(daysAhead, prioSessions) {
  let kg = 0;
  for (const { offset, s } of daysAhead) {
    if (!s.prio) continue;
    const min = s.durSec / 60;
    if (offset === 1 && min >= 90) kg = Math.max(kg, min >= 150 ? 10 : 8);
    if (offset === 2 && min >= 150) kg = Math.max(kg, 8);
  }
  return kg;
}

// Deficyt tygodnia rozłożony na dozwolone dni (wieczór przed jakością = zero).
export function weekDeficits(days, s, mode) {
  if (!s.cutOn || mode === "sick") return days.map(() => 0);
  const cap = mode === "tired" ? Math.min(150, s.cap) : s.cap, weekly = mode === "tired" ? s.weekly / 2 : s.weekly;
  const allowed = days.map(d => d.allowed);
  const n = allowed.filter(Boolean).length;
  const per = n ? Math.min(cap, weekly / n) : 0;
  return allowed.map(a => a ? per : 0);
}
