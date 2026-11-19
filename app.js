import * as M from "./model.js";

// ---------- Narzędzia ----------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r10 = x => Math.round(x / 10) * 10, r5 = x => Math.max(0, Math.round(x / 5) * 5), r50 = x => Math.round(x / 50) * 50;
const fmt = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toFixed(d).replace(".", ",");
const kfmt = x => { const v = r10(x); return Math.abs(v) >= 1000 ? String(v).replace(/(\d)(\d{3})$/, "$1 $2") : String(v); };
const lfmt = ml => fmt(ml / 1000, 1) + " l";
const parseD = s => new Date(s + "T12:00:00");
const iso = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const todayISO = () => iso(new Date());
const addDays = (s, n) => iso(new Date(parseD(s).getTime() + n * 864e5));
const DOW = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"], DOWL = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
const dnum = s => { const d = parseD(s); return d.getDate() + "." + (d.getMonth() + 1); };
const num = v => { const x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : null; };

const LS = "fueling.v1", LSK = "fueling.key";
const API = "https://intervals.icu/api/v1/athlete/0";
const BACKUP_DATE = "2020-01-01", BACKUP_NAME = "fueling-app: kopia ustawień (nie usuwaj)", FUEL = "Daily fueling";
const MODES = { normal: "Normalnie", hp: "High performance", tired: "Zmęczenie", sick: "Choroba" };

const DEF = { meals: 4, minMeal: null, mass: null, base: null, baseMode: "auto", height: null, age: null, bodyFat: null, floor: null, prot: 2.0, fat: 0.9, ftp: null, wake: "6:30", sleep: "22:30", wkTime: "17:00", weTime: "09:00", sweat: 0.9, sodium: 700, cutOn: false, weekly: 700, cap: 150, hpCarb: 1.0 };
let S = {
  settings: { ...DEF }, modes: [], ov: { off: {}, skip: {}, time: {}, prio: {}, mealTimes: {} },
  cache: { events: [], wellness: [], athlete: null, fetchedAt: null, sig: null, changes: null },
  exp: {}, savedAt: 0, view: "day", sel: null, week: 0, logDate: null, modeScope: "day",
};
let R = null; // wynik obliczeń bieżącego okna

// ---------- Pamięć urządzenia ----------
const getKey = () => { try { return localStorage.getItem(LSK) || ""; } catch (e) { return ""; } };
const setKey = k => { try { k ? localStorage.setItem(LSK, k) : localStorage.removeItem(LSK); } catch (e) {} };
function load() {
  try {
    const x = JSON.parse(localStorage.getItem(LS) || "null"); if (!x) return;
    S.settings = { ...DEF, ...(x.settings || {}) }; S.modes = x.modes || []; S.ov = { off: {}, skip: {}, time: {}, prio: {}, mealTimes: {}, ...(x.ov || {}) };
    S.cache = { ...S.cache, ...(x.cache || {}) }; S.exp = x.exp || {}; S.savedAt = x.savedAt || 0;
  } catch (e) {}
}
function persist() {
  try { localStorage.setItem(LS, JSON.stringify({ settings: S.settings, modes: S.modes, ov: S.ov, cache: S.cache, exp: S.exp, savedAt: S.savedAt })); } catch (e) {}
}
// Zmiana danych użytkownika: zapis lokalny + kopia w Intervals (z opóźnieniem).
let backupT = null;
function changed() { S.savedAt = Date.now(); persist(); clearTimeout(backupT); backupT = setTimeout(pushBackup, 2500); }

