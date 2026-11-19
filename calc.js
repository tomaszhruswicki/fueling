// Obliczenia na stanie aplikacji: utrzymanie, kalibracja, treningi dnia (plan i wykonanie), plan zakresu dni.
import * as M from "./model.js";
import { S } from "./store.js";
import { isSession, FUEL, BACKUP_NAME } from "./intervals.js";
import { r10, parseD, todayISO, nowMin, addDays, DOWN } from "./util.js";

// ---------- Utrzymanie ----------
// Dzień bez treningu = RMR × 1,2 (dzień siedzący z termogenezą posiłków) + kroki.
// RMR: Cunningham (500 + 22 × beztłuszczowa masa ciała), gdy znany % tkanki tłuszczowej; inaczej ten Haaf i Weijs 2014 (równanie dla sportowców).
export function maintenance() {
  const a = S.cache.athlete || {}, s = S.settings;
  const mass = s.mass || a.weight || 75;
  const height = s.height ? (s.height > 3 ? s.height / 100 : s.height) : a.height || 1.75;
  let age = s.age;
  if (!age && a.dob) { const b = new Date(a.dob), n = new Date(); age = n.getFullYear() - b.getFullYear() - ((n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) ? 1 : 0); }
  age = age || 35;
  const male = (a.sex || "M") !== "F";
  const ffm = s.bodyFat ? mass * (1 - s.bodyFat / 100) : null;
  const rmr = ffm ? 500 + 22 * ffm : 11.936 * mass + 587.728 * height - 8.129 * age + 191.027 * (male ? 1 : 0) + 29.279;
  const recent = (S.cache.wellness || []).filter(x => x.id >= addDays(todayISO(), -28) && x.steps);
  const steps = recent.length >= 7 ? recent.reduce((t, x) => t + x.steps, 0) / recent.length : null;
  const stepKcal = (steps ?? 7000) * 0.0005 * mass;
  const formula = rmr * 1.2 + stepKcal;
  const cal = calibration(mass);
  const floor = s.floor || r10(rmr * 1.15);
  let base, src;
  if (s.baseMode === "manual" && s.base) { base = s.base; src = "ręcznie"; }
  else if (cal) { base = r10(0.5 * cal.base + 0.5 * formula); src = "kalkulator i Twoje dane"; }
  else { base = r10(formula); src = "kalkulator"; }
  return { base, src, rmr, rmrEq: ffm ? "Cunningham" : "ten Haaf", ffm, steps, stepKcal, formula, cal, floor, mass, height, age };
}

