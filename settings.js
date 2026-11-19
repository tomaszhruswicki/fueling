// Widok Ustawienia: klucz API, utrzymanie, pory posiłków, parametry, deficyt, historia trybów, kopia w pliku.
import * as M from "./model.js";
import { S, DEF, MODES, hooks, getKey, setKey, changed, applyUserData, wipe } from "./store.js";
import { api, errText, backupPayload } from "./intervals.js";
import { maintenance, eff, autoTimes, tStr, calibrationInfo, CAL_DAYS, CAL_MIN_KCAL, CAL_MIN_W } from "./calc.js";
import { $, esc, fmt, kfmt, num, todayISO, dnum, DOWN } from "./util.js";

const render = () => hooks.render();
const sortT = list => list.filter(Boolean).map(M.parseHM).sort((a, b) => a - b).map(tStr);

// Edytor listy godzin (też w widoku Dzień). onSet(lista) zapisuje, onReset usuwa nadpisanie.
export function timesEditor(el, list, onSet, onReset, resetLabel) {
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
  const m = maintenance(), s = S.settings, c = m.cal, info = calibrationInfo();
  const rows = [
    ["Spoczynkowa przemiana materii (RMR)", `${kfmt(m.rmr)} kcal`, m.rmrEq === "Cunningham" ? `Cunningham, masa beztłuszczowa ${fmt(m.ffm)} kg` : `ten Haaf 2014: ${fmt(m.mass)} kg, ${Math.round(m.height * 100)} cm, ${m.age} lat`],
    ["Dzień siedzący, ×1,2", `${kfmt(m.rmr * 1.2)} kcal`, "z termogenezą posiłków"],
    ["Kroki", `+${kfmt(m.stepKcal)} kcal`, m.steps ? `średnio ${kfmt(m.steps)} dziennie z 28 dni w Intervals` : "brak kroków w Intervals, przyjęto 7000"],
    ["Wynik kalkulatora", `<b>${kfmt(m.formula)} kcal</b>`, ""],
    ["Z Twoich danych", c ? `<b>${kfmt(c.base)} kcal</b>` : "–", c ? `${c.n} dni z kcal, ${c.nw} pomiarów wagi, trend ${fmt(c.dW, 2)} kg; wydatek całkowity ${kfmt(c.tdee)}, trening ${kfmt(c.train)} (${c.src === "wykonanie" ? "z wykonania" : "z planu"})${c.skipped ? `, pominięto ${c.skipped} niewiarygodnych dni` : ""}` : `potrzeba min. ${CAL_MIN_KCAL} dni z kcal i ${CAL_MIN_W} pomiarów wagi z ${CAL_DAYS} dni (teraz ${info.n} i ${info.nw})`],
  ];
  $("maintCalc").innerHTML = rows.map(([a, b, h]) => `<div><span>${a}${h ? `<small>${esc(h)}</small>` : ""}</span><span>${b}</span></div>`).join("");
  $("maintNow").innerHTML = `Liczę z: <b>${kfmt(m.base)} kcal</b> (${m.src}). Minimum dnia bez treningu przy deficycie: ${kfmt(m.floor)} kcal.`;
  document.querySelectorAll("[data-bmode]").forEach(b => b.setAttribute("aria-pressed", String((s.baseMode || "auto") === b.dataset.bmode)));
  $("baseManual").hidden = s.baseMode !== "manual";
  if (document.activeElement !== $("baseVal")) $("baseVal").value = s.base || "";
}

