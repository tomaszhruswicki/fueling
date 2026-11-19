// Interfejs: widoki Dzień i Tydzień, eksport planu do Intervals, nawigacja, odświeżanie.
// Obliczenia: model.js (bez stanu) i calc.js (na stanie). Dziennik: log.js. Ustawienia: settings.js.
import * as M from "./model.js";
import { S, MODES, hooks, load, persist, changed, getKey } from "./store.js";
import { api, errText, fetchAll, pushBackup, FUEL } from "./intervals.js";
import { computeRange, winStart, awaitingUpload } from "./calc.js";
import { renderLog, initLog } from "./log.js";
import { renderSettings, initSettings, timesEditor, resetSettingsFields } from "./settings.js";
import { $, esc, r10, r5, fmt, kfmt, sgn, lfmt, parseD, todayISO, addDays, dnum, DOW, DOWL, DOWN } from "./util.js";

let R = null; // wynik obliczeń bieżącego tygodnia

// ---------- Synchronizacja ----------
function setSync(msg) {
  const t = S.cache.fetchedAt ? new Date(S.cache.fetchedAt) : null;
  $("sync").textContent = msg || (t ? `Intervals: ${t.toLocaleDateString("pl-PL", { day: "numeric", month: "numeric" })} ${t.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}` : getKey() ? "Jeszcze nie pobrano danych" : "Brak klucza API");
}
let busy = false;
async function refresh(manual) {
  if (busy) return; if (!getKey()) { setSync("Dodaj klucz API w Ustawieniach."); return; }
  busy = true; const b = $("refresh"); b.disabled = true; b.textContent = "Pobieram…";
  try {
    const { restored, actsOk } = await fetchAll(manual);
    syncExp(S.cache.events);
    if (restored) resetSettingsFields();
    persist(); render();
    setSync(restored ? "Przywrócono ustawienia z kopii w Intervals." : actsOk ? "" : "Nie pobrałem wykonanych treningów, plan dnia bez przeliczenia.");
  } catch (e) { setSync(errText(e)); }
  finally { busy = false; b.disabled = false; b.textContent = "Odśwież"; }
}
hooks.backup = async () => { const err = await pushBackup(); setSync(err || ""); };

// ---------- Tryby ----------
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

// ---------- Render: wspólne ----------
function render() {
  R = computeRange(winStart(), 7);
  if (!R.show.find(d => d.date === S.sel)) S.sel = (R.show.find(d => d.date === todayISO()) || R.show[0]).date;
  renderNav(); renderStrip(); renderSignal(); renderDay(); renderWeek(); renderLog(R); renderSettings();
}
hooks.render = render;
function renderNav() {
  const f = R.show[0], l = R.show[6];
  const rel = S.week === 0 ? "ten tydzień" : S.week === 1 ? "następny tydzień" : S.week === -1 ? "poprzedni tydzień" : "";
  const txt = `${dnum(f.date)} – ${dnum(l.date)}${rel ? `<small>${rel}</small>` : ""}`;
  $("wLabel").innerHTML = txt; $("wLabel2").innerHTML = txt;
  ["wPrev", "wPrev2"].forEach(id => $(id).disabled = S.week <= -2);
  ["wNext", "wNext2"].forEach(id => $(id).disabled = S.week >= 5);
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
  const o = { rhr28: avg(rhr), rhr3: avg(rhr.slice(-3)), hrv28: avg(hrv), hrv7: avg(hrv.slice(-7)) };
  const dR = o.rhr3 - o.rhr28, dH = 1 - o.hrv7 / o.hrv28;
  o.rhrUp = dR >= 3; o.hrvDown = dH >= 0.10; o.edge = !o.rhrUp && !o.hrvDown && (dR >= 2 || dH >= 0.05); return o;
}
function renderSignal() {
  let h = "";
  const ch = S.cache.changes, na = S.cache.newActs;
  if (na && Date.now() - na.at < 18 * 3600e3) h += `<div class="signal info"><span class="dot"></span><div><div><b>Wgrano trening:</b> ${na.names.map(esc).join(", ")}. Przeliczyłem resztę dnia.</div><button class="btn" type="button" id="naOk" style="margin-top:6px">OK</button></div></div>`;
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
  const ok2 = $("naOk"); if (ok2) ok2.onclick = () => { S.cache.newActs = null; persist(); renderSignal(); };
}

