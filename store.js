// Stan aplikacji i pamięć urządzenia (localStorage). Kopia w Intervals: intervals.js.
const LS = "fueling.v1", LSK = "fueling.key";

export const MODES = { normal: "Normalnie", hp: "High performance", tired: "Zmęczenie", sick: "Choroba" };
export const DEF = { meals: 4, minMeal: null, mass: null, base: null, baseMode: "auto", height: null, age: null, bodyFat: null, floor: null, prot: 2.0, fat: 0.9, ftp: null, wake: "6:30", sleep: "22:30", wkTime: "17:00", weTime: "09:00", sweat: 0.9, sodium: 700, cutOn: false, cutLow: 400, recomp: false, hpCarb: 1.0 };
export const normOv = ov => ({ off: {}, skip: {}, time: {}, prio: {}, mealTimes: {}, ...(ov || {}) });

export const S = {
  settings: { ...DEF }, modes: [], ov: normOv(),
  cache: { events: [], wellness: [], activities: null, athlete: null, fetchedAt: null, sig: null, changes: null, newActs: null },
  exp: {}, savedAt: 0, view: "day", sel: null, week: 0, logDate: null, modeScope: "day",
};

// Haki ustawiane przez app.js: pełne przerysowanie i zapis kopii ustawień w Intervals.
export const hooks = { render: () => {}, backup: () => {} };

export const getKey = () => { try { return localStorage.getItem(LSK) || ""; } catch (e) { return ""; } };
export const setKey = k => { try { k ? localStorage.setItem(LSK, k) : localStorage.removeItem(LSK); } catch (e) {} };

export function applyUserData(x) {
  const old = x.settings || {};
  // Starsze ustawienia: poziomy tygodniowe (weekly/cap), poziomy lekki/umiarkowany/mocny/własny (cutLevel, lowMax).
  // Od suwaka (spec 2026-11-20): cutLow = maks. deficyt dnia luźnego.
  const lvl = old.cutLevel || (old.weekly == null ? "light" : ({ "700|150": "light", "1050|250": "mid", "1750|400": "strong" })[old.weekly + "|" + old.cap] || "custom");
  const { weekly, cap, cutLevel, lowMax, ...rest } = old;
  const cutLow = old.cutLow ?? ({ light: 400, mid: 500, strong: 600 }[lvl] ?? (lowMax || cap || 400));
  S.settings = { ...DEF, ...rest, cutLow: Math.max(0, Math.min(600, Math.round(cutLow / 50) * 50)) };
  S.modes = x.modes || []; S.ov = normOv(x.ov);
}
export function load() {
  try {
    const x = JSON.parse(localStorage.getItem(LS) || "null"); if (!x) return;
    applyUserData(x);
    S.cache = { ...S.cache, ...(x.cache || {}) }; S.exp = x.exp || {}; S.savedAt = x.savedAt || 0;
  } catch (e) {}
}
export function persist() {
  try { localStorage.setItem(LS, JSON.stringify({ settings: S.settings, modes: S.modes, ov: S.ov, cache: S.cache, exp: S.exp, savedAt: S.savedAt })); } catch (e) {}
}
export function wipe() { try { localStorage.removeItem(LS); localStorage.removeItem(LSK); } catch (e) {} }

// Zmiana danych użytkownika: zapis lokalny + kopia w Intervals po 2,5 s.
let backupT = null;
export function changed() { S.savedAt = Date.now(); persist(); clearTimeout(backupT); backupT = setTimeout(() => hooks.backup(), 2500); }
