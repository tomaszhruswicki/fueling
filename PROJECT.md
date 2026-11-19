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

- `model.js`: obliczenia bez DOM (analiza treningu, bloki 30 min, timeline, alokacja makro, deficyt, ładowanie).
- `app.js`: stan, synchronizacja z Intervals, kopia ustawień, kalkulator utrzymania, wszystkie widoki.
- `index.html`, `app.css`: interfejs. `sw.js`, `manifest.webmanifest`, `icons/`: PWA.
- `tools/serve.mjs`: lokalny podgląd (`node tools/serve.mjs . 8765`, konfiguracja `fueling` w `.claude/launch.json`). `tools/icons.mjs`: ikony.

## Wdrożenie

GitHub Pages z gałęzi `main` (repo `tomaszhruswicki/fueling`, publiczne). DNS: CNAME `fueling` na `tomaszhruswicki.github.io` w dPanelu dhosting. Przed każdym `git push` podnieś `V` w `sw.js` i sprawdź, czy w zmianach nie ma danych osobowych ani sekretów. Push publikuje od razu.

## Stan (19.11.2026)

- Działa: Dzień (timeline, posiłki z makro i płynami, trening z podażą w blokach 30 min), Tydzień, Dziennik (waga, kcal i makro do wellness), Ustawienia (utrzymanie, posiłki i pory, deficyt, tryby z historią, priorytet), wysyłanie planu do Intervals, odświeżanie przy otwarciu i co 5 min.
- Sprawdzone lokalnie w widoku telefonu. Na iPhonie z prawdziwym kluczem jeszcze nie.
- Znany błąd: Dziennik wysyła przy zapisie wszystkie wstępnie wypełnione pola (szczegóły w roadmapie, pozycja 1).

## Dokumenty

- `docs/roadmapa.md`: błędy, porządki, funkcje, pomysły i odrzucone, z priorytetem i szacunkiem.
- `docs/decyzje.md`: dziennik decyzji z uzasadnieniem.
- Kontekst osobisty Tomasza (zdrowie, cele wagowe) jest w `~/Documents/Personal AI/Moj Trening`, nie tutaj.
