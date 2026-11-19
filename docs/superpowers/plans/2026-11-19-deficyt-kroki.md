# Deficyt w rytmie treningu, kroki z danych, kafelki: plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deficyt realnie wchodzi w dni wolne, luźne i średnie według udziałów Tomasza, z ochroną okien wokół mocnych jednostek; chodzenie z kroków dnia; bieg z dystansu; kafelki po przeliczeniu spójne z kcal.

**Architecture:** Reguły bez stanu w `model.js` (intensywność, rozdział deficytu w `planDay`, próg dostępności energii, bieg, `liveAdjust`). Udziały dni, cel tygodnia, kroki per dzień i wykluczenie spacerów w `calc.js`. Interfejs w `app.js` i `settings.js`.

**Tech Stack:** JavaScript ES modules bez zależności, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-19-deficyt-kroki-design.md`

## Global Constraints

- Bez zewnętrznych bibliotek; testy na danych syntetycznych, bez danych z Intervals w repozytorium.
- Teksty po polsku, bez długich myślników; marka „movementcare” małymi literami.
- Udziały: luźny 1,0; średni 0,6; wolny 0,6; mocny 0 (A+: ostatni posiłek 0,6); Zmęczenie ×0,5 i maks. 150 kcal.
- A+: ostatni posiłek ≥ 240 min po regeneracji ostatniego treningu, jutro bez mocnej jednostki.
- Cięcie: maks. 30% kcal posiłku; minimum LOW max(300, 0,7 × minimum posiłku); MEDIUM: minimum posiłku; przekąska 150 kcal.
- Próg dostępności energii: jedzenie − trening ≥ 30 kcal/kg masy beztłuszczowej; bez % tłuszczu 85% masy.
- Poziomy: lekki 0,25%, umiarkowany 0,5%, mocny 0,7% masy/tydz. × 7700 kcal/kg; limit dnia min(600, tydzień/3); lekki i własny = sufit, umiarkowany i mocny = cel z przenoszeniem na dni wolne i luźne do niedzieli.
- Kroki: dni przyszłe średnia z 7 pełnych dni; dziś max(średnia, kroki do teraz); dni minione rzeczywiste; Walk i Hike nie są treningiem.
- Bieg zaplanowany: dystans × masa × 1 kcal/kg/km − 90 kcal/h; bez dystansu prędkość z biegów z 28 dni; bez historii 10 km/h.

## Review Focus

1. Dzień z mocnym treningiem wieczorem: żaden posiłek tego dnia nie traci kcal (A+ nie łapie, bo ostatni posiłek to regeneracja).
2. Dzień z dwoma treningami (luźny rano, mocny wieczorem): dzień liczy się jako mocny, deficyt 0.
3. Brak kroków w wellness z 7 dni: średnia z 28 dni, potem 7000.
4. Stare ustawienia bez `cutLevel` (weekly/cap z poprzednich poziomów): migracja na lekki, umiarkowany, mocny albo własny.
5. Przeliczenie po treningu przy włączonym deficycie: kafelki = cel dnia, brakujące makro w komunikacie.

---

### Task 1: Model: intensywność, bieg, rozdział deficytu, próg dostępności energii, kafelki

**Files:** Modify `model.js`; Test `test/model.test.mjs`

**Interfaces:**
- Produces: `dayIntensity(act) -> "rest"|"low"|"mid"|"high"`; `runKm(ev, cfg) -> number|null`; `analyzeSession(ev, cfg)` z `cfg.mass`, `cfg.runSpeed` (km/h); `planDay(day, ctx)` z `ctx.deficit` (kcal), `ctx.aplus` (bool), `ctx.eaMin` (kcal jedzenia minus trening); wynik `plan.cutLimit: null|"ea"|"meals"`; `liveAdjust` zwraca `pT/cT/fT/cKg` celu i `live.missing {kcal,p,c,f}`.

- [ ] Testy: `dayIntensity` (wolne, luźna jazda 60 min IF 0,6, jazda 90 min = średni, siłownia = średni, interwały = mocny, dwa treningi = mocny); bieg z `distance: 10000` przy 70 kg = 700 − 90×h; bieg bez dystansu z `runSpeed: 12`; deficyt w dzień luźny > 0 i żaden cięty posiłek poniżej minimum ani o więcej niż 30%; regeneracja i dwa posiłki przed mocnym bez zmian; A+ tnie tylko ostatni posiłek, gdy ≥ 240 min po regeneracji, i 0, gdy wieczorem trening; `eaMin` ogranicza deficyt i ustawia `cutLimit: "ea"`; `liveAdjust`: `L.cT === b.cT`, przy braku kolejnych posiłków `live.missing.kcal > 0`. Usunąć `test.todo`.
- [ ] Uruchomić `node --test`: nowe testy FAIL.
- [ ] Wdrożyć w `model.js`.
- [ ] `node --test`: PASS.

### Task 2: Stan: udziały dni, cel tygodnia, kroki, spacery, prędkość biegu

**Files:** Modify `calc.js`, `intervals.js` (pole `distance` aktywności), `store.js` (`cutLevel`)

**Interfaces:**
- Consumes: Task 1.
- Produces: `stepsFor(date) -> {steps, src}`; `baseFor(date, m) -> kcal`; `runSpeed() -> km/h`; `cutBudget(v) -> {weekly, dayCap, mode: "cap"|"target"}`; w dniu `d.intensity`, `d.share`, `d.want`.

- [ ] Kroki i baza dnia przez różnicę kroków × 0,0005 × masa (tryb ręczny bez korekty); Walk i Hike pominięte w `sessionsFor` i `trainKcalOn`, pokazane w notatkach dnia.
- [ ] Udziały, A+, budżet tygodnia sekwencyjnie po dniach z przenoszeniem w trybie celu; `eaMin = 30 × FFM`.
- [ ] Sprawdzenie skryptem w scratchpadzie: tydzień syntetyczny z celem umiarkowanym daje deficyt w dni wolne i luźne, 0 w dzień mocny i wieczór przed nim.

### Task 3: Interfejs, dokumenty, wydanie

**Files:** Modify `app.js`, `settings.js`, `index.html`, `PROJECT.md`, `docs/decyzje.md`, `docs/roadmapa.md`

- [ ] Dzień: intensywność i udział w uzasadnieniu, komunikat progu, brakujące makro; Tydzień: „−X z Y kcal”; Ustawienia: poziomy w % masy i własny.
- [ ] Podgląd na danych syntetycznych w widoku telefonu, bez błędów w konsoli.
- [ ] `tools/release.sh`.
