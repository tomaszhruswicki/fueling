// Widok Dziennik: waga i kcal/makro z Fitatu do wellness w Intervals.
import * as M from "./model.js";
import { S, MODES, persist } from "./store.js";
import { api, errText } from "./intervals.js";
import { computeRange, maintenance, calibrationInfo, invalidateCal, CAL_DAYS, CAL_MIN_KCAL, CAL_MIN_W } from "./calc.js";
import { $, r5, fmt, kfmt, num, parseD, todayISO, addDays, dnum, mondayOf, DOW, DOWL } from "./util.js";

const FIELDS = { logW: "weight", logK: "kcalConsumed", logB: "protein", logC: "carbohydrates", logF: "fatTotal" };
const shown = v => v != null && v !== "" ? String(v).replace(".", ",") : "";
// Wartości pokazane w formularzu po ostatnim wypełnieniu. Zapis wysyła tylko pola, które użytkownik zmienił.
let base = { date: null, vals: {} };

const wellnessOn = d => (S.cache.wellness || []).find(x => x.id === d) || {};
function planOn(date, R) { return (R && R.show.find(x => x.date === date)) || computeRange(date, 1).show[0]; }

export function renderLog(R) {
  if (!S.logDate) S.logDate = todayISO();
  const d = S.logDate, w = wellnessOn(d), pd = planOn(d, R), p = pd.plan;
  $("logDate").value = d;
  const newDay = base.date !== d;
  if (newDay) base = { date: d, vals: {} };
  Object.entries(FIELDS).forEach(([id, k]) => {
    const el = $(id), val = shown(w[k]);
    // Pole edytowane (fokus albo wpis różny od tego, co pokazaliśmy) zostaje; reszta odświeża się z Intervals.
    if (!newDay && (document.activeElement === el || el.value !== (base.vals[id] ?? ""))) return;
    el.value = val; base.vals[id] = val;
  });
  $("logPrev").disabled = d <= addDays(todayISO(), -120); $("logNext").disabled = d >= todayISO();
  const mon = mondayOf(d), t = todayISO();
  $("logStrip").innerHTML = Array.from({ length: 7 }, (_, i) => addDays(mon, i)).map(x => {
    const w = wellnessOn(x), done = w.kcalConsumed || w.weight;
    return `<button type="button" class="dbtn" data-logday="${x}" aria-pressed="${x === d}" ${x > t ? "disabled" : ""} aria-label="${DOWL[parseD(x).getDay()]} ${dnum(x)}${done ? ", są wpisy" : ""}"><span class="${x === t ? "today" : "dw"}">${x === t ? "dziś" : DOW[parseD(x).getDay()]}</span><span class="dd">${parseD(x).getDate()}</span><span class="dk">${w.kcalConsumed ? fmt(w.kcalConsumed / 1000, 1) + "k" : w.weight ? fmt(w.weight, 1) : "–"}</span><span class="mk ${done ? "key" : "rest"}"></span></button>`;
  }).join("");
  document.querySelectorAll("[data-logday]").forEach(b => b.onclick = () => { S.logDate = b.dataset.logday; renderLog(R); });
  $("logLabel").textContent = `${DOWL[parseD(d).getDay()]} ${dnum(d)}${d === todayISO() ? " · dziś" : ""}`;
  const has = w.kcalConsumed || w.protein || w.carbohydrates || w.fatTotal;
  const dv = (a, b) => b ? `${a >= b ? "+" : "−"}${kfmt(Math.abs(a - b))}` : "";
  const val = (x, f) => x != null ? f(x) : "–";
  $("logCmp").innerHTML = `<span class="h"></span><span class="h">kcal</span><span class="h">B, g</span><span class="h">W, g</span><span class="h">T, g</span>
    <span class="h">Plan</span><b>${kfmt(p.target)}</b><b>${r5(p.pT)}</b><b>${r5(p.cT)}</b><b>${r5(p.fT)}</b>
    <span class="h">Zjedzone</span><b>${w.kcalConsumed ? kfmt(w.kcalConsumed) : "–"}</b><b>${val(w.protein, Math.round)}</b><b>${val(w.carbohydrates, Math.round)}</b><b>${val(w.fatTotal, Math.round)}</b>
    ${has ? `<span class="h">Różnica</span><span>${w.kcalConsumed ? dv(w.kcalConsumed, p.target) : ""}</span><span>${w.protein != null ? dv(w.protein, p.pT) : ""}</span><span>${w.carbohydrates != null ? dv(w.carbohydrates, p.cT) : ""}</span><span>${w.fatTotal != null ? dv(w.fatTotal, p.fT) : ""}</span>` : ""}`;
  const bad = M.dayCheck(w, p.target);
  $("logCheck").innerHTML = bad.length ? `<div class="signal warn"><span class="dot"></span><div><b>Sprawdź wpis:</b> ${bad.join("; ")}. Często to podwojone dane z synchronizacji. Popraw wartość i zapisz. Do czasu poprawki ten dzień nie wchodzi do kalibracji utrzymania.</div></div>` : "";
  const doneTxt = pd.done && pd.done.length ? ` Plan z wykonania: ${pd.done.map(s => s.name).join(", ")}${pd.orig ? ` (w planie było ${kfmt(pd.orig.target)} kcal)` : ""}.` : "";
  const missTxt = pd.missed && pd.missed.length ? ` Bez wykonania: ${pd.missed.map(s => s.name).join(", ")}.` : "";
  $("logMode").textContent = `Tryb tego dnia: ${MODES[pd.mode]}. ${pd.act.length ? "Treningi: " + pd.act.map(s => s.name).join(", ") + "." : "Bez treningu."}${doneTxt}${missTxt}`;
  renderChart();
}