// ---------- Render: dzień ----------
function profileSvg(s, v) {
  if (!s.segs || !s.segs.length) return "";
  const W = 300, H = 44, T = s.durSec, maxP = 1.5;
  let x = 0, bars = "";
  for (const g of s.segs) {
    const p = g.w / v.ftp, w = g.dur / T * W, h = Math.max(2, Math.min(maxP, p) / maxP * (H - 4));
    const col = p >= M.K.VO2 ? "var(--violet)" : p >= M.K.HARD ? "var(--violet-text)" : p >= 0.76 ? "var(--yellow)" : "var(--low)";
    bars += `<rect x="${x.toFixed(2)}" y="${(H - h).toFixed(2)}" width="${Math.max(0.6, w).toFixed(2)}" height="${h.toFixed(2)}" fill="${col}"/>`;
    x += w;
  }
  const ftpY = H - 1 / maxP * (H - 4);
  return `<svg class="prof" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Profil mocy treningu">${bars}<line x1="0" x2="${W}" y1="${ftpY}" y2="${ftpY}" stroke="var(--muted)" stroke-width="0.6" stroke-dasharray="3 3"/></svg>`;
}
const sessMeta = s => s.ride && s.kj ? `${Math.round(s.durSec / 60)} min · ${s.kj} kJ · śr. ${s.avgW} W · spalone węgle ok. ${r5(s.cho)} g${s.hardMin ? ` · ${s.hardMin} min ≥ 88% FTP` : ""}` : `${Math.round(s.durSec / 60)} min · ok. ${r10(s.kcal)} kcal`;
function doneCard(s) {
  const p = s.plan;
  const cmp = p ? `<div class="small muted">Plan: ${sessMeta(p)}. Różnica w bilansie dnia: ${sgn(s.kcal - p.kcal)} kcal.</div>` : `<div class="small muted">Trening poza planem, doliczony do bilansu dnia.</div>`;
  const intra = s.intra ? `W trakcie: <b>${s.intra} g</b> węgli${s.intraAssumed ? (p ? " (przyjęte z planu, wpisz „carbs” w Intervals, żeby było dokładnie)" : " (przyjęte ok. 40 g/h)") : " (z Intervals)"}` : "W trakcie: bez węgli";
  return `<div class="sess done ${s.prio ? "prio" : ""}">
    <div class="mh"><div><div class="sn">${esc(s.name)} <span class="code c-done">wykonano</span></div><div class="meta">${sessMeta(s)}</div></div></div>
    ${cmp}<div class="fsum"><span>${intra}</span>${s.deficitMl > 300 ? `<span class="water">Do uzupełnienia ok. <b>${lfmt(s.deficitMl * M.K.REHYDRATE)}</b> płynów</span>` : ""}</div>
  </div>`;
}
function sessionCard(s, d, v) {
  if (s.done) return doneCard(s);
  const end = s.start + s.durSec / 60;
  const blocks = s.blocks && s.intra ? `<table class="fuel"><thead><tr><th>Odcinek</th><th>Węgle</th><th>Płyny</th><th>Mocno</th></tr></thead><tbody>${s.blocks.map(b => `<tr><td>${b.from}–${b.to}'</td><td>${b.intake ? `<b>${b.intake} g</b>` : "–"}</td><td>${b.ml} ml</td><td class="${b.hardMin ? "hard" : ""}">${b.hardMin ? b.hardMin + "'" : "–"}</td></tr>`).join("")}</tbody></table>` : "";
  const fsum = `<div class="fsum">${s.intra ? `<span>Węgle: <b>${s.intra} g</b> (${s.gph || r5(s.intra / (s.durSec / 3600))} g/h)</span>` : `<span>Węgle: <b>bez</b>${s.ride && s.durSec <= 65 * 60 ? " (do ok. 65 min wystarczy posiłek przed)" : ""}</span>`}<span class="water">Płyny: <b>${lfmt(s.fluid)}</b> (${s.mlh} ml/h)${s.bottles >= 0.5 ? ` · ${fmt(s.bottles, 1)} bidonu 750 ml` : ""}</span>${s.na ? `<span>Sód: <b>${s.na} mg/h</b></span>` : ""}</div>`;
  const missed = d.missed.includes(s) ? `<div class="warnline">${s.missed ? "Brak wykonania w Intervals, trening nie wchodzi do bilansu dnia." : "Nie widzę tego treningu w Intervals. Plan przeliczy się po wgraniu aktywności. Jeśli go nie robisz, odznacz „robię”."}</div>` : "";
  return `<div class="sess ${s.off ? "off" : ""} ${s.prio ? "prio" : ""}">
    <div class="mh"><div><div class="sn">${esc(s.name)}</div><div class="meta">${sessMeta(s)}</div></div></div>
    ${missed}${profileSvg(s, v)}
    ${s.steps ? `<div class="steps">${esc(s.steps)}</div>` : ""}
    ${s.assumed ? `<div class="warnline">Trening bez rozpisanych kroków i czasu. Przyjąłem ${Math.round(s.durSec / 60)} min przy ok. 70% FTP. Rozpisz go w Intervals, żeby liczby były dokładne.</div>` : ""}
    ${fsum}${blocks}
    ${s.deficitMl > 300 ? `<div class="small muted">Niedobór płynów po treningu ok. ${lfmt(s.deficitMl)}. W regeneracji wypij ok. ${lfmt(s.deficitMl * M.K.REHYDRATE)}.</div>` : ""}
    ${s.missed ? "" : `<div class="ctl"><label>Start <input type="time" value="${M.fmtTime(s.start).padStart(5, "0")}" data-time="${s.id}"></label><span class="muted small">do ${M.fmtTime(end)}</span>
      <button type="button" class="toggle" data-prio="${s.id}" aria-pressed="${s.prio}">Priorytet</button>
      <label class="small"><input type="checkbox" data-sid="${s.id}" ${s.off ? "" : "checked"}> robię</label></div>`}
    ${s.desc ? `<details class="small"><summary>Opis z Intervals</summary><div class="muted" style="white-space:pre-wrap;margin-top:6px">${esc(s.desc)}</div></details>` : ""}
  </div>`;
}
function mealCard(m) {
  const adj = !m.adj ? "" : m.adj.added ? `<span class="adj">nowy posiłek po przeliczeniu</span>` : `<span class="adj">${sgn(m.adj.kcal)} kcal${Math.abs(m.adj.c) >= 5 ? `, ${m.adj.c > 0 ? "+" : "−"}${r5(Math.abs(m.adj.c))} g W` : ""} względem planu</span>`;
  return `<div class="meal ${m.cut ? "cut" : ""} ${m.past ? "past" : ""}"><div class="mh"><div class="mn">${esc(m.name)}<span class="code c-${m.code}">${M.CODE_LABEL[m.code]}</span>${m.past ? `<span class="code c-past">minęło</span>` : ""}</div><div class="mk2">${r10(m.kcal)} kcal</div></div>
    <div class="mm"><span>B <b>${r5(m.p)} g</b></span><span>W <b>${r5(m.c)} g</b></span><span>T <b>${r5(m.f)} g</b></span><span class="water">Płyny <b>${m.ml} ml</b></span>${m.cut ? "<span>tu deficyt</span>" : ""}</div>${adj}</div>`;
}
function dayLine(d, v) {
  const a = v.wake - 30, b = v.sleep + 30, W = 320, H = 34, x = t => (t - a) / (b - a) * W;
  let g = "";
  for (let h = Math.ceil((a + 20) / 60); h * 60 <= b - 20; h += 3) g += `<line x1="${x(h * 60)}" x2="${x(h * 60)}" y1="6" y2="22" stroke="var(--line)"/><text x="${x(h * 60)}" y="32" text-anchor="middle">${h}</text>`;
  d.act.forEach(s => g += `<rect x="${x(s.start)}" y="8" width="${Math.max(3, x(s.start + s.durSec / 60) - x(s.start))}" height="12" rx="3" fill="${s.prio ? "var(--violet)" : "var(--ink)"}" opacity="${s.done ? 0.55 : 1}"/>`);
  d.plan.meals.forEach(m => g += `<circle cx="${x(m.t)}" cy="14" r="${m.kind === "snack" ? 4 : 6}" fill="var(--${m.code === "H" ? "high" : m.code === "M" ? "mid" : "low"})" stroke="var(--surface)" stroke-width="1.5" opacity="${m.past ? 0.45 : 1}"/>`);
  if (d.plan.live) { const n = d.plan.live.now; if (n > a && n < b) g += `<line x1="${x(n)}" x2="${x(n)}" y1="2" y2="26" stroke="var(--violet)" stroke-width="1.5"/>`; }
  return `<svg class="dayline" viewBox="0 0 ${W} ${H}" role="img" aria-label="Oś dnia: posiłki i trening">${g}</svg>`;
}
function liveNote(d) {
  const L = d.plan.live;
  if (L) {
    let t = `<b>Po treningu:</b> cel dnia ${kfmt(d.plan.target)} kcal zamiast ${kfmt(L.plannedTarget)} (${sgn(L.delta)}). Posiłki, których pora minęła, liczę jak zjedzone według planu (${kfmt(L.eaten)} kcal). `;
    if (L.noFuture) t += L.unabsorbed < -50 ? `Na dziś nie ma już posiłków w planie, a brakuje ok. ${kfmt(-L.unabsorbed)} kcal: dodaj przekąskę z białkiem i węglami.` : L.unabsorbed > 50 ? `Zjedzone według planu przekracza nowy cel o ok. ${kfmt(L.unabsorbed)} kcal.` : "";
    else {
      t += `Reszta dnia: ${kfmt(L.remaining)} kcal.${L.unabsorbed > 50 ? ` Ok. ${kfmt(L.unabsorbed)} kcal nie da się zabrać bez schodzenia poniżej minimum posiłku.` : ""}`;
      if (L.biggest && L.biggest.kcal > 1100) t += ` ${esc(L.biggest.name)} wychodzi ${kfmt(L.biggest.kcal)} kcal: część zjedz wcześniej jako przekąskę.`;
    }
    return `<div class="signal info live"><span class="dot"></span><div>${t}</div></div>`;
  }
  if (d.orig && d.date < todayISO()) return `<p class="small muted">Plan z wykonania. Według planu treningów było ${kfmt(d.orig.target)} kcal.</p>`;
  return "";
}
function renderDay() {
  const d = R.show.find(x => x.date === S.sel) || R.show[0], v = R.v, p = d.plan;
  const dt = parseD(d.date), mode = d.mode;
  const chips = [`<span class="chip ${d.tag}">${d.tagLabel}</span>`];
  if (p.live) chips.push(`<span class="chip done">po treningu</span>`);
  if (d.prio) chips.push(`<span class="chip prio">Priorytet</span>`);
  if (mode !== "normal") chips.push(`<span class="chip ${mode}">${MODES[mode]}</span>`);
  if (d.loadKg) chips.push(`<span class="chip load">Ładowanie ${d.loadKg} g/kg</span>`);
  if (p.def > 0) chips.push(`<span class="chip def">deficyt −${r10(p.def)}</span>`);
  if (p.surplus > 20) chips.push(`<span class="chip hp">+${r10(p.surplus)} kcal</span>`);
  const why = mode === "sick" ? "Tryb Choroba: bez deficytu. Odznacz treningi, których nie zrobisz." : d.loadKg ? "Ładowanie przed startem: więcej węgli w każdym posiłku, mniej błonnika i tłuszczu." : d.prio ? "Dzień startu: posiłek przed min. 2 g/kg węgli ok. 3 h przed, pełna podaż w trakcie." : mode === "hp" ? `High performance: +${fmt(v.hpCarb, 1)} g/kg węgli ponad bilans, bez deficytu.` : !v.cutOn ? "Bilans na zero." : S.ov.skip[d.date] ? "Deficyt wyłączony ręcznie na ten dzień." : d.tomorrowKey ? "Jutro jakość, więc wieczór na zero." : p.def > 0 ? "Deficyt tylko z posiłków LOW, od wieczoru. Posiłki wokół treningu bez zmian." : "Bez deficytu.";

  const items = [...p.meals.map(m => ({ t: m.t, h: mealCard(m), node: `c-${m.code}` })), ...d.ss.map(s => ({ t: s.start, h: sessionCard(s, d, v), node: s.done ? "n-done" : "n-sess" }))].sort((a, b) => a.t - b.t);
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
    ${liveNote(d)}
    <p class="band ${p.low ? "low" : ""}">Zakres węgli dla tego dnia: ${p.band.label}, ${p.band.lo}–${p.band.hi} g/kg.${p.low ? " Plan jest poniżej zakresu: podnieś utrzymanie albo wyłącz deficyt." : ""}</p>
    <p class="small muted">${why} Utrzymanie ${kfmt(p.maint - p.train)} kcal, trening ${kfmt(p.train)} kcal${d.done.length ? " (z wykonania)" : ""}, w trakcie ${r5(p.intra)} g węgli.</p>
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
  <div class="card"><h2>Plan dnia</h2>${items.length ? `<div class="tl">${tl}</div>` : ""}
    <div class="between-water">Między posiłkami dopij ok. ${lfmt(p.fluids.between)} wody.</div>
    <div class="row between"><span class="small muted" id="dayEx">${exLine(d)}</span><button class="btn" type="button" id="exDay">${S.exp[d.date] ? "Zaktualizuj w Intervals" : "Wyślij dzień do Intervals"}</button></div>
  </div>`;
  $("dayTimesBox").ontoggle = e => { S.openTimes = e.target.open; };
  timesEditor($("dayTimes"), d.times.list, l => { S.ov.mealTimes[d.date] = l; S.openTimes = true; changed(); render(); },
    d.times.lvl === "day" ? () => { delete S.ov.mealTimes[d.date]; changed(); render(); } : null, "Przywróć");
  $("timesToDow").onclick = () => { const dow = dt.getDay(); S.settings.dowTimes = { ...(S.settings.dowTimes || {}), [dow]: d.times.list.slice() }; delete S.ov.mealTimes[d.date]; changed(); resetSettingsFields(); render(); };
  document.querySelectorAll("#dayView [data-mode]").forEach(b => b.onclick = () => setMode(d.date, b.dataset.mode, S.modeScope));
  $("modeScope").onchange = e => { S.modeScope = e.target.value; };
  const sk = $("skipDay"); if (sk) sk.onchange = () => { if (sk.checked) S.ov.skip[d.date] = true; else delete S.ov.skip[d.date]; changed(); render(); };
  document.querySelectorAll("#dayView [data-sid]").forEach(el => el.onchange = () => { if (el.checked) delete S.ov.off[el.dataset.sid]; else S.ov.off[el.dataset.sid] = true; changed(); render(); });
  document.querySelectorAll("#dayView [data-time]").forEach(el => el.onchange = () => { if (el.value) { S.ov.time[el.dataset.time] = el.value; changed(); render(); } });
  document.querySelectorAll("#dayView [data-prio]").forEach(el => el.onclick = () => { const id = el.dataset.prio; S.ov.prio[id] = el.getAttribute("aria-pressed") !== "true"; changed(); render(); });
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
    const names = d.act.map(s => s.name + (s.done ? " ✓" : "")).join(", ");
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
  L.push(`${d.tagLabel}${d.mode !== "normal" ? " · " + MODES[d.mode] : ""}${d.loadKg ? " · ładowanie " + d.loadKg + " g/kg" : ""} · ${p.def > 0 ? "deficyt −" + r10(p.def) + " kcal" : p.surplus > 20 ? "+" + r10(p.surplus) + " kcal" : "na zero"}${p.live ? " · przeliczone po treningu" : ""}`);
  L.push(`Razem: B ${r5(p.pT)} g · W ${r5(p.cT)} g (${fmt(p.cKg)} g/kg) · T ${r5(p.fT)} g · płyny ${lfmt(p.fluids.total)}`);
  L.push("");
  const items = [...p.meals.map(m => ({ t: m.t, s: `- ${M.fmtTime(m.t)} **${m.name}** [${M.CODE_LABEL[m.code]}]: ${r10(m.kcal)} kcal · B ${r5(m.p)} · W ${r5(m.c)} · T ${r5(m.f)} · ${m.ml} ml${m.cut ? " · tu deficyt" : ""}` })),
  ...d.act.map(s => ({ t: s.start, s: `- ${M.fmtTime(s.start)} **${s.name}**${s.done ? " (wykonano)" : ""}: ${s.intra ? `${s.intra} g węgli${s.gph ? ` (${s.gph} g/h)` : ""}` : "bez węgli"}${s.fluid ? ` · ${lfmt(s.fluid)} płynów` : ""}${s.na ? ` · sód ${s.na} mg/h` : ""}` }))].sort((a, b) => a.t - b.t);
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
    syncExp(await api(`/events?oldest=${list[0].date}&newest=${list[list.length - 1].date}`) || []);
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
initLog(() => R, render);
initSettings(refresh, setSync);

// ---------- Start i odświeżanie ----------
// Intervals: przy otwarciu, po powrocie do aplikacji (po 2 min), co 5 min w tle widocznej karty,
// a co 2 min, gdy dzisiejszy trening z planu już się skończył, a aktywności jeszcze nie ma (do 4 h po końcu).
// iOS wstrzymuje liczniki w tle, więc po powrocie do PWA decyduje zdarzenie visibilitychange.
// Widok dnia przerysowuje się co 5 min, żeby przesuwać granicę „minęło” w przeliczonym planie.
load(); render(); setSync(); showView("day");
if (getKey()) refresh(false);
const since = () => Date.now() - (S.cache.fetchedAt || 0);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && since() > 2 * 60e3) refresh(false); });
let lastDay = todayISO(), lastDraw = Date.now();
setInterval(() => {
  if (document.visibilityState !== "visible") return;
  if (getKey() && since() > (awaitingUpload() ? 2 : 5) * 60e3) { refresh(false); return; }
  const idle = !document.querySelector("main :focus");
  if (todayISO() !== lastDay || (idle && Date.now() - lastDraw > 5 * 60e3)) { lastDay = todayISO(); lastDraw = Date.now(); render(); }
}, 60e3);
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