// ---------- Kalibracja z danych (jedna dla Ustawień i Dziennika) ----------
// 28 dni przed dziś. Wydatek całkowity = średnie kcal zjedzone − trend masy (regresja liniowa, 7700 kcal/kg).
// Utrzymanie = wydatek całkowity − średni wydatek treningowy z wykonanych aktywności (gdy brak, z planu).
// Dni z niewiarygodnym wpisem (kcal ≠ makro o >10% albo >1,8 × oczekiwane) pomijane.
export const CAL_DAYS = 28, CAL_MIN_KCAL = 14, CAL_MIN_W = 8;
let calCache = null;
export function trainKcalOn(date, v) {
  const done = actsOn(date, v);
  if (S.cache.activities) return done.reduce((t, s) => t + s.kcal, 0);
  return sessionsFor(date, v).filter(s => !s.off).reduce((t, s) => t + s.kcal, 0);
}
export function calibration(mass) {
  const key = (S.cache.fetchedAt || 0) + "|" + S.savedAt;
  if (calCache && calCache.key === key) return calCache.val;
  const from = addDays(todayISO(), -CAL_DAYS), wl = (S.cache.wellness || []).filter(x => x.id >= from && x.id < todayISO());
  const v = { ftp: S.settings.ftp || (S.cache.athlete || {}).ftp || 250, zones: (S.cache.athlete || {}).zones, sweat: 0.9, sodium: 700, wake: 390 };
  const pre = S.settings.baseMode === "manual" && S.settings.base ? S.settings.base : null;
  const rows = wl.filter(x => x.kcalConsumed).map(x => { const train = trainKcalOn(x.id, v); return { x, train, bad: M.dayCheck(x, (pre || 30 * mass) + train) }; });
  const kc = rows.filter(r => !r.bad.length), skipped = rows.length - kc.length;
  const wts = wl.filter(x => x.weight);
  let val = null;
  if (kc.length >= CAL_MIN_KCAL && wts.length >= CAL_MIN_W) {
    const d0 = parseD(from).getTime();
    const slope = M.weightSlope(wts.map(x => ({ day: (parseD(x.id).getTime() - d0) / 864e5, w: x.weight })));
    const eat = kc.reduce((t, r) => t + r.x.kcalConsumed, 0) / kc.length;
    const tdee = eat - slope * M.K.KCAL_PER_KG;
    const train = kc.reduce((t, r) => t + r.train, 0) / kc.length;
    const span = (parseD(wts[wts.length - 1].id) - parseD(wts[0].id)) / 864e5;
    val = { base: tdee - train, tdee, train, eat, n: kc.length, nw: wts.length, skipped, dW: slope * span, span, src: S.cache.activities ? "wykonanie" : "plan" };
  }
  calCache = { key, val, info: { n: kc.length, nw: wts.length, skipped } }; return val;
}
export const invalidateCal = () => { calCache = null; };
export const calibrationInfo = () => { calibration(S.settings.mass || 75); return calCache.info; };

export function eff() {
  const a = S.cache.athlete || {}, s = S.settings, m = maintenance();
  return { ...s, mass: m.mass, ftp: s.ftp || a.ftp || 250, zones: a.zones || [55, 75, 90, 105, 120, 150, 999], base: m.base, floor: m.floor, wake: M.parseHM(s.wake), sleep: M.parseHM(s.sleep) };
}

// ---------- Tryby z historią ----------
export function modeFor(d) {
  let best = null;
  for (const e of S.modes) if (!e.cancelled && e.from <= d && (!e.to || d <= e.to) && (!best || e.at > best.at)) best = e;
  return best ? best.mode : "normal";
}

// ---------- Treningi dnia ----------
const family = t => M.RIDES.has(t) || t === "NordicSki" || t === "VirtualSki" ? "ride" : /Run/.test(t || "") ? "run" : t === "WeightTraining" ? "gym" : "other";
const actsRaw = date => (S.cache.activities || []).filter(a => (a.start_date_local || "").slice(0, 10) === date);
function actsOn(date, v) { return actsRaw(date).map(a => M.analyzeActivity(a, { ftp: v.ftp, sweat: v.sweat, sodium: v.sodium })).filter(Boolean); }