function renderChart() {
  const pts = (S.cache.wellness || []).filter(x => x.weight).map(x => ({ d: x.id, w: x.weight }));
  const list = (S.cache.wellness || []).filter(x => x.weight || x.kcalConsumed).slice().reverse().slice(0, 40);
  $("logList").innerHTML = list.length ? list.map(x => `<div><span>${dnum(x.id)}</span><span>${x.weight ? fmt(x.weight) + " kg" : "–"}</span><span>${x.kcalConsumed ? kfmt(x.kcalConsumed) + " kcal" : "–"}${M.dayCheck(x).length ? " ⚠" : ""}</span></div>`).join("") : `<p class="small muted">Brak wpisów w wellness.</p>`;
  renderCalib();
  if (pts.length < 2) { $("chart").innerHTML = `<p class="small muted">${pts.length ? "Jeden pomiar. Wykres pojawi się od drugiego." : "Wpisuj wagę 3–4 razy w tygodniu. Wykres pokaże pomiary i średnią z 7 dni."}</p>`; return; }
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
}

// Ta sama kalibracja co w Ustawieniach (calc.js).
function renderCalib() {
  const m = maintenance(), c = m.cal, info = calibrationInfo();
  const skip = info.skipped ? ` Pominięto ${info.skipped} ${info.skipped === 1 ? "dzień" : "dni"} z niewiarygodnym wpisem.` : "";
  $("calib").innerHTML = c
    ? `<div class="signal"><span class="dot" style="background:var(--violet)"></span><div>Z ${c.n} dni z kcal i trendu wagi (${fmt(c.dW, 2)} kg w ${Math.round(c.span)} dni) średni wydatek to ok. <b>${kfmt(c.tdee)} kcal/d</b>. Po odjęciu treningu (${c.src === "wykonanie" ? "z wykonanych aktywności" : "z planu"}, średnio ${kfmt(c.train)} kcal/d) utrzymanie wychodzi ${kfmt(c.base)} kcal. Aplikacja liczy z ${kfmt(m.base)} kcal (${m.src}).${skip}</div></div>`
    : `<p class="muted">Kalibracja utrzymania pojawi się po ${CAL_MIN_KCAL} dniach z kcal i ${CAL_MIN_W} pomiarach wagi z ${CAL_DAYS} dni (teraz ${info.n} i ${info.nw}).${skip}</p>`;
}

export function initLog(getR, onSaved) {
  $("logPrev").onclick = () => { S.logDate = addDays(S.logDate, -1); renderLog(getR()); };
  $("logNext").onclick = () => { S.logDate = addDays(S.logDate, 1); renderLog(getR()); };
  $("logDate").onchange = e => { if (e.target.value && e.target.value <= todayISO()) { S.logDate = e.target.value; renderLog(getR()); } };
  $("logForm").addEventListener("submit", async e => {
    e.preventDefault();
    const d = S.logDate, body = {}, st = $("logStatus");
    let cleared = false;
    Object.entries(FIELDS).forEach(([id, k]) => {
      const raw = $(id).value.trim();
      if (raw === (base.vals[id] ?? "")) return; // bez zmian: nie wysyłamy
      const x = num(raw);
      if (x == null) { if (raw === "") cleared = true; return; }
      body[k] = k === "weight" ? Math.round(x * 10) / 10 : Math.round(x);
    });
    if (!Object.keys(body).length) { st.textContent = cleared ? "Czyszczenie pól nie jest obsługiwane. Popraw wartość w Intervals." : "Nic nie zmieniono."; return; }
    if (body.weight && (body.weight < 30 || body.weight > 200)) { st.textContent = "Sprawdź wagę."; return; }
    st.textContent = "Zapisuję…";
    try {
      await api(`/wellness/${d}`, { method: "PUT", body: { id: d, ...body } });
      const wl = S.cache.wellness || []; const i = wl.findIndex(x => x.id === d);
      if (i >= 0) wl[i] = { ...wl[i], ...body }; else { wl.push({ id: d, ...body }); wl.sort((a, b) => a.id < b.id ? -1 : 1); }
      S.cache.wellness = wl; invalidateCal(); persist();
      base = { date: null, vals: {} }; onSaved();
      st.textContent = `Zapisano w Intervals (${dnum(d)}): ${Object.keys(body).map(k => ({ weight: "waga", kcalConsumed: "kcal", protein: "białko", carbohydrates: "węgle", fatTotal: "tłuszcz" }[k])).join(", ")}.`;
    } catch (err) { st.textContent = errText(err); }
  });
}
