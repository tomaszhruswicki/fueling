// API Intervals: pobieranie danych, kopia ustawień w notatce z datą 1.01.2020.
import { S, getKey, persist, applyUserData } from "./store.js";
import { todayISO, addDays, dnum } from "./util.js";

const API = "https://intervals.icu/api/v1/athlete/0";
export const BACKUP_DATE = "2020-01-01", BACKUP_NAME = "fueling-app: kopia ustawień (nie usuwaj)", FUEL = "Daily fueling";

export async function api(path, opt = {}) {
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
export const errText = e => e.message === "auth" ? "Intervals odrzucił klucz API. Sprawdź go w Ustawieniach." : e.message === "nokey" ? "Brak klucza API. Dodaj go w Ustawieniach." : /fetch|network/i.test(e.message) ? "Brak połączenia z Intervals." : "Błąd Intervals (" + e.message + ").";

export const isSession = e => e.category === "WORKOUT" || /^RACE/.test(e.category || "");

// ---------- Kopia ustawień ----------
export function backupPayload() { return { v: 1, savedAt: S.savedAt, settings: S.settings, modes: S.modes, ov: pruneOv(S.ov) }; }
function pruneOv(ov) { // zostaw tylko ostatnie 120 dni nadpisań dat
  const cut = addDays(todayISO(), -120), o = JSON.parse(JSON.stringify(ov));
  ["skip", "mealTimes"].forEach(k => Object.keys(o[k] || {}).forEach(d => { if (d < cut) delete o[k][d]; }));
  return o;
}
let backupId = null, backupBusy = false;
async function findBackup() {
  const list = await api(`/events?oldest=${BACKUP_DATE}&newest=${BACKUP_DATE}`) || [];
  const e = list.find(x => x.name === BACKUP_NAME);
  if (!e) return null;
  backupId = e.id;
  try { return { id: e.id, data: JSON.parse(e.description || "{}") }; } catch (err) { return { id: e.id, data: null }; }
}
// Zwraca null przy sukcesie albo tekst błędu.
export async function pushBackup() {
  if (!getKey() || backupBusy) return null; backupBusy = true;
  try {
    const body = { name: BACKUP_NAME, description: JSON.stringify(backupPayload()) };
    if (!backupId) await findBackup();
    if (backupId) await api(`/events/${backupId}`, { method: "PUT", body });
    else { const r = await api(`/events`, { method: "POST", body: { ...body, category: "NOTE", start_date_local: BACKUP_DATE + "T00:00:00" } }); backupId = r && r.id; }
    return null;
  } catch (e) { return "Kopia w Intervals nie zapisała się: " + errText(e); }
  finally { backupBusy = false; }
}
async function pullBackup() {
  const b = await findBackup();
  if (!b || !b.data || !b.data.savedAt || b.data.savedAt <= S.savedAt) return false;
  applyUserData(b.data); S.savedAt = b.data.savedAt; persist(); return true;
}

// ---------- Pobieranie ----------
const sigOf = events => events.filter(isSession).map(e => `${e.id}|${e.start_date_local}|${e.updated || ""}|${e.name}|${e.moving_time || ""}`).sort().join(";");
function diffEvents(a, b) {
  const A = new Map(a.filter(isSession).map(e => [String(e.id), e])), B = new Map(b.filter(isSession).map(e => [String(e.id), e]));
  const out = [], day = e => dnum(e.start_date_local.slice(0, 10));
  B.forEach((e, id) => { const o = A.get(id); if (!o) out.push(`dodano: ${e.name} (${day(e)})`); else if ((o.updated || "") !== (e.updated || "") || o.start_date_local !== e.start_date_local) out.push(`zmieniono: ${e.name} (${day(e)})`); });
  A.forEach((e, id) => { if (!B.has(id) && e.start_date_local.slice(0, 10) >= todayISO()) out.push(`usunięto: ${e.name} (${day(e)})`); });
  return out.length ? { at: Date.now(), list: out.slice(0, 8), more: Math.max(0, out.length - 8) } : null;
}
// Z aktywności zostawiamy tylko pola potrzebne do obliczeń (mniej danych w pamięci urządzenia).
const ACT_KEYS = ["id", "start_date_local", "type", "name", "moving_time", "elapsed_time", "icu_joules", "icu_average_watts", "icu_weighted_avg_watts", "icu_intensity", "calories", "carbs_ingested", "trainer", "paired_event_id"];
const slimAct = a => Object.fromEntries(ACT_KEYS.filter(k => a[k] != null).map(k => [k, a[k]]));

// Pobiera profil, plan (−21…+42 dni), wellness (120 dni) i wykonane aktywności (29 dni). Zwraca { restored }.
export async function fetchAll(manual) {
  const t = todayISO();
  const [ath, ev, wl, acts] = await Promise.all([
    api(""), api(`/events?oldest=${addDays(t, -21)}&newest=${addDays(t, 42)}`), api(`/wellness?oldest=${addDays(t, -120)}&newest=${t}`),
    api(`/activities?oldest=${addDays(t, -29)}&newest=${t}`).catch(() => null)]);
  const restored = await pullBackup().catch(() => false);
  const events = ev || [], newSig = sigOf(events);
  if (S.cache.sig && newSig !== S.cache.sig) S.cache.changes = diffEvents(S.cache.events || [], events);
  else if (manual) S.cache.changes = null;
  const slim = acts ? acts.map(slimAct) : S.cache.activities;
  if (acts && S.cache.activities) { // nowe wykonane aktywności z dziś: komunikat o przeliczeniu
    const known = new Set(S.cache.activities.map(a => String(a.id)));
    const fresh = slim.filter(a => !known.has(String(a.id)) && (a.start_date_local || "").slice(0, 10) === t);
    if (fresh.length) S.cache.newActs = { at: Date.now(), names: fresh.map(a => a.name || a.type) };
  }
  const ride = (ath.sportSettings || []).find(s => (s.types || []).includes("Ride")) || {};
  S.cache = { ...S.cache, athlete: { weight: ath.icu_weight || ath.weight || null, ftp: ride.ftp || null, zones: ride.power_zones || null, tz: ath.timezone, height: ath.height || null, dob: ath.icu_date_of_birth || null, sex: ath.sex || null }, events, wellness: wl || [], activities: slim, fetchedAt: Date.now(), sig: newSig };
  return { restored, actsOk: !!acts };
}