// Treningi z planu. Gdy withDone, wykonane aktywności zastępują dopasowane treningi (paired_event_id albo ten sam
// rodzaj sportu tego dnia), a niezaplanowane dochodzą jako osobne jednostki.
export function sessionsFor(date, v, withDone = false) {
  const evs = (S.cache.events || []).filter(e => isSession(e) && (e.start_date_local || "").slice(0, 10) === date);
  const dow = parseD(date).getDay(), wknd = dow === 0 || dow === 6;
  const def = M.parseHM(wknd ? S.settings.weTime : S.settings.wkTime);
  let prevEnd = null;
  const planned = evs.map(e => {
    const prio = S.ov.prio[e.id] != null ? !!S.ov.prio[e.id] : (e.category === "RACE_A" || e.category === "RACE_B");
    const s = M.analyzeSession(e, { ftp: v.ftp, zones: v.zones, sweat: v.sweat, sodium: v.sodium, prio });
    const evT = (e.start_date_local || "").slice(11, 16);
    let start = S.ov.time[e.id] ? M.parseHM(S.ov.time[e.id]) : evT && evT !== "00:00" ? M.parseHM(evT) : null;
    if (start == null) start = prevEnd == null ? def : prevEnd + 120;
    if (start + s.durSec / 60 > 23.5 * 60) start = Math.max(v.wake + 30, 23.5 * 60 - s.durSec / 60);
    prevEnd = start + s.durSec / 60;
    return { ...s, start, off: !!S.ov.off[e.id], ev: e, desc: e.description || "", steps: M.stepSummary((e.workout_doc || {}).steps, v.ftp) };
  });
  if (!withDone) return planned.sort((a, b) => a.start - b.start);
  const raw = actsRaw(date), out = planned.slice(), taken = new Set();
  raw.forEach(a => {
    let i = planned.findIndex((s, k) => !taken.has(k) && a.paired_event_id != null && String(a.paired_event_id) === s.id);
    const st = M.parseHM((a.start_date_local || "").slice(11, 16));
    if (i < 0) { // najbliższy niewykonany trening tego samego rodzaju
      let bd = 1e9; planned.forEach((s, k) => { if (taken.has(k) || family(s.type) !== family(a.type)) return; const d = Math.abs(s.start - st); if (d < bd) { bd = d; i = k; } });
    }
    const p = i >= 0 ? planned[i] : null;
    const x = M.analyzeActivity(a, { ftp: v.ftp, sweat: v.sweat, sodium: v.sodium, prio: p ? p.prio : false });
    if (!x) return;
    if (p) {
      taken.add(i);
      if (x.intraAssumed) { x.intra = Math.round((p.intra || 0) * Math.min(1, x.durSec / Math.max(1, p.durSec)) / 5) * 5; } // podaż z planu, proporcjonalnie do czasu
      // Charakter treningu (jakość, długość) z planu, gdy wykonanie go nie zaprzecza: z samej aktywności nie znamy minut ≥ 88% FTP.
      const rank = { low: 0, mid: 1, high: 2 }, keep = x.durSec >= 0.7 * p.durSec;
      if (keep) Object.assign(x, { high: x.high || p.high, key: x.key || p.key, long: x.long || p.long, demand: rank[p.demand] > rank[x.demand] ? p.demand : x.demand });
      out[out.indexOf(p)] = { ...x, start: x.start ?? p.start, off: false, ev: p.ev, desc: p.desc, steps: p.steps, plan: p, blocks: null };
    } else out.push({ ...x, start: x.start ?? v.wake + 60, off: false, unplanned: true });
  });
  // Dzień miniony z pobranymi aktywnościami: trening z planu bez wykonania nie wchodzi do bilansu.
  if (date < todayISO() && S.cache.activities && date >= addDays(todayISO(), -29))
    planned.forEach((p, k) => { if (!taken.has(k)) out[out.indexOf(p)] = { ...p, off: true, missed: true }; });
  return out.sort((a, b) => a.start - b.start);
}
export function notesFor(date) {
  return (S.cache.events || []).filter(e => (e.category === "NOTE" || e.category === "HOLIDAY") && (e.start_date_local || "").slice(0, 10) === date && !(e.name || "").startsWith(FUEL) && e.name !== BACKUP_NAME).map(e => e.name);
}
function dayTag(act) {
  const key = act.some(s => s.key), ride = act.some(s => s.ride || s.run), gym = act.some(s => s.gym), long = act.some(s => s.long);
  return key ? (long ? ["long", "Długo"] : ["key", "Jakość"]) : ride ? ["easy", "Lekko"] : gym ? ["gym", "Siła"] : ["rest", "Wolne"];
}

// ---------- Pory posiłków: dzień > dzień tygodnia > ustawienia > równy podział ----------
export const tStr = m => M.fmtTime(m);
export function autoTimes(v) { return M.evenTimes(v.wake, v.sleep, S.settings.meals).map(tStr); }
export function timesFor(date, v) {
  const dow = parseD(date).getDay(), st = S.settings;
  if (S.ov.mealTimes && S.ov.mealTimes[date]) return { list: S.ov.mealTimes[date], src: "tylko ten dzień", lvl: "day" };
  if (st.dowTimes && st.dowTimes[dow]) return { list: st.dowTimes[dow], src: `ustawienia na ${DOWN[dow]}`, lvl: "dow" };
  if (st.mealTimes) return { list: st.mealTimes, src: "Twoje domyślne", lvl: "def" };
  return { list: autoTimes(v), src: "automatycznie z pobudki i snu", lvl: "auto" };
}