const ath = () => S.cache.athlete || {};
const FIELDS = [
  ["mass", "Masa ciała, kg", "0.1", () => ath().weight ? `z Intervals ${fmt(ath().weight)}` : ""],
  ["ftp", "FTP, W", "1", () => ath().ftp ? `z Intervals ${ath().ftp}` : ""],
  ["height", "Wzrost, cm", "1", () => ath().height ? `z Intervals ${Math.round(ath().height * 100)}` : ""],
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
const LEVELS = { light: [700, 150, "Lekki"], mid: [1050, 250, "Umiarkowany"], strong: [1750, 400, "Mocny"] };
function fieldHtml([k, label, step, hint]) {
  const val = S.settings[k] ?? "", isT = step === "time";
  const v = isT ? String(val).padStart(5, "0") : String(val).replace(".", ",");
  return `<label>${label}<input data-set="${k}" ${isT ? 'type="time"' : `type="text" inputmode="decimal"`} value="${esc(v)}" placeholder="${esc(hint ? hint() : "")}"></label>`;
}

let fieldsDirty = true; // przerysuj pola (nie w trakcie edycji)
export const resetSettingsFields = () => { fieldsDirty = true; };
export function renderSettings() {
  if (fieldsDirty || !document.querySelector("#v-set :focus")) {
    $("setFields").innerHTML = FIELDS.map(fieldHtml).join("");
    $("mealFields").innerHTML = MEAL_FIELDS.map(fieldHtml).join("");
    const lvl = Object.entries(LEVELS).find(([, [w, c]]) => w === S.settings.weekly && c === S.settings.cap);
    $("cutFields").innerHTML = `<label>Poziom<select id="cutLevel">${Object.entries(LEVELS).map(([k, [w, c, l]]) => `<option value="${k}" ${lvl && lvl[0] === k ? "selected" : ""}>${l}: ${w}/tydz., maks. ${c}/dzień</option>`).join("")}<option value="custom" ${!lvl ? "selected" : ""}>Własny</option></select></label>` + CUT.map(fieldHtml).join("");
    document.querySelectorAll("[data-set]").forEach(el => el.onchange = () => {
      const k = el.dataset.set; let val = el.type === "time" ? el.value : num(el.value);
      if (el.type === "time" && val) val = val.replace(/^0(\d)/, "$1");
      S.settings[k] = val === "" || val == null ? (DEF[k] ?? null) : val; changed(); render();
    });
    $("cutLevel").onchange = e => { const l = LEVELS[e.target.value]; if (l) { S.settings.weekly = l[0]; S.settings.cap = l[1]; changed(); render(); } };
    fieldsDirty = false;
  }
  $("cutOn").checked = !!S.settings.cutOn;
  const v = eff();
  $("setNote").textContent = `Puste pola biorą wartości z Intervals albo domyślne. Teraz liczę z: masa ${fmt(v.mass)} kg, FTP ${v.ftp} W.`;
  renderMaint();
  renderTimesSet();
  const hist = S.modes.slice().sort((a, b) => b.at - a.at).slice(0, 30);
  $("modeHist").innerHTML = hist.length ? hist.map(e => `<div><span>${e.end ? "Koniec trybu" : MODES[e.mode]} · ${dnum(e.from)}${e.to && e.to !== e.from ? "–" + dnum(e.to) : e.to ? "" : " → do odwołania"}${e.cancelled ? " · anulowano" : ""}</span><button class="x" type="button" data-delmode="${e.id}" aria-label="Usuń wpis">×</button></div>`).join("") : `<p class="small muted">Brak wpisów. Tryb ustawiasz w widoku Dzień.</p>`;
  document.querySelectorAll("[data-delmode]").forEach(b => b.onclick = () => { S.modes = S.modes.filter(e => String(e.id) !== b.dataset.delmode); changed(); render(); });
  $("keyStatus").textContent = getKey() ? "Klucz zapisany na tym urządzeniu." : "Brak klucza.";
}

export function initSettings(refresh, setSync) {
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
    try { const x = JSON.parse(await f.text()); if (!x || x.v !== 1) throw new Error("format"); applyUserData(x); changed(); fieldsDirty = true; render(); $("setStatus").textContent = "Wczytano ustawienia."; }
    catch (err) { $("setStatus").textContent = "To nie jest plik ustawień tej aplikacji."; }
  };
  let wipeArm = null;
  $("wipe").onclick = () => {
    const b = $("wipe");
    if (!wipeArm) { b.textContent = "Potwierdź usunięcie"; wipeArm = setTimeout(() => { wipeArm = null; b.textContent = "Usuń wszystko z urządzenia"; }, 5000); return; }
    clearTimeout(wipeArm); wipe(); location.reload();
  };
}
