# Projekt: fueling

## Cel

Aplikacja (PWA) do planowania żywienia pod trening na podstawie planu z Intervals.icu, wzorowana na Hexis Live i FoodCoach: węgle dopasowane do pracy (Impey i in. 2018), timeline posiłków dnia, podaż węglowodanów i płynów w trakcie treningu, widok tygodnia. Adres: https://fueling.movementcare.pl.

Użytkownik: Tomasz (od 19.11.2026). Udostępnienie zawodnikom movementcare to otwarta decyzja z warunkami w `docs/roadmapa.md`.

## Zasady, których nie łamiemy

- Bez serwera i bazy. Dane użytkownika zostają na urządzeniu i w jego Intervals (wellness, notatka z kopią ustawień z datą 1.01.2020). Aplikacja łączy się wyłącznie z `intervals.icu`.
- Repozytorium jest publiczne: w kodzie i dokumentach nie ma kluczy API, ID zawodników, danych zdrowotnych ani danych testowych z Intervals. Dane testowe trzymaj poza repozytorium (scratchpad, pliki `_seed*` są w `.gitignore`).
- Żadnych zewnętrznych skryptów, bibliotek ani analityki. CSP w `index.html` pozwala tylko na `self` i `intervals.icu`.
- Energia i węgle z rozpisanych kroków treningu (moc × czas), nie z samego IF.
- Deficyt tylko z posiłków LOW. Nigdy przed dniem jakości, w dniu startu, ładowania, HP i choroby. Nie schodzi poniżej minimum dnia (RMR × 1,15) ani minimum posiłku.
- Posiłek przed treningiem i regeneracja zachowują swoje węgle przy każdej korekcie.
- To narzędzie wspierające planowanie, nie porada dietetyczna. Szacunki mają błąd ok. 10–15%.

## Architektura

- `model.js`: obliczenia bez DOM i stanu (analiza treningu i wykonanej aktywności, bloki 30 min, timeline, alokacja makro, deficyt, ładowanie, przeliczenie reszty dnia, kontrola wpisu). Stałe w `K`. Testy w `test/` (`node --test`).
- `calc.js`: obliczenia na stanie (utrzymanie, jedna kalibracja, treningi dnia z planu i wykonania, plan tygodnia).
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
- Znane ograniczenie: w dzień treningowy deficyt zwykle wynosi 0 (roadmapa A7).

## Dokumenty

- `docs/roadmapa.md`: błędy, porządki, funkcje, pomysły i odrzucone, z priorytetem i szacunkiem.
- `docs/decyzje.md`: dziennik decyzji z uzasadnieniem.
- Kontekst osobisty Tomasza (zdrowie, cele wagowe) jest w `~/Documents/Personal AI/Moj Trening`, nie tutaj.