// ---------- Plan zakresu dni ----------
// Dzień przeszły: plan z wykonania. Dziś: plan z planu treningów, po wykonanym treningu reszta dnia przeliczona
// (M.liveAdjust). Dni przyszłe: z planu. Dzień jutrzejszy i pojutrzejszy wpływają na kody posiłków i ładowanie.
export function computeRange(start, n) {
  const v = eff(), t = todayISO(), now = nowMin();
  const days = [];
  for (let i = 0; i < n + 2; i++) {
    const date = addDays(start, i), withDone = date <= t;
    const ss = sessionsFor(date, v, withDone);
    days.push({ date, ss, act: ss.filter(s => !s.off), mode: modeFor(date), planned: withDone ? sessionsFor(date, v) : null });
  }
  const show = days.slice(0, n);
  show.forEach((d, i) => {
    const t1 = days[i + 1], t2 = days[i + 2];
    d.tomorrowKey = t1.act.some(s => s.key); d.tomorrowLong = t1.act.some(s => s.long);
    d.loadKg = d.mode === "sick" ? 0 : M.loadingFor([...t1.act.map(s => ({ offset: 1, s })), ...t2.act.map(s => ({ offset: 2, s }))]);
    d.prio = d.act.some(s => s.prio);
    d.allowed = v.cutOn && !["sick", "hp"].includes(d.mode) && !d.tomorrowKey && !S.ov.skip[d.date] && !d.loadKg && !d.prio;
  });
  // Deficyt tygodnia rozłożony na dozwolone dni; Zmęczenie: maks. 150 kcal i połowa celu.
  const n2 = show.filter(d => d.allowed).length;
  show.forEach(d => {
    const tired = d.mode === "tired";
    d.want = d.allowed ? Math.min(tired ? Math.min(150, v.cap) : v.cap, (tired ? v.weekly / 2 : v.weekly) / Math.max(1, n2)) : 0;
    d.want = Math.min(d.want, Math.max(0, v.base - v.floor)); // minimum dnia: część poza treningiem nie schodzi poniżej progu
    d.times = timesFor(d.date, v);
    const ctx = { settings: v, times: d.times.list.map(M.parseHM), tomorrowKey: d.tomorrowKey, tomorrowLong: d.tomorrowLong, deficit: d.want, hp: d.mode === "hp", loadKg: d.loadKg };
    d.done = d.ss.filter(s => s.done);
    d.plan = M.planDay({ sessions: d.ss }, ctx);
    if (d.date <= t && (d.done.length || d.ss.some(s => s.missed))) d.orig = M.planDay({ sessions: d.planned }, ctx);
    if (d.date === t && d.done.length) d.plan = M.liveAdjust(d.orig, d.plan, now, v.mass);
    d.missed = d.ss.filter(s => s.missed || (d.date === t && !s.done && !s.off && s.start + s.durSec / 60 + 60 < now));
    const [tag, tagLabel] = dayTag(d.act); d.tag = tag; d.tagLabel = tagLabel;
    d.notes = notesFor(d.date);
  });
  return { v, show };
}
export const winStart = () => addDays(addDays(todayISO(), -((parseD(todayISO()).getDay() + 6) % 7)), 7 * S.week);

// Trening z planu dziś, który powinien już się skończyć, a nie ma go w wykonanych: szybsze odświeżanie.
export function awaitingUpload() {
  const t = todayISO(), now = nowMin(), v = eff();
  const ss = sessionsFor(t, v, true);
  return ss.some(s => !s.done && !s.off && s.start + s.durSec / 60 < now && now < s.start + s.durSec / 60 + 240);
}
