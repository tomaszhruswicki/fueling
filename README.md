# fueling

Aplikacja webowa (PWA) do planowania żywienia pod trening na podstawie planu z Intervals.icu. Działa w przeglądarce i jako ikona na ekranie głównym telefonu.

## Jak działa

- Plan treningów, wellness i FTP pobierane są z API Intervals.icu kluczem API użytkownika.
- Klucz API i ustawienia zostają na urządzeniu użytkownika. Aplikacja nie ma serwera ani bazy danych i łączy się wyłącznie z `intervals.icu`.
- Kopia ustawień, trybów i oznaczeń priorytetu zapisuje się w kalendarzu Intervals jako notatka z datą 1.01.2020 (`fueling-app: kopia ustawień`). Po ponownej instalacji wystarczy wkleić klucz.
- Waga i dane z Fitatu (kcal, B, W, T) zapisują się w wellness Intervals.

## Model

- Energia i spalanie węglowodanów liczone z rozpisanych kroków treningu (moc × czas każdego kroku), nie z samego IF.
- Jedzenie i płyny w trakcie rozpisane na odcinki po 30 minut.
- Posiłki z kodem LOW / MEDIUM / HIGH według treningu w danym dniu i następnego dnia.
- Tryby: Normalnie, High performance, Zmęczenie, Choroba. Ustawiane na dzień albo od dnia do odwołania, z historią.
- Priorytet treningu lub startu: ładowanie węglowodanami 1–2 dni przed, posiłek przed startem min. 2 g/kg, pełna podaż w trakcie.
- Po wgraniu aktywności reszta dnia przelicza się z wykonania (jak Hexis Live).
- Deficyt w rytmie treningu: wchodzi w dni luźne, średnie i wolne, nigdy przed mocną jednostką ani w dniu startu, ładowania, HP i choroby. Próg dostępności energii 30 kcal/kg masy beztłuszczowej.
- Kroki dnia w utrzymaniu (spacery i wędrówki nie są treningiem). Bieg z dystansu i masy ciała.

Szczegóły i źródła: `index.html`, sekcja „Metoda i ograniczenia”. Szacunki mają błąd ok. 10–15%. To narzędzie wspierające planowanie, nie porada dietetyczna ani medyczna.

## Pliki

- `index.html`, `app.css`: interfejs.
- `app.js`: widoki Dzień i Tydzień, eksport do Intervals, odświeżanie. `log.js`: Dziennik. `settings.js`: Ustawienia.
- `calc.js`: obliczenia na stanie aplikacji (utrzymanie, kalibracja, plan i wykonanie dnia).
- `model.js`: obliczenia bez DOM i bez stanu. Testy: `test/` (`node --test`).
- `store.js`: stan i pamięć urządzenia. `intervals.js`: API i kopia ustawień. `util.js`: formatowanie i daty.
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA.
- `tools/icons.mjs`: generator ikon (`node tools/icons.mjs`).
- `tools/serve.mjs`: lokalny podgląd (`node tools/serve.mjs . 8765`).
- `tools/release.sh`: wydanie (testy, kontrola sekretów, wersja w `sw.js`, commit, push).
- `PROJECT.md`, `docs/`: cel, zasady, stan, decyzje i roadmapa.
- `CNAME`: domena GitHub Pages.

## Wdrożenie

GitHub Pages z gałęzi `main`, katalog główny. Domena `fueling.movementcare.pl`: rekord CNAME w DNS wskazujący na `<login>.github.io`. Wydanie: `tools/release.sh "opis"`. Skrypt podnosi wersję `V` w `sw.js`, żeby telefony pobrały nową wersję.
