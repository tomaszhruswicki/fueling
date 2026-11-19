# Projekt: fueling

## Cel

Aplikacja (PWA) do planowania żywienia pod trening na podstawie planu z Intervals.icu, wzorowana na Hexis Live i FoodCoach: węgle dopasowane do pracy (Impey i in. 2018), timeline posiłków dnia, podaż węglowodanów i płynów w trakcie treningu, widok tygodnia. Adres: https://fueling.movementcare.pl.

Użytkownik: Tomasz (od 19.11.2026). Udostępnienie zawodnikom movementcare to otwarta decyzja z warunkami w `docs/roadmapa.md`.

## Zasady, których nie łamiemy

- Bez serwera i bazy. Dane użytkownika zostają na urządzeniu i w jego Intervals (wellness, notatka z kopią ustawień z datą 1.01.2020). Aplikacja łączy się wyłącznie z `intervals.icu`.
- Repozytorium jest publiczne: w kodzie i dokumentach nie ma kluczy API, ID zawodników, danych zdrowotnych ani danych testowych z Intervals. Dane testowe trzymaj poza repozytorium (scratchpad, pliki `_seed*` są w `.gitignore`).
- Żadnych zewnętrznych skryptów, bibliotek ani analityki. CSP w `index.html` pozwala tylko na `self` i `intervals.icu`.
- Energia i węgle z rozpisanych kroków treningu (moc × czas), nie z samego IF.
- Deficyt każdego dnia od zera, bez przenoszenia: jedzenie = większa z wartości (dzień przy biurku − deficyt bazowy) i (pełny wydatek − maks. deficyt typu dnia). Bazowy: wolny i luźny 150, średni i mocny 0. Maks. ustawiane suwakiem 0–600 (deficyt dnia luźnego); punkty lekki/umiarkowany/mocny: wolny 250/300/350, luźny 400/500/600, średni 200/250/300, mocny 0, między nimi liniowo. Rekompozycja (punkt 250): siłownia i mocne dni na zero, białko min. 2,2 g/kg (A+: ostatni posiłek min. 4 h po regeneracji, limit dnia wolnego). Nigdy w dzień przed mocną jednostką, w dniu startu, ładowania, HP i choroby. Cięcie z posiłków LOW i MEDIUM, maks. 30% posiłku; nigdy z posiłku przed treningiem, regeneracji, posiłków HIGH, dwóch posiłków przed mocną jednostką ani posiłku przed i po spacerze od 90 min.
- Kroki dni przyszłych według typu dnia z 28 dni (fallback: mocny 75%, średni 90%). Dzień przy biurku ze średniej dni wolnych.
- Posiłek dostaje węgle według kodu (LOW 0,4, MEDIUM 0,9, HIGH 1,35 g/kg), reszta energii dnia równo na posiłki. Dwa kolejne posiłki główne poniżej ok. 450 kcal: przekąska 150–250 kcal i większy posiłek.
- Progi: dzień wolny nie schodzi poniżej RMR × 1,15; jedzenie minus trening co najmniej 30 kcal/kg masy beztłuszczowej; posiłek nie schodzi poniżej minimum cięcia.
- Posiłek przed treningiem i regeneracja zachowują swoje węgle przy każdej korekcie.
- To narzędzie wspierające planowanie, nie porada dietetyczna. Szacunki mają błąd ok. 10–15%.

## Architektura

- `model.js`: obliczenia bez DOM i stanu (analiza treningu i wykonanej aktywności, bloki 30 min, timeline, alokacja makro, deficyt, ładowanie, przeliczenie reszty dnia, kontrola wpisu). Stałe w `K`. Testy w `test/` (`node --test`).
- `calc.js`: obliczenia na stanie (utrzymanie, kroki według typu dnia, jedna kalibracja, treningi dnia z planu i wykonania, plan tygodnia).
- `app.js`: widoki Dzień i Tydzień, eksport, odświeżanie. `log.js`: Dziennik. `settings.js`: Ustawienia.
- `store.js`: stan i localStorage. `intervals.js`: API, pobieranie, kopia ustawień. `util.js`: formatowanie i daty.
- `index.html`, `app.css`: interfejs. `sw.js`, `manifest.webmanifest`, `icons/`: PWA.
- `tools/serve.mjs`: lokalny podgląd (`node tools/serve.mjs . 8765`, konfiguracja `fueling` w `.claude/launch.json`). `tools/icons.mjs`: ikony.

## Wdrożenie

GitHub Pages z gałęzi `main` (repo `tomaszhruswicki/fueling`, publiczne). DNS: CNAME `fueling` na `tomaszhruswicki.github.io` w dPanelu dhosting. Wydanie: `tools/release.sh "opis"` (testy, kontrola danych osobowych i sekretów, podbicie `V` w `sw.js`, commit, push). Push publikuje od razu.

## Stan (19.11.2026)

- Działa: Dzień (timeline, posiłki z makro i płynami, trening z podażą w blokach 30 min, przeliczenie reszty dnia po wykonanym treningu), Tydzień, Dziennik (waga, kcal i makro do wellness, tylko zmienione pola, kontrola wiarygodności), Ustawienia (utrzymanie z jedną kalibracją z wykonania, posiłki i pory, deficyt, tryby z historią, priorytet), wysyłanie planu do Intervals.
- Odświeżanie: przy otwarciu, po powrocie do aplikacji (po 2 min), co 5 min, a co 2 min, gdy dzisiejszy trening powinien się już skończyć, a aktywności jeszcze nie ma.
- Sprawdzone lokalnie w widoku telefonu na danych syntetycznych. Na iPhonie z prawdziwym kluczem jeszcze nie, w tym pola aktywności z `/activities` (`icu_joules`, `carbs_ingested`, `paired_event_id`).
- Deficyt w rytmie treningu (A+), kroki dnia w utrzymaniu, bieg z dystansu (19.11 w nocy). Deficyt v2: jedzenie od dnia przy biurku, kroki według typu dnia, rozdział posiłków (20.11). Do obserwacji: ile deficytu realnie wchodzi (roadmapa A7).

## Dokumenty

- `docs/roadmapa.md`: błędy, porządki, funkcje, pomysły i odrzucone, z priorytetem i szacunkiem.
- `docs/decyzje.md`: dziennik decyzji z uzasadnieniem.
- Kontekst osobisty Tomasza (zdrowie, cele wagowe) jest w `~/Documents/Personal AI/Moj Trening`, nie tutaj.