// ---------- API Intervals ----------
async function api(path, opt = {}) {
  const key = getKey(); if (!key) throw new Error("nokey");
  const r = await fetch(API + path, {
    method: opt.method || "GET", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
    headers: { Authorization: "Basic " + btoa("API_KEY:" + key), ...(opt.body ? { "Content-Type": "application/json" } : {}) },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  if (r.status === 401 || r.status === 403) throw new Error("auth");
  if (!r.ok) throw new Error("http " + r.status);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
const errText = e => e.message === "auth" ? "Intervals odrzucił klucz API. Sprawdź go w Ustawieniach." : e.message === "nokey" ? "Brak klucza API. Dodaj go w Ustawieniach." : /fetch|network/i.test(e.message) ? "Brak połączenia z Intervals." : "Błąd Intervals (" + e.message + ").";

function backupPayload() { return { v: 1, savedAt: S.savedAt, settings: S.settings, modes: S.modes, ov: pruneOv(S.ov) }; }
function pruneOv(ov) { // zostaw tylko ostatnie 120 dni nadpisań dat
  const cut = addDays(todayISO(), -120), o = JSON.parse(JSON.stringify(ov));
  Object.keys(o.skip || {}).forEach(d => { if (d < cut) delete o.skip[d]; });
  Object.keys(o.mealTimes || {}).forEach(d => { if (d < cut) delete o.mealTimes[d]; });
  return o;
}
let backupId = null, backupBusy = false;
async function pushBackup() {
  if (!getKey() || backupBusy) return; backupBusy = true;
  try {
    const body = { name: BACKUP_NAME, description: JSON.stringify(backupPayload()) };
    if (!backupId) backupId = await findBackupId();
    if (backupId) await api(`/events/${backupId}`, { method: "PUT", body });
    else { const r = await api(`/events`, { method: "POST", body: { ...body, category: "NOTE", start_date_local: BACKUP_DATE + "T00:00:00" } }); backupId = r && r.id; }
    setSync();
  } catch (e) { setSync("Kopia w Intervals nie zapisała się: " + errText(e)); }
  finally { backupBusy = false; }
}
async function findBackupId(full) {
  const list = await api(`/events?oldest=${BACKUP_DATE}&newest=${BACKUP_DATE}`) || [];
  const e = list.find(x => x.name === BACKUP_NAME);
  if (!e) return null;
  backupId = e.id;
  if (full) { try { return { id: e.id, data: JSON.parse(e.description || "{}") }; } catch (err) { return { id: e.id, data: null }; } }
  return e.id;
}
async function pullBackup() {
  const b = await findBackupId(true);
  if (!b || !b.data || !b.data.savedAt) return false;
  if (b.data.savedAt <= S.savedAt) return false;
  S.settings = { ...DEF, ...(b.data.settings || {}) }; S.modes = b.data.modes || []; S.ov = { off: {}, skip: {}, time: {}, prio: {}, mealTimes: {}, ...(b.data.ov || {}) };
  S.savedAt = b.data.savedAt; persist(); return true;
}

function sigOf(events) {
  return events.filter(isSession).map(e => `${e.id}|${e.start_date_local}|${e.updated || ""}|${e.name}|${e.moving_time || ""}`).sort().join(";");
}
const isSession = e => e.category === "WORKOUT" || /^RACE/.test(e.category || "");

let busy = false;
async function refresh(manual) {
  if (busy) return; if (!getKey()) { setSync("Dodaj klucz API w Ustawieniach."); return; }
  busy = true; const b = $("refresh"); b.disabled = true; b.textContent = "Pobieram…";
  try {
    const t = todayISO();
    const [ath, ev, wl] = await Promise.all([
      api(""), api(`/events?oldest=${addDays(t, -21)}&newest=${addDays(t, 42)}`), api(`/wellness?oldest=${addDays(t, -120)}&newest=${t}`)]);
    const restored = await pullBackup().catch(() => false);
    const prev = S.cache.events || [], newSig = sigOf(ev || []);
    if (S.cache.sig && newSig !== S.cache.sig) S.cache.changes = diffEvents(prev, ev || []);
    else if (manual) S.cache.changes = null;
    const ride = (ath.sportSettings || []).find(s => (s.types || []).includes("Ride")) || {};
    S.cache = { ...S.cache, athlete: { weight: ath.icu_weight || ath.weight || null, ftp: ride.ftp || null, zones: ride.power_zones || null, tz: ath.timezone, height: ath.height || null, dob: ath.icu_date_of_birth || null, sex: ath.sex || null }, events: ev || [], wellness: wl || [], fetchedAt: Date.now(), sig: newSig };
    syncExp(ev || []);
    persist(); render();
    setSync(restored ? "Przywrócono ustawienia z kopii w Intervals." : "");
  } catch (e) { setSync(errText(e)); }
  finally { busy = false; b.disabled = false; b.textContent = "Odśwież"; }
}
function diffEvents(a, b) {
  const A = new Map(a.filter(isSession).map(e => [String(e.id), e])), B = new Map(b.filter(isSession).map(e => [String(e.id), e]));
  const out = [];
  B.forEach((e, id) => { const o = A.get(id); if (!o) out.push(`dodano: ${e.name} (${dnum(e.start_date_local.slice(0, 10))})`); else if ((o.updated || "") !== (e.updated || "") || o.start_date_local !== e.start_date_local) out.push(`zmieniono: ${e.name} (${dnum(e.start_date_local.slice(0, 10))})`); });
  A.forEach((e, id) => { if (!B.has(id) && e.start_date_local.slice(0, 10) >= todayISO()) out.push(`usunięto: ${e.name} (${dnum(e.start_date_local.slice(0, 10))})`); });
  return out.length ? { at: Date.now(), list: out.slice(0, 8), more: Math.max(0, out.length - 8) } : null;
}
function setSync(msg) {
  const t = S.cache.fetchedAt ? new Date(S.cache.fetchedAt) : null;
  $("sync").textContent = msg || (t ? `Intervals: ${t.toLocaleDateString("pl-PL", { day: "numeric", month: "numeric" })} ${t.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}` : getKey() ? "Jeszcze nie pobrano danych" : "Brak klucza API");
}

// ---------- Ustawienia efektywne ----------
// Utrzymanie dnia bez treningu = RMR × 1,2 (dzień siedzący z termogenezą posiłków) + kroki.
// RMR: Cunningham (500 + 22 × beztłuszczowa masa ciała), gdy znany % tkanki tłuszczowej; inaczej ten Haaf i Weijs 2014 (równanie dla sportowców).
function maintenance() {
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
// Kalibracja z danych: średnie kcal zjedzone minus zmiana masy (7700 kcal/kg) minus średni wydatek treningowy z planu.
let calCache = null;
function calibration(mass) {
  const key = (S.cache.fetchedAt || 0) + "|" + S.savedAt;
  if (calCache && calCache.key === key) return calCache.val;
  const from = addDays(todayISO(), -28), wl = (S.cache.wellness || []).filter(x => x.id >= from && x.id < todayISO());
  const kc = wl.filter(x => x.kcalConsumed), wts = wl.filter(x => x.weight);
  let val = null;
  if (kc.length >= 14 && wts.length >= 8) {
    const half = Math.floor(wts.length / 2), avg = a => a.reduce((t, x) => t + x.weight, 0) / a.length;
    const w1 = avg(wts.slice(0, half)), w2 = avg(wts.slice(half));
    const days = (parseD(wts[wts.length - 1].id) - parseD(wts[0].id)) / 864e5 / 2 || 1;
    const ftp = S.settings.ftp || (S.cache.athlete || {}).ftp || 250, zones = (S.cache.athlete || {}).zones;
    const train = kc.map(x => sessionsFor(x.id, { ftp, zones, sweat: 0.9, sodium: 700, wake: 390 }).filter(s => !s.off).reduce((t, s) => t + s.kcal, 0));
    const tdee = kc.reduce((t, x) => t + x.kcalConsumed, 0) / kc.length - (w2 - w1) * 7700 / days;
    val = { base: tdee - train.reduce((t, x) => t + x, 0) / train.length, tdee, n: kc.length, nw: wts.length, dW: w2 - w1 };
  }
  calCache = { key, val }; return val;
}
function eff() {
  const a = S.cache.athlete || {}, s = S.settings, m = maintenance();
  return { ...s, mass: m.mass, ftp: s.ftp || a.ftp || 250, zones: a.zones || [55, 75, 90, 105, 120, 150, 999], base: m.base, floor: m.floor, wake: M.parseHM(s.wake), sleep: M.parseHM(s.sleep) };
}

// ---------- Tryby z historią ----------
function modeFor(d) {
  let best = null;
  for (const e of S.modes) if (!e.cancelled && e.from <= d && (!e.to || d <= e.to) && (!best || e.at > best.at)) best = e;
  return best ? best.mode : "normal";
}
function setMode(d, mode, scope) {
  const at = Date.now();
  if (scope === "day") S.modes.push({ id: at, from: d, to: d, mode, at });
  else {
    S.modes.forEach(e => { if (e.cancelled || e.from === e.to) return; if (!e.to || e.to >= d) { if (e.from < d) e.to = addDays(d, -1); else e.cancelled = true; } });
    if (mode !== "normal") S.modes.push({ id: at, from: d, to: null, mode, at });
    else S.modes.push({ id: at, from: d, to: d, mode: "normal", at, end: true });
  }
  changed(); render();
}

// ---------- Obliczenia ----------
function sessionsFor(date, v) {
  const evs = (S.cache.events || []).filter(e => isSession(e) && (e.start_date_local || "").slice(0, 10) === date);
  const dow = parseD(date).getDay(), wknd = dow === 0 || dow === 6;
  const def = M.parseHM(wknd ? S.settings.weTime : S.settings.wkTime);
  let prevEnd = null;
  return evs.map(e => {
    const prio = S.ov.prio[e.id] != null ? !!S.ov.prio[e.id] : (e.category === "RACE_A" || e.category === "RACE_B");
    const s = M.analyzeSession(e, { ftp: v.ftp, zones: v.zones, sweat: v.sweat, sodium: v.sodium, prio });
    const evT = (e.start_date_local || "").slice(11, 16);
    let start = S.ov.time[e.id] ? M.parseHM(S.ov.time[e.id]) : evT && evT !== "00:00" ? M.parseHM(evT) : null;
    if (start == null) start = prevEnd == null ? def : prevEnd + 120;
    if (start + s.durSec / 60 > 23.5 * 60) start = Math.max(v.wake + 30, 23.5 * 60 - s.durSec / 60);
    prevEnd = start + s.durSec / 60;
    return { ...s, start, off: !!S.ov.off[e.id], ev: e, desc: e.description || "", steps: M.stepSummary((e.workout_doc || {}).steps, v.ftp) };
  }).sort((a, b) => a.start - b.start);
}
function notesFor(date) {
  return (S.cache.events || []).filter(e => (e.category === "NOTE" || e.category === "HOLIDAY") && (e.start_date_local || "").slice(0, 10) === date && !(e.name || "").startsWith(FUEL) && e.name !== BACKUP_NAME).map(e => e.name);
}
function dayTag(act) {
  const key = act.some(s => s.key), ride = act.some(s => s.ride || s.run), gym = act.some(s => s.gym), long = act.some(s => s.long);
  return key ? (long ? ["long", "Długo"] : ["key", "Jakość"]) : ride ? ["easy", "Lekko"] : gym ? ["gym", "Siła"] : ["rest", "Wolne"];
}
// ---------- Pory posiłków: dzień > dzień tygodnia > ustawienia > równy podział ----------
const DOWN = ["niedziele", "poniedziałki", "wtorki", "środy", "czwartki", "piątki", "soboty"];
const tStr = m => M.fmtTime(m);
const sortT = list => list.filter(Boolean).map(M.parseHM).sort((a, b) => a - b).map(tStr);
function autoTimes(v) { return M.evenTimes(v.wake, v.sleep, S.settings.meals).map(tStr); }
function timesFor(date, v) {
  const dow = parseD(date).getDay(), st = S.settings;
  if (S.ov.mealTimes && S.ov.mealTimes[date]) return { list: S.ov.mealTimes[date], src: "tylko ten dzień", lvl: "day" };
  if (st.dowTimes && st.dowTimes[dow]) return { list: st.dowTimes[dow], src: `ustawienia na ${DOWN[dow]}`, lvl: "dow" };
  if (st.mealTimes) return { list: st.mealTimes, src: "Twoje domyślne", lvl: "def" };
  return { list: autoTimes(v), src: "automatycznie z pobudki i snu", lvl: "auto" };
}
// Edytor listy godzin. onSet(lista) zapisuje, onReset usuwa nadpisanie.
function timesEditor(el, list, onSet, onReset, resetLabel) {
  el.innerHTML = `<div class="trows">${list.map((t, i) => `<div class="trow"><span class="muted small">${i + 1}.</span><input type="time" value="${tStr(M.parseHM(t)).padStart(5, "0")}" data-ti="${i}" aria-label="Posiłek ${i + 1}"><button type="button" class="x" data-tx="${i}" aria-label="Usuń posiłek ${i + 1}" ${list.length <= 2 ? "disabled" : ""}>×</button></div>`).join("")}</div>
    <div class="row"><button type="button" class="btn" data-tadd ${list.length >= 7 ? "disabled" : ""}>+ posiłek</button>${onReset ? `<button type="button" class="btn" data-treset>${resetLabel}</button>` : ""}</div>`;
  el.querySelectorAll("[data-ti]").forEach(inp => inp.onchange = () => { if (!inp.value) return; const l = list.slice(); l[+inp.dataset.ti] = inp.value.replace(/^0(\d)/, "$1"); onSet(sortT(l)); });
  el.querySelectorAll("[data-tx]").forEach(b => b.onclick = () => { const l = list.slice(); l.splice(+b.dataset.tx, 1); onSet(sortT(l)); });
  const add = el.querySelector("[data-tadd]"); if (add) add.onclick = () => {
    const m = list.map(M.parseHM); let best = 0, at = m[m.length - 1] + 120;
    for (let i = 0; i + 1 < m.length; i++) if (m[i + 1] - m[i] > best) { best = m[i + 1] - m[i]; at = (m[i] + m[i + 1]) / 2; }
    if (m.length < 2 || best < 150) at = Math.min(m[m.length - 1] + 120, 23 * 60);
    onSet(sortT([...list, tStr(Math.round(at / 15) * 15)]));
  };
  const rs = el.querySelector("[data-treset]"); if (rs) rs.onclick = onReset;
}

function computeRange(start, n) {
  const v = eff();
  const days = [];
  for (let i = 0; i < n + 2; i++) { const date = addDays(start, i); const ss = sessionsFor(date, v); days.push({ date, ss, act: ss.filter(s => !s.off), mode: modeFor(date) }); }
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
    d.plan = M.planDay({ sessions: d.ss }, { settings: v, times: d.times.list.map(M.parseHM), tomorrowKey: d.tomorrowKey, tomorrowLong: d.tomorrowLong, deficit: d.want, hp: d.mode === "hp", loadKg: d.loadKg });
    const [tag, tagLabel] = dayTag(d.act); d.tag = tag; d.tagLabel = tagLabel;
    d.notes = notesFor(d.date);
  });
  return { v, show };
}
// Tydzień zawsze od poniedziałku do niedzieli.
const mondayOf = d => addDays(d, -((parseD(d).getDay() + 6) % 7));
const winStart = () => addDays(mondayOf(todayISO()), 7 * S.week);

// ---------- Render: wspólne ----------
function render() {
  R = computeRange(winStart(), 7);
  if (!R.show.find(d => d.date === S.sel)) S.sel = (R.show.find(d => d.date === todayISO()) || R.show[0]).date;
  renderNav(); renderStrip(); renderSignal(); renderDay(); renderWeek(); renderLog(); renderSettings();
}
function renderNav() {
  const f = R.show[0], l = R.show[6];
  const rel = S.week === 0 ? "ten tydzień" : S.week === 1 ? "następny tydzień" : S.week === -1 ? "poprzedni tydzień" : "";
  const txt = `${dnum(f.date)} – ${dnum(l.date)}${rel ? `<small>${rel}</small>` : ""}`;
  $("wLabel").innerHTML = txt; $("wLabel2").innerHTML = txt;
  const minW = -2, maxW = 5;
  ["wPrev", "wPrev2"].forEach(id => $(id).disabled = S.week <= minW);
  ["wNext", "wNext2"].forEach(id => $(id).disabled = S.week >= maxW);
}
function renderStrip() {
  const t = todayISO();
  $("strip").innerHTML = R.show.map(d => {
    const flag = d.prio ? "prio" : d.mode !== "normal" ? d.mode : "";
    return `<button type="button" class="dbtn" data-day="${d.date}" aria-pressed="${d.date === S.sel}" aria-label="${DOWL[parseD(d.date).getDay()]} ${dnum(d.date)}, ${r10(d.plan.target)} kcal, ${d.tagLabel}">
    ${flag ? `<span class="flag ${flag}"></span>` : ""}<span class="${d.date === t ? "today" : "dw"}">${d.date === t ? "dziś" : DOW[parseD(d.date).getDay()]}</span><span class="dd">${parseD(d.date).getDate()}</span><span class="dk">${fmt(r10(d.plan.target) / 1000, 1)}k</span><span class="mk ${d.tag}"></span></button>`;
  }).join("");
}
function signals() {
  const w = (S.cache.wellness || []).filter(x => x.restingHR || x.hrv);
  if (w.length < 10) return null;
  const last = w.slice(-28), avg = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const rhr = last.map(x => x.restingHR).filter(Boolean), hrv = last.map(x => x.hrv).filter(Boolean);
  const o = { rhr28: avg(rhr), rhr3: avg(rhr.slice(-3)), hrv28: avg(hrv), hrv7: avg(hrv.slice(-7)), lastDate: w[w.length - 1].id };
  const dR = o.rhr3 - o.rhr28, dH = 1 - o.hrv7 / o.hrv28;
  o.rhrUp = dR >= 3; o.hrvDown = dH >= 0.10; o.edge = !o.rhrUp && !o.hrvDown && (dR >= 2 || dH >= 0.05); return o;
}
function renderSignal() {
  let h = "";
  const ch = S.cache.changes;
  if (ch) h += `<div class="signal info"><span class="dot"></span><div><div><b>Plan w Intervals zmienił się.</b> Przeliczyłem dni.</div><div class="small">${ch.list.map(esc).join("<br>")}${ch.more ? `<br>i ${ch.more} więcej` : ""}</div><button class="btn" type="button" id="chOk" style="margin-top:6px">OK</button></div></div>`;
  if (!getKey()) h += `<div class="signal warn"><span class="dot"></span><div>Dodaj klucz API Intervals w Ustawieniach, żeby pobrać plan treningów.</div></div>`;
  const g = signals();
  if (g && (g.rhrUp || g.hrvDown || g.edge)) {
    const parts = [g.rhrUp ? `RHR wyżej o ${fmt(g.rhr3 - g.rhr28)}` : "", g.hrvDown ? `HRV niżej o ${fmt(100 * (1 - g.hrv7 / g.hrv28), 0)}%` : ""].filter(Boolean).join(", ");
    const msg = g.rhrUp || g.hrvDown ? `Sygnały zmęczenia: ${parts}. Rozważ tryb Zmęczenie.` : "RHR lub HRV na granicy normy względem 28 dni.";
    h += `<div class="signal warn"><span class="dot"></span><div>${msg}<div class="small muted">RHR ${fmt(g.rhr3)} (3 dni) vs ${fmt(g.rhr28)} · HRV ${fmt(g.hrv7, 0)} ms (7 dni) vs ${fmt(g.hrv28, 0)} ms</div></div></div>`;
  }
  $("signal").innerHTML = h;
  const ok = $("chOk"); if (ok) ok.onclick = () => { S.cache.changes = null; persist(); renderSignal(); };
}

// ---------- Render: dzień ----------
function profileSvg(s, v) {
  if (!s.segs || !s.segs.length) return "";
  const W = 300, H = 44, T = s.durSec, maxP = 1.5;
  let x = 0, bars = "";
  for (const g of s.segs) {
    const p = g.w / v.ftp, w = g.dur / T * W, h = Math.max(2, Math.min(maxP, p) / maxP * (H - 4));
    const col = p >= 1.05 ? "var(--violet)" : p >= 0.88 ? "var(--violet-text)" : p >= 0.76 ? "var(--yellow)" : "var(--low)";
    bars += `<rect x="${x.toFixed(2)}" y="${(H - h).toFixed(2)}" width="${Math.max(0.6, w).toFixed(2)}" height="${h.toFixed(2)}" fill="${col}"/>`;
    x += w;
  }
  const ftpY = H - 1 / maxP * (H - 4);
  return `<svg class="prof" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Profil mocy treningu">${bars}<line x1="0" x2="${W}" y1="${ftpY}" y2="${ftpY}" stroke="var(--muted)" stroke-width="0.6" stroke-dasharray="3 3"/></svg>`;
}
function sessionCard(s, d, v) {
  const end = s.start + s.durSec / 60;
  const meta = s.ride ? `${Math.round(s.durSec / 60)} min · ${s.kj} kJ · śr. ${s.avgW} W · spalone węgle ok. ${r5(s.cho)} g${s.hardMin ? ` · ${s.hardMin} min ≥ 88% FTP` : ""}` : `${Math.round(s.durSec / 60)} min · ok. ${r10(s.kcal)} kcal`;
  const blocks = s.blocks && s.intra ? `<table class="fuel"><thead><tr><th>Odcinek</th><th>Węgle</th><th>Płyny</th><th>Mocno</th></tr></thead><tbody>${s.blocks.map(b => `<tr><td>${b.from}–${b.to}'</td><td>${b.intake ? `<b>${b.intake} g</b>` : "–"}</td><td>${b.ml} ml</td><td class="${b.hardMin ? "hard" : ""}">${b.hardMin ? b.hardMin + "'" : "–"}</td></tr>`).join("")}</tbody></table>` : "";
  const fsum = `<div class="fsum">${s.intra ? `<span>Węgle: <b>${s.intra} g</b> (${s.gph || r5(s.intra / (s.durSec / 3600))} g/h)</span>` : `<span>Węgle: <b>bez</b>${s.ride && s.durSec <= 65 * 60 ? " (do ok. 65 min wystarczy posiłek przed)" : ""}</span>`}<span class="water">Płyny: <b>${lfmt(s.fluid)}</b> (${s.mlh} ml/h)${s.bottles >= 0.5 ? ` · ${fmt(s.bottles, 1)} bidonu 750 ml` : ""}</span>${s.na ? `<span>Sód: <b>${s.na} mg/h</b></span>` : ""}</div>`;
  const time = M.fmtTime(s.start).padStart(5, "0");
  return `<div class="sess ${s.off ? "off" : ""} ${s.prio ? "prio" : ""}">
    <div class="mh"><div><div class="sn">${esc(s.name)}</div><div class="meta">${meta}</div></div></div>
    ${profileSvg(s, v)}
    ${s.steps ? `<div class="steps">${esc(s.steps)}</div>` : ""}
    ${s.assumed ? `<div class="warnline">Trening bez rozpisanych kroków i czasu. Przyjąłem ${Math.round(s.durSec / 60)} min przy ok. 70% FTP. Rozpisz go w Intervals, żeby liczby były dokładne.</div>` : ""}
    ${fsum}${blocks}
    ${s.deficitMl > 300 ? `<div class="small muted">Niedobór płynów po treningu ok. ${lfmt(s.deficitMl)}. W regeneracji wypij ok. ${lfmt(s.deficitMl * 1.5)}.</div>` : ""}
    <div class="ctl"><label>Start <input type="time" value="${time}" data-time="${s.id}"></label><span class="muted small">do ${M.fmtTime(end)}</span>
      <button type="button" class="toggle" data-prio="${s.id}" aria-pressed="${s.prio}">Priorytet</button>
      <label class="small"><input type="checkbox" data-sid="${s.id}" ${s.off ? "" : "checked"}> robię</label></div>
    ${s.desc ? `<details class="small"><summary>Opis z Intervals</summary><div class="muted" style="white-space:pre-wrap;margin-top:6px">${esc(s.desc)}</div></details>` : ""}
  </div>`;
}
function mealCard(m) {
  return `<div class="meal ${m.cut ? "cut" : ""}"><div class="mh"><div class="mn">${esc(m.name)}<span class="code c-${m.code}">${M.CODE_LABEL[m.code]}</span></div><div class="mk2">${r10(m.kcal)} kcal</div></div>
    <div class="mm"><span>B <b>${r5(m.p)} g</b></span><span>W <b>${r5(m.c)} g</b></span><span>T <b>${r5(m.f)} g</b></span><span class="water">Płyny <b>${m.ml} ml</b></span>${m.cut ? "<span>tu deficyt</span>" : ""}</div></div>`;
}
function dayLine(d, v) {
  const a = v.wake - 30, b = v.sleep + 30, W = 320, H = 34, x = t => (t - a) / (b - a) * W;
  let g = "";
  for (let h = Math.ceil((a + 20) / 60); h * 60 <= b - 20; h += 3) g += `<line x1="${x(h * 60)}" x2="${x(h * 60)}" y1="6" y2="22" stroke="var(--line)"/><text x="${x(h * 60)}" y="32" text-anchor="middle">${h}</text>`;
  d.act.forEach(s => g += `<rect x="${x(s.start)}" y="8" width="${Math.max(3, x(s.start + s.durSec / 60) - x(s.start))}" height="12" rx="3" fill="${s.prio ? "var(--violet)" : "var(--ink)"}"/>`);
  d.plan.meals.forEach(m => g += `<circle cx="${x(m.t)}" cy="14" r="${m.kind === "snack" ? 4 : 6}" fill="var(--${m.code === "H" ? "high" : m.code === "M" ? "mid" : "low"})" stroke="var(--surface)" stroke-width="1.5"/>`);
  return `<svg class="dayline" viewBox="0 0 ${W} ${H}" role="img" aria-label="Oś dnia: posiłki i trening">${g}</svg>`;
}
function renderDay() {
  const d = R.show.find(x => x.date === S.sel) || R.show[0], v = R.v, p = d.plan;
  const dt = parseD(d.date), mode = d.mode;
  const chips = [`<span class="chip ${d.tag}">${d.tagLabel}</span>`];
  if (d.prio) chips.push(`<span class="chip prio">Priorytet</span>`);
  if (mode !== "normal") chips.push(`<span class="chip ${mode}">${MODES[mode]}</span>`);
  if (d.loadKg) chips.push(`<span class="chip load">Ładowanie ${d.loadKg} g/kg</span>`);
  if (p.def > 0) chips.push(`<span class="chip def">deficyt −${r10(p.def)}</span>`);
  if (p.surplus > 20) chips.push(`<span class="chip hp">+${r10(p.surplus)} kcal</span>`);
  const why = mode === "sick" ? "Tryb Choroba: bez deficytu. Odznacz treningi, których nie zrobisz." : d.loadKg ? "Ładowanie przed startem: więcej węgli w każdym posiłku, mniej błonnika i tłuszczu." : d.prio ? "Dzień startu: posiłek przed min. 2 g/kg węgli ok. 3 h przed, pełna podaż w trakcie." : mode === "hp" ? `High performance: +${fmt(v.hpCarb, 1)} g/kg węgli ponad bilans, bez deficytu.` : !v.cutOn ? "Bilans na zero." : S.ov.skip[d.date] ? "Deficyt wyłączony ręcznie na ten dzień." : d.tomorrowKey ? "Jutro jakość, więc wieczór na zero." : p.def > 0 ? "Deficyt tylko z posiłków LOW, od wieczoru. Posiłki wokół treningu bez zmian." : "Bez deficytu.";

  // Timeline: posiłki i treningi wg czasu
  const items = [...p.meals.map(m => ({ t: m.t, h: mealCard(m), node: `c-${m.code}` })), ...d.ss.map(s => ({ t: s.start, h: sessionCard(s, d, v), node: "n-sess" }))].sort((a, b) => a.t - b.t);
  const tl = items.map(it => `<div class="ti"><div class="tt">${M.fmtTime(it.t)}</div><div class="rail"><span class="node ${it.node}"></span></div><div class="body">${it.h}</div></div>`).join("");

  $("dayView").innerHTML = `
  <div class="card">
    <div class="row between"><div><div class="eyebrow">${DOWL[dt.getDay()]} ${dnum(d.date)}</div><div class="big">${kfmt(p.target)}<small>kcal</small></div></div><div class="row">${chips.join("")}</div></div>
    <div class="macros">
      <div class="macro"><span>Białko</span><b>${r5(p.pT)} g</b><i>${fmt(p.pT / v.mass)} g/kg</i></div>
      <div class="macro"><span>Węgle</span><b>${r5(p.cT)} g</b><i>${fmt(p.cKg)} g/kg</i></div>
      <div class="macro"><span>Tłuszcz</span><b>${r5(p.fT)} g</b><i>${fmt(p.fT / v.mass)} g/kg</i></div>
      <div class="macro"><span>Płyny</span><b class="water">${lfmt(p.fluids.total)}</b><i>${p.fluids.intra ? "trening " + lfmt(p.fluids.intra) : "35 ml/kg"}</i></div>
    </div>
    <p class="band ${p.low ? "low" : ""}">Zakres węgli dla tego dnia: ${p.band.label}, ${p.band.lo}–${p.band.hi} g/kg.${p.low ? " Plan jest poniżej zakresu: podnieś utrzymanie albo wyłącz deficyt." : ""}</p>
    <p class="small muted">${why} Utrzymanie ${kfmt(p.maint)} kcal, trening ${kfmt(p.train)} kcal, w trakcie ${r5(p.intra)} g węgli.</p>
    ${d.notes.length ? `<p class="small"><b>W kalendarzu:</b> ${d.notes.map(esc).join(" · ")}</p>` : ""}
    ${dayLine(d, v)}
  </div>
  <div class="card dayset">
    <div class="seg" role="group" aria-label="Tryb dnia">${Object.entries(MODES).map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${mode === k}">${l === "High performance" ? "HP" : l}</button>`).join("")}</div>
    <div class="setrow"><span class="small muted">Zmiana trybu</span><select id="modeScope" class="inl" aria-label="Zakres trybu"><option value="day" ${S.modeScope === "day" ? "selected" : ""}>tylko ten dzień</option><option value="period" ${S.modeScope === "period" ? "selected" : ""}>od tego dnia</option></select></div>
    ${v.cutOn && !d.tomorrowKey && mode !== "sick" ? `<label class="setrow"><span class="small">Bez deficytu w tym dniu</span><input type="checkbox" class="sw" id="skipDay" ${S.ov.skip[d.date] ? "checked" : ""}></label>` : ""}
    <details id="dayTimesBox" ${S.openTimes ? "open" : ""}><summary class="setrow"><span class="small">Pory posiłków</span><span class="small muted">${esc(d.times.src)} ›</span></summary>
      <div class="timesbody">
        <div id="dayTimes"></div>
        <p class="small muted">Dotyczy tylko ${dnum(d.date)}. Przy treningu najbliższy posiłek przed staje się posiłkiem przed treningiem, pierwszy po treningu regeneracją.</p>
        <button type="button" class="btn" id="timesToDow">Ustaw na wszystkie ${DOWN[dt.getDay()]}</button>
      </div>
    </details>
  </div>
  <div class="card"><h2>Plan dnia</h2>${d.ss.length || p.meals.length ? `<div class="tl">${tl}</div>` : ""}
    <div class="between-water">Między posiłkami dopij ok. ${lfmt(p.fluids.between)} wody.</div>
    <div class="row between"><span class="small muted" id="dayEx">${exLine(d)}</span><button class="btn" type="button" id="exDay">${S.exp[d.date] ? "Zaktualizuj w Intervals" : "Wyślij dzień do Intervals"}</button></div>
  </div>`;
  $("dayTimesBox").ontoggle = e => { S.openTimes = e.target.open; };
  timesEditor($("dayTimes"), d.times.list, l => { S.ov.mealTimes[d.date] = l; S.openTimes = true; changed(); render(); },
    d.times.lvl === "day" ? () => { delete S.ov.mealTimes[d.date]; changed(); render(); } : null, "Przywróć");
  $("timesToDow").onclick = () => { const dow = dt.getDay(); S.settings.dowTimes = { ...(S.settings.dowTimes || {}), [dow]: d.times.list.slice() }; delete S.ov.mealTimes[d.date]; changed(); setRendered = false; render(); };
  document.querySelectorAll("#dayView [data-mode]").forEach(b => b.onclick = () => setMode(d.date, b.dataset.mode, S.modeScope));
  $("modeScope").onchange = e => { S.modeScope = e.target.value; };
  const sk = $("skipDay"); if (sk) sk.onchange = () => { if (sk.checked) S.ov.skip[d.date] = true; else delete S.ov.skip[d.date]; changed(); render(); };
  document.querySelectorAll("#dayView [data-sid]").forEach(el => el.onchange = () => { if (el.checked) delete S.ov.off[el.dataset.sid]; else S.ov.off[el.dataset.sid] = true; changed(); render(); });
  document.querySelectorAll("#dayView [data-time]").forEach(el => el.onchange = () => { if (el.value) { S.ov.time[el.dataset.time] = el.value; changed(); render(); } });
  document.querySelectorAll("#dayView [data-prio]").forEach(el => el.onclick = () => { const id = el.dataset.prio; const cur = el.getAttribute("aria-pressed") === "true"; S.ov.prio[id] = !cur; changed(); render(); });
  $("exDay").onclick = e => exportDays([d], e.target);
}

// ---------- Render: tydzień ----------
function renderWeek() {
  const show = R.show, v = R.v;
  const max = Math.max(...show.map(d => d.plan.maint + d.plan.surplus));
  const sum = f => show.reduce((a, d) => a + f(d), 0);
  const kj = sum(d => d.act.reduce((a, s) => a + (s.kj || 0), 0)), defT = sum(d => d.plan.def), surT = sum(d => d.plan.surplus);
  const hrs = sum(d => d.act.reduce((a, s) => a + s.durSec, 0)) / 3600;
  $("weekStats").innerHTML = `<div class="stats">
    <div class="stat"><span>Średnio dziennie</span><b>${kfmt(sum(d => d.plan.target) / 7)} kcal</b></div>
    <div class="stat"><span>Węgle średnio</span><b>${fmt(sum(d => d.plan.cKg) / 7)} g/kg</b></div>
    <div class="stat"><span>Trening</span><b>${fmt(hrs, 1)} h · ${kfmt(kj)} kJ</b></div>
    <div class="stat"><span>${surT > defT ? "Nadwyżka" : "Deficyt"} tygodnia</span><b>${surT > defT ? "+" + kfmt(surT) : defT ? "−" + kfmt(defT) : "0"} kcal</b></div>
  </div>`;
  $("weekRows").innerHTML = show.map(d => {
    const p = d.plan, base = v.base / max * 100, tr = Math.max(0, p.train) / max * 100, sp = p.surplus / max * 100, cut = p.def / max * 100;
    const names = d.act.map(s => s.name).join(", ");
    return `<button type="button" class="wr" data-go="${d.date}">
      <span class="wd">${DOW[parseD(d.date).getDay()]} ${dnum(d.date)}<small>${d.prio ? "Priorytet" : d.mode !== "normal" ? MODES[d.mode] : d.tagLabel}</small></span>
      <span class="wmid"><span class="wbar"><i class="b" style="width:${Math.max(0, base - (tr ? 0 : cut))}%"></i><i class="t" style="width:${Math.max(0, tr - cut)}%"></i><i class="s" style="width:${sp}%"></i></span>
      <span class="wdots">${p.meals.map(m => `<i class="c-${m.code}" title="${esc(m.name)}"></i>`).join("")}<span>${esc(names || "bez treningu")}</span></span></span>
      <span class="wk">${kfmt(p.target)}<small>${fmt(p.cKg)} g/kg</small></span></button>`;
  }).join("");
  document.querySelectorAll("#weekRows [data-go]").forEach(b => b.onclick = () => { S.sel = b.dataset.go; showView("day"); render(); window.scrollTo({ top: 0 }); });
}

// ---------- Eksport notatek do Intervals ----------
function exLine(d) {
  const e = S.exp[d.date]; if (!e) return "Nie ma jeszcze w Intervals.";
  return e.target !== r10(d.plan.target) ? `W Intervals jest ${kfmt(e.target)} kcal, plan to ${kfmt(d.plan.target)}.` : `W Intervals: ${kfmt(e.target)} kcal.`;
}
function noteFor(d) {
  const p = d.plan, L = [];
  L.push(`${d.tagLabel}${d.mode !== "normal" ? " · " + MODES[d.mode] : ""}${d.loadKg ? " · ładowanie " + d.loadKg + " g/kg" : ""} · ${p.def > 0 ? "deficyt −" + r10(p.def) + " kcal" : p.surplus > 20 ? "+" + r10(p.surplus) + " kcal" : "na zero"}`);
  L.push(`Razem: B ${r5(p.pT)} g · W ${r5(p.cT)} g (${fmt(p.cKg)} g/kg) · T ${r5(p.fT)} g · płyny ${lfmt(p.fluids.total)}`);
  L.push("");
  const items = [...p.meals.map(m => ({ t: m.t, s: `- ${M.fmtTime(m.t)} **${m.name}** [${M.CODE_LABEL[m.code]}]: ${r10(m.kcal)} kcal · B ${r5(m.p)} · W ${r5(m.c)} · T ${r5(m.f)} · ${m.ml} ml${m.cut ? " · tu deficyt" : ""}` })),
  ...d.act.map(s => ({ t: s.start, s: `- ${M.fmtTime(s.start)} **${s.name}**: ${s.intra ? `${s.intra} g węgli (${s.gph} g/h)` : "bez węgli"} · ${lfmt(s.fluid)} płynów${s.na ? ` · sód ${s.na} mg/h` : ""}` }))].sort((a, b) => a.t - b.t);
  items.forEach(i => L.push(i.s));
  L.push("");
  L.push(`Plan fueling, ${new Date().toLocaleString("pl-PL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}. Liczby ±10%.`);
  return { name: `${FUEL}: ${r10(p.target)} kcal`, description: L.join("\n") };
}
function syncExp(events) {
  const m = {};
  events.forEach(e => { if (e.category === "NOTE" && (e.name || "").startsWith(FUEL)) { const d = e.start_date_local.slice(0, 10); if (!m[d]) m[d] = { id: e.id, target: parseInt(String(e.name).replace(/\D/g, ""), 10) || 0 }; } });
  Object.keys(S.exp).forEach(d => { if (!m[d] && d >= todayISO()) delete S.exp[d]; });
  Object.assign(S.exp, m);
}
let exBusy = false;
async function exportDays(list, btn) {
  const st = btn.id === "exWeek" ? $("exStatus") : $("dayEx");
  list = list.filter(d => d.date >= todayISO());
  if (!list.length) { st.textContent = "Wysyłam tylko dni od dziś."; return; }
  if (!getKey()) { st.textContent = "Dodaj klucz API w Ustawieniach."; return; }
  if (exBusy) return; exBusy = true; const lbl = btn.textContent; btn.disabled = true; btn.textContent = "Wysyłam…";
  let ok = 0, fail = 0, last = "";
  try {
    const ev = await api(`/events?oldest=${list[0].date}&newest=${list[list.length - 1].date}`) || [];
    syncExp(ev);
    for (const d of list) {
      const nt = noteFor(d);
      try {
        const ex = S.exp[d.date]; let id = ex && ex.id;
        if (id) await api(`/events/${id}`, { method: "PUT", body: nt });
        else { const r = await api(`/events`, { method: "POST", body: { ...nt, category: "NOTE", start_date_local: d.date + "T00:00:00" } }); id = r && r.id; }
        S.exp[d.date] = { id, target: r10(d.plan.target) }; ok++;
      } catch (e) { fail++; last = errText(e); }
    }
    persist();
    st.textContent = fail ? `Wysłano ${ok}, błąd przy ${fail}: ${last}` : `Wysłano ${ok} ${ok === 1 ? "notatkę" : ok < 5 ? "notatki" : "notatek"} do Intervals.`;
  } catch (e) { st.textContent = errText(e); }
  finally { exBusy = false; btn.disabled = false; btn.textContent = lbl; if (btn.id === "exWeek") renderWeek(); else { const keep = st.textContent; renderDay(); $("dayEx").textContent = keep; } }
}
let exArm = null;
$("exWeek").onclick = () => {
  const b = $("exWeek"), n = R.show.filter(d => d.date >= todayISO()).length;
  if (!n) { $("exStatus").textContent = "Wysyłam tylko dni od dziś."; return; }
  if (!exArm) { b.textContent = `Potwierdź: ${n} ${n === 1 ? "dzień" : "dni"}`; exArm = setTimeout(() => { exArm = null; b.textContent = "Wyślij tydzień"; }, 5000); return; }
  clearTimeout(exArm); exArm = null; b.textContent = "Wyślij tydzień"; exportDays(R.show, b);
};

// ---------- Dziennik ----------
function wellnessOn(d) { return (S.cache.wellness || []).find(x => x.id === d) || {}; }
function planOn(date) {
  const inWin = R.show.find(x => x.date === date); if (inWin) return inWin;
  return computeRange(date, 1).show[0];
}
function renderLog() {
  if (!S.logDate) S.logDate = todayISO();
  const d = S.logDate, w = wellnessOn(d), pd = planOn(d), p = pd.plan;
  $("logDate").value = d;
  const setIf = (id, val) => { const el = $(id); if (document.activeElement !== el) el.value = val != null && val !== "" ? String(val).replace(".", ",") : ""; };
  setIf("logW", w.weight); setIf("logK", w.kcalConsumed); setIf("logB", w.protein); setIf("logC", w.carbohydrates); setIf("logF", w.fatTotal);
  $("logPrev").disabled = d <= addDays(todayISO(), -120); $("logNext").disabled = d >= todayISO();
  const mon = mondayOf(d), t = todayISO();
  $("logStrip").innerHTML = Array.from({ length: 7 }, (_, i) => addDays(mon, i)).map(x => {
    const w = wellnessOn(x), done = w.kcalConsumed || w.weight;
    return `<button type="button" class="dbtn" data-logday="${x}" aria-pressed="${x === d}" ${x > t ? "disabled" : ""} aria-label="${DOWL[parseD(x).getDay()]} ${dnum(x)}${done ? ", są wpisy" : ""}"><span class="${x === t ? "today" : "dw"}">${x === t ? "dziś" : DOW[parseD(x).getDay()]}</span><span class="dd">${parseD(x).getDate()}</span><span class="dk">${w.kcalConsumed ? fmt(w.kcalConsumed / 1000, 1) + "k" : w.weight ? fmt(w.weight, 1) : "–"}</span><span class="mk ${done ? "key" : "rest"}"></span></button>`;
  }).join("");
  document.querySelectorAll("[data-logday]").forEach(b => b.onclick = () => { S.logDate = b.dataset.logday; renderLog(); });
  $("logLabel").textContent = `${DOWL[parseD(d).getDay()]} ${dnum(d)}${d === todayISO() ? " · dziś" : ""}`;
  const has = w.kcalConsumed || w.protein || w.carbohydrates || w.fatTotal;
  const dv = (a, b) => b ? `${a >= b ? "+" : "−"}${kfmt(Math.abs(a - b))}` : "";
  $("logCmp").innerHTML = `<span class="h"></span><span class="h">kcal</span><span class="h">B, g</span><span class="h">W, g</span><span class="h">T, g</span>
    <span class="h">Plan</span><b>${kfmt(p.target)}</b><b>${r5(p.pT)}</b><b>${r5(p.cT)}</b><b>${r5(p.fT)}</b>
    <span class="h">Zjedzone</span><b>${w.kcalConsumed ? kfmt(w.kcalConsumed) : "–"}</b><b>${w.protein != null ? Math.round(w.protein) : "–"}</b><b>${w.carbohydrates != null ? Math.round(w.carbohydrates) : "–"}</b><b>${w.fatTotal != null ? Math.round(w.fatTotal) : "–"}</b>
    ${has ? `<span class="h">Różnica</span><span>${w.kcalConsumed ? dv(w.kcalConsumed, p.target) : ""}</span><span>${w.protein != null ? dv(w.protein, p.pT) : ""}</span><span>${w.carbohydrates != null ? dv(w.carbohydrates, p.cT) : ""}</span><span>${w.fatTotal != null ? dv(w.fatTotal, p.fT) : ""}</span>` : ""}`;
  $("logMode").textContent = `Tryb tego dnia: ${MODES[pd.mode]}. ${pd.act.length ? "Treningi: " + pd.act.map(s => s.name).join(", ") + "." : "Bez treningu."}`;
  // Wykres wagi
  const pts = (S.cache.wellness || []).filter(x => x.weight).map(x => ({ d: x.id, w: x.weight }));
  const list = (S.cache.wellness || []).filter(x => x.weight || x.kcalConsumed).slice().reverse().slice(0, 40);
  $("logList").innerHTML = list.length ? list.map(x => `<div><span>${dnum(x.id)}</span><span>${x.weight ? fmt(x.weight) + " kg" : "–"}</span><span>${x.kcalConsumed ? kfmt(x.kcalConsumed) + " kcal" : "–"}</span></div>`).join("") : `<p class="small muted">Brak wpisów w wellness.</p>`;
  if (pts.length < 2) { $("chart").innerHTML = `<p class="small muted">${pts.length ? "Jeden pomiar. Wykres pojawi się od drugiego." : "Wpisuj wagę 3–4 razy w tygodniu. Wykres pokaże pomiary i średnią z 7 dni."}</p>`; $("calib").innerHTML = ""; return; }
  const ma = pts.map(q => { const t = parseD(q.d).getTime(); const win = pts.filter(z => { const u = parseD(z.d).getTime(); return u <= t && u > t - 7 * 864e5; }); return { d: q.d, v: win.reduce((s, z) => s + z.w, 0) / win.length }; });
  const t0 = parseD(pts[0].d).getTime(), t1 = parseD(pts[pts.length - 1].d).getTime() || t0 + 1;
  const ys = pts.map(q => q.w), ymin = Math.floor(Math.min(...ys) - 0.3), ymax = Math.ceil(Math.max(...ys) + 0.3);
  const W = 640, H = 200, L = 34, Rr = 8, T = 8, B = 22;
  const x = t => L + (t - t0) / Math.max(1, t1 - t0) * (W - L - Rr), y = val => T + (ymax - val) / Math.max(0.1, ymax - ymin) * (H - T - B);
  let g = ""; const step = Math.max(1, Math.round((ymax - ymin) / 4));
  for (let k = ymin; k <= ymax; k += step) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(k)}" y2="${y(k)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(k) + 4}" text-anchor="end">${k}</text>`;
  g += [t0, t1].map(t => { const dd = new Date(t); return `<text x="${x(t)}" y="${H - 5}" text-anchor="middle">${dd.getDate()}.${dd.getMonth() + 1}</text>`; }).join("");
  const dots = pts.map(q => `<circle cx="${x(parseD(q.d).getTime())}" cy="${y(q.w)}" r="3" fill="var(--muted)" opacity=".55"/>`).join("");
  const line = ma.map((q, i) => (i ? "L" : "M") + x(parseD(q.d).getTime()).toFixed(1) + "," + y(q.v).toFixed(1)).join(" ");
  $("chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Waga i średnia 7 dni">${g}${dots}<path d="${line}" fill="none" stroke="var(--violet)" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  const cut = addDays(todayISO(), -21);
  const kc = (S.cache.wellness || []).filter(z => z.id >= cut && z.kcalConsumed).map(z => z.kcalConsumed), wp = ma.filter(z => z.d >= cut);
  if (kc.length >= 10 && wp.length >= 6) {
    const days = (parseD(wp[wp.length - 1].d) - parseD(wp[0].d)) / 864e5 || 1, dW = wp[wp.length - 1].v - wp[0].v;
    const tdee = kc.reduce((s, z) => s + z, 0) / kc.length - dW * 7700 / days;
    $("calib").innerHTML = `<div class="signal"><span class="dot" style="background:var(--violet)"></span><div>Z ${kc.length} dni z kcal i trendu wagi (${fmt(dW, 2)} kg w ${Math.round(days)} dni) średni wydatek to ok. <b>${kfmt(tdee)} kcal/d</b>, średnio z dni treningowych i wolnych. Porównaj ze średnią planu w widoku Tydzień.</div></div>`;
  } else $("calib").innerHTML = `<p class="muted">Szacunek realnego wydatku pojawi się po ok. 10 dniach z kcal i 6 pomiarach wagi z 3 tygodni (teraz ${kc.length} i ${wp.length}).</p>`;
}
$("logPrev").onclick = () => { S.logDate = addDays(S.logDate, -1); renderLog(); };
$("logNext").onclick = () => { S.logDate = addDays(S.logDate, 1); renderLog(); };
$("logDate").onchange = e => { if (e.target.value && e.target.value <= todayISO()) { S.logDate = e.target.value; renderLog(); } };
$("logForm").addEventListener("submit", async e => {
  e.preventDefault();
  const d = S.logDate, body = {};
  const map = { logW: "weight", logK: "kcalConsumed", logB: "protein", logC: "carbohydrates", logF: "fatTotal" };
  Object.entries(map).forEach(([id, k]) => { const x = num($(id).value); if (x != null) body[k] = k === "weight" ? Math.round(x * 10) / 10 : Math.round(x); });
  if (!Object.keys(body).length) { $("logStatus").textContent = "Wpisz co najmniej jedną wartość."; return; }
  if (body.weight && (body.weight < 30 || body.weight > 200)) { $("logStatus").textContent = "Sprawdź wagę."; return; }
  $("logStatus").textContent = "Zapisuję…";
  try {
    await api(`/wellness/${d}`, { method: "PUT", body: { id: d, ...body } });
    const wl = S.cache.wellness || []; const i = wl.findIndex(x => x.id === d);
    if (i >= 0) wl[i] = { ...wl[i], ...body }; else { wl.push({ id: d, ...body }); wl.sort((a, b) => a.id < b.id ? -1 : 1); }
    S.cache.wellness = wl; persist(); renderLog();
    $("logStatus").textContent = `Zapisano w Intervals (${dnum(d)}).`;
  } catch (err) { $("logStatus").textContent = errText(err); }
});

// ---------- Ustawienia ----------
function renderTimesSet() {
  const v = eff(), tab = S.timesTab || "def", st = S.settings;
  const tabs = [["def", "Domyślnie"], ["1", "Pn"], ["2", "Wt"], ["3", "Śr"], ["4", "Cz"], ["5", "Pt"], ["6", "Sb"], ["0", "Nd"]];
  $("timesTabs").innerHTML = tabs.map(([k, l]) => `<button type="button" data-ttab="${k}" aria-pressed="${tab === k}">${l}${k !== "def" && st.dowTimes && st.dowTimes[k] ? "•" : ""}</button>`).join("");
  document.querySelectorAll("[data-ttab]").forEach(b => b.onclick = () => { S.timesTab = b.dataset.ttab; renderTimesSet(); });
  if (tab === "def") {
    const list = st.mealTimes || autoTimes(v);
    $("timesNote").textContent = st.mealTimes ? "Twoje domyślne pory. Dni tygodnia bez własnych pór biorą je stąd." : `Teraz automatycznie: ${st.meals || 4} posiłki od pobudki do kolacji 3 h przed snem. Zmień dowolną porę, żeby zapisać własne.`;
    timesEditor($("timesEdit"), list, l => { S.settings.mealTimes = l; changed(); render(); }, st.mealTimes ? () => { S.settings.mealTimes = null; changed(); render(); } : null, "Wróć do automatycznych");
  } else {
    const own = st.dowTimes && st.dowTimes[tab];
    const list = own || st.mealTimes || autoTimes(v);
    $("timesNote").textContent = own ? `Własne pory na ${DOWN[+tab]}.` : `Na ${DOWN[+tab]} jak domyślnie. Zmień porę, żeby ustawić własne dla tego dnia tygodnia.`;
    timesEditor($("timesEdit"), list, l => { S.settings.dowTimes = { ...(st.dowTimes || {}), [tab]: l }; changed(); render(); },
      own ? () => { const o = { ...(st.dowTimes || {}) }; delete o[tab]; S.settings.dowTimes = o; changed(); render(); } : null, "Jak domyślnie");
  }
}
function renderMaint() {
  const m = maintenance(), s = S.settings;
  const rows = [
    ["Spoczynkowa przemiana materii (RMR)", `${kfmt(m.rmr)} kcal`, m.rmrEq === "Cunningham" ? `Cunningham, masa beztłuszczowa ${fmt(m.ffm)} kg` : `ten Haaf 2014: ${fmt(m.mass)} kg, ${Math.round(m.height * 100)} cm, ${m.age} lat`],
    ["Dzień siedzący, ×1,2", `${kfmt(m.rmr * 1.2)} kcal`, "z termogenezą posiłków"],
    ["Kroki", `+${kfmt(m.stepKcal)} kcal`, m.steps ? `średnio ${kfmt(m.steps)} dziennie z 28 dni w Intervals` : "brak kroków w Intervals, przyjęto 7000"],
    ["Wynik kalkulatora", `<b>${kfmt(m.formula)} kcal</b>`, ""],
    ["Z Twoich danych", m.cal ? `<b>${kfmt(m.cal.base)} kcal</b>` : "–", m.cal ? `${m.cal.n} dni z kcal, ${m.cal.nw} pomiarów wagi, zmiana ${fmt(m.cal.dW, 2)} kg; TDEE z treningiem ${kfmt(m.cal.tdee)}` : "potrzeba min. 14 dni z kcal i 8 pomiarów wagi z 28 dni"],
  ];
  $("maintCalc").innerHTML = rows.map(([a, b, c]) => `<div><span>${a}${c ? `<small>${esc(c)}</small>` : ""}</span><span>${b}</span></div>`).join("");
  $("maintNow").innerHTML = `Liczę z: <b>${kfmt(m.base)} kcal</b> (${m.src}). Minimum dnia bez treningu przy deficycie: ${kfmt(m.floor)} kcal.`;
  document.querySelectorAll("[data-bmode]").forEach(b => b.setAttribute("aria-pressed", String((s.baseMode || "auto") === b.dataset.bmode)));
  $("baseManual").hidden = s.baseMode !== "manual";
  if (document.activeElement !== $("baseVal")) $("baseVal").value = s.base || "";
}

const FIELDS = [
  ["mass", "Masa ciała, kg", "0.1", () => S.cache.athlete && S.cache.athlete.weight ? `z Intervals ${fmt(S.cache.athlete.weight)}` : ""],
  ["ftp", "FTP, W", "1", () => S.cache.athlete && S.cache.athlete.ftp ? `z Intervals ${S.cache.athlete.ftp}` : ""],
  ["height", "Wzrost, cm", "1", () => S.cache.athlete && S.cache.athlete.height ? `z Intervals ${Math.round(S.cache.athlete.height * 100)}` : ""],
  ["age", "Wiek", "1", () => `z Intervals ${maintenance().age}`],
  ["bodyFat", "Tkanka tłuszczowa, %", "0.1", () => "opcjonalnie"],
  ["prot", "Białko, g/kg", "0.1"], ["fat", "Tłuszcz, g/kg", "0.1"],
  ["sweat", "Pot, l/h przy 70% FTP", "0.1"], ["sodium", "Sód w pocie, mg/l", "50"], ["hpCarb", "HP: dodatkowe węgle, g/kg", "0.1"],
];
const MEAL_FIELDS = [
  ["meals", "Posiłki w dzień wolny", "1", () => "4"],
  ["minMeal", "Minimum posiłku, kcal", "10", () => `propozycja ${M.suggestMinMeal(eff().base, S.settings.meals)}`],
  ["wake", "Pobudka", "time"], ["sleep", "Sen", "time"], ["wkTime", "Trening w tygodniu", "time"], ["weTime", "Trening w weekend", "time"],
];
const CUT = [["weekly", "Deficyt na tydzień, kcal", "50"], ["cap", "Maks. deficyt dnia, kcal", "25"], ["floor", "Minimum dnia bez treningu, kcal", "10", () => `auto ${maintenance().floor}`]];
const LEVELS = { light: [700, 150], mid: [1050, 250], strong: [1750, 400] };
function fieldHtml([k, label, step, hint]) {
  const val = S.settings[k] ?? "", isT = step === "time";
  const v = isT ? String(val).padStart(5, "0") : String(val).replace(".", ",");
  const ph = hint ? hint() : "";
  return `<label>${label}<input data-set="${k}" ${isT ? 'type="time"' : `type="text" inputmode="decimal"`} value="${esc(v)}" placeholder="${esc(ph)}"></label>`;
}
let setRendered = false;
function renderSettings() {
  if (!setRendered || !document.querySelector("#v-set :focus")) {
    $("setFields").innerHTML = FIELDS.map(fieldHtml).join("");
    $("mealFields").innerHTML = MEAL_FIELDS.map(fieldHtml).join("");
    const lvl = Object.entries(LEVELS).find(([, [w, c]]) => w === S.settings.weekly && c === S.settings.cap);
    $("cutFields").innerHTML = `<label>Poziom<select id="cutLevel"><option value="light" ${lvl && lvl[0] === "light" ? "selected" : ""}>Lekki: 700/tydz., maks. 150/dzień</option><option value="mid" ${lvl && lvl[0] === "mid" ? "selected" : ""}>Umiarkowany: 1050/tydz., maks. 250/dzień</option><option value="strong" ${lvl && lvl[0] === "strong" ? "selected" : ""}>Mocny: 1750/tydz., maks. 400/dzień</option><option value="custom" ${!lvl ? "selected" : ""}>Własny</option></select></label>` + CUT.map(fieldHtml).join("");
    document.querySelectorAll("[data-set]").forEach(el => el.onchange = () => {
      const k = el.dataset.set; let val = el.type === "time" ? el.value : num(el.value);
      if (el.type === "time" && val) val = val.replace(/^0(\d)/, "$1");
      S.settings[k] = val === "" ? (DEF[k] ?? null) : val; changed(); render();
    });
    $("cutLevel").onchange = e => { const l = LEVELS[e.target.value]; if (l) { S.settings.weekly = l[0]; S.settings.cap = l[1]; changed(); render(); } };
    setRendered = true;
  }
  $("cutOn").checked = !!S.settings.cutOn;
  $("setNote").textContent = `Puste pola biorą wartości z Intervals albo domyślne. Teraz liczę z: masa ${fmt(eff().mass)} kg, FTP ${eff().ftp} W.`;
  renderMaint();
  renderTimesSet();
  const hist = S.modes.slice().sort((a, b) => b.at - a.at).slice(0, 30);
  $("modeHist").innerHTML = hist.length ? hist.map(e => `<div><span>${e.end ? "Koniec trybu" : MODES[e.mode]} · ${dnum(e.from)}${e.to && e.to !== e.from ? "–" + dnum(e.to) : e.to ? "" : " → do odwołania"}${e.cancelled ? " · anulowano" : ""}</span><button class="x" type="button" data-delmode="${e.id}" aria-label="Usuń wpis">×</button></div>`).join("") : `<p class="small muted">Brak wpisów. Tryb ustawiasz w widoku Dzień.</p>`;
  document.querySelectorAll("[data-delmode]").forEach(b => b.onclick = () => { S.modes = S.modes.filter(e => String(e.id) !== b.dataset.delmode); changed(); render(); });
  $("keyStatus").textContent = getKey() ? "Klucz zapisany na tym urządzeniu." : "Brak klucza.";
}
document.querySelectorAll("[data-bmode]").forEach(b => b.onclick = () => { S.settings.baseMode = b.dataset.bmode; if (b.dataset.bmode === "manual" && !S.settings.base) S.settings.base = maintenance().base; changed(); render(); });
$("baseVal").onchange = e => { const x = num(e.target.value); S.settings.base = x || null; changed(); render(); };
$("cutOn").onchange = e => { S.settings.cutOn = e.target.checked; changed(); render(); };
$("keyForm").addEventListener("submit", async e => {
  e.preventDefault(); const k = $("apiKey").value.trim(); if (!k) return;
  setKey(k); $("apiKey").value = ""; $("keyStatus").textContent = "Sprawdzam…";
  try { const a = await api(""); $("keyStatus").textContent = `Połączono z kontem ${a.id || ""}.`; await refresh(true); }
  catch (err) { setKey(""); $("keyStatus").textContent = errText(err); }
});
$("keyDel").onclick = () => { setKey(""); renderSettings(); setSync(); };
$("exportSet").onclick = () => {
  const blob = new Blob([JSON.stringify(backupPayload(), null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `fueling-ustawienia-${todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("importSet").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const x = JSON.parse(await f.text()); if (!x || x.v !== 1) throw new Error("format"); S.settings = { ...DEF, ...(x.settings || {}) }; S.modes = x.modes || []; S.ov = { off: {}, skip: {}, time: {}, prio: {}, mealTimes: {}, ...(x.ov || {}) }; changed(); setRendered = false; render(); $("setStatus").textContent = "Wczytano ustawienia."; }
  catch (err) { $("setStatus").textContent = "To nie jest plik ustawień tej aplikacji."; }
};
let wipeArm = null;
$("wipe").onclick = () => {
  const b = $("wipe");
  if (!wipeArm) { b.textContent = "Potwierdź usunięcie"; wipeArm = setTimeout(() => { wipeArm = null; b.textContent = "Usuń wszystko z urządzenia"; }, 5000); return; }
  clearTimeout(wipeArm); try { localStorage.removeItem(LS); localStorage.removeItem(LSK); } catch (err) {}
  location.reload();
};

// ---------- Nawigacja ----------
function showView(v) {
  S.view = v;
  ["day", "week", "log", "set"].forEach(k => { $("v-" + k).hidden = k !== v; });
  document.querySelectorAll(".tabs [data-view]").forEach(b => { if (b.dataset.view === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
}
document.querySelectorAll(".tabs [data-view]").forEach(b => b.onclick = () => { showView(b.dataset.view); window.scrollTo({ top: 0 }); });
document.addEventListener("click", e => { const b = e.target.closest("[data-day]"); if (b) { S.sel = b.dataset.day; renderStrip(); renderDay(); } });
const nav = n => () => { S.week += n; S.sel = null; render(); };
$("wPrev").onclick = nav(-1); $("wNext").onclick = nav(1); $("wPrev2").onclick = nav(-1); $("wNext2").onclick = nav(1);
$("refresh").onclick = () => refresh(true);

// ---------- Start i automatyczne odświeżanie ----------
load(); render(); setSync(); showView("day");
if (getKey()) refresh(false);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && Date.now() - (S.cache.fetchedAt || 0) > 2 * 60e3) refresh(false); });
setInterval(() => { if (document.visibilityState === "visible" && Date.now() - (S.cache.fetchedAt || 0) > 5 * 60e3) refresh(false); }, 60e3);
let lastDay = todayISO();
setInterval(() => { if (todayISO() !== lastDay) { lastDay = todayISO(); render(); } }, 10 * 60e3);
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
