# Roadmapa

Stan na 19.11.2026. Szacunki to czas pracy z Claude, bez testu na telefonie (ok. 5 min na zmianę).

## Zrobione 19.11.2026

A1, A2, A3, A4, A5, A7, B1, B2, B3, B4 (bieg, spacery), C1. Szczegóły w `docs/decyzje.md`.

## Zrobione 20.11.2026

Test potu (C3), wydatek siłowni z masy i historii (B4), karty posiłków bez rozjeżdżania na iPhonie. Przeliczenie po treningu potwierdzone na iPhonie z prawdziwą aktywnością (siłownia sparowana w Intervals).

Suwak bilansu −600…+300 z punktami Mocny, Umiarkowany, Lekki, Rekompozycja, Utrzymanie, Budowa, Budowa+ (nadwyżka wokół siłowni, przekąska przed snem). Deficyt v2: jedzenie od dnia przy biurku, kroki według typu dnia, spacer od 90 min chroni posiłki, rozdział posiłków z kodów i równej reszty, łączenie małych posiłków. Szczegóły w `docs/decyzje.md`.

## Proponowana kolejność

1. E: reszta listy z sekcji E (offline, ciemny motyw, synchronizacja kopii ustawień); przeliczenie po treningu działa.
2. Obserwacja deficytu v2 przez 2 tygodnie: ile wchodzi realnie (dzień luźny z dwoma posiłkami do cięcia mieści ok. 440 z 500 kcal przez limit 30% posiłku).
3. Pierwsze testy potu: min. 2 na zewnątrz i 2 na trenażerze.
4. C2: plan a wykonanie w widoku Tydzień (1 h). Źródło kcal: wellness w Intervals z Dziennika; Fitatu nie ma publicznego API.
5. Suwak automatycznie według trendu masy (docelowe tempo w kg/tydz., korekta co tydzień, min. 8 pomiarów wagi). Po obserwacji v2. 2 h.

Reszta według potrzeby. Sekcja D dopiero po decyzji o zawodnikach.

## A. Błędy i ryzyka danych

1. ~~Dziennik zapisuje wszystkie wstępnie wypełnione pola.~~ Zrobione: wysyła tylko zmienione pola. Czyszczenia pola aplikacja nie obsługuje (poprawka w Intervals).
2. ~~Brak kontroli wiarygodności dnia.~~ Zrobione: ostrzeżenie w Dzienniku, takie dni pomijane w kalibracji. Próg 10% łapie też dni z dużą ilością błonnika lub alkoholu w Fitatu; do obserwacji.
3. ~~Dwie różne kalibracje.~~ Zrobione: jedna funkcja w `calc.js` (28 dni, trend masy z regresji liniowej).
4. ~~Kalibracja odejmuje trening z planu.~~ Zrobione: z wykonanych aktywności z 29 dni; bez nich z planu.
5. ~~Ręczne podbijanie wersji w `sw.js`.~~ Zrobione: `tools/release.sh`.
7. ~~Deficyt w dzień treningowy wynosi zwykle 0.~~ Zrobione: deficyt w rytmie treningu (A+), od 20.11 w wersji v2 (limity dnia, bez celu tygodnia). Do obserwacji: limit 30% posiłku ogranicza dzień luźny z treningiem w środku dnia (tylko dwa posiłki do cięcia).
8. **Pola aktywności niesprawdzone na prawdziwym koncie.** Przeliczenie używa `icu_joules`, `calories`, `carbs_ingested`, `paired_event_id` z `/activities`. Dopasowanie do planu wyłącznie po `paired_event_id`, więc sprawdzić, czy Intervals paruje treningi z Garmina/Wahoo automatycznie. Aktywności ze Stravy przychodzą przez API bez danych i są pomijane. Sprawdzić przy teście E.
6. **Kopia ustawień nadpisuje całość** (wygrywa nowszy zapis). Zmiany na dwóch urządzeniach w krótkim odstępie mogą się zgubić. Przy jednym użytkowniku do przyjęcia. Scalanie per pole dopiero przy zawodnikach. 1 h.

## B. Porządek kodu

1. ~~Testy `model.js`~~ Zrobione (`test/model.test.mjs`, 47 testów, `node --test`).
2. ~~Podział `app.js`~~ Zrobione: `util`, `store`, `intervals`, `calc`, `log`, `settings`, `app`.
3. ~~Stałe modelu w jednym miejscu~~ Zrobione: `K` w `model.js`. Krzywe udziału węglowodanów zostają przy funkcjach.
4. ~~Wydatek siłowni i biegu stały.~~ Zrobione 20.11: siłownia z kalorii urządzenia w ostatnich treningach (min. 2 z 29 dni), bez nich MET 5 × masa minus utrzymanie; inne aktywności MET 5 × masa. Bieg liczony z dystansu od 19.11.
5. **Opis modelu tylko w `index.html`.** Przenieść do `docs/model.md`, w aplikacji zostawić skrót. 30 min.
6. **Domyślny wiek 35 i płeć M**, gdy Intervals ich nie poda. Dla jednego użytkownika bez znaczenia, przy zawodnikach do onboardingu (D).

## C. Funkcje

1. ~~Przeliczenie dnia po treningu (Hexis Live).~~ Zrobione. Dalszy krok: uwzględnić zjedzone z Dziennika zamiast założenia „minione posiłki zjedzone według planu”, gdy kcal z dziś są wpisane w trakcie dnia.
2. **Plan a wykonanie w widoku Tydzień:** kcal i węgle z planu obok danych z Fitatu, z oznaczeniem wykonanych treningów. 1 h.
3. ~~Test potu.~~ Zrobione 20.11: w Ustawieniach, do jazdy lub biegu od 45 min z ostatnich 29 dni. Mediana z ostatnich 6 testów osobno na zewnątrz i na trenażerze, sprowadzona do 70% FTP. Bez temperatury: test w upale zawyży wynik zimą.
4. **Ostrzeżenie o niskiej dostępności energii:** zjedzone minus wydatek treningowy na kg beztłuszczowej masy ciała poniżej ok. 30 kcal przez kilka dni z rzędu. Wymaga C1/A4 i % tkanki tłuszczowej. 1 h.
5. **Trening jelita:** po jeździe jeden klik „tolerowane g/h”, a przed startem limit podaży rośnie stopniowo. 1,5 h.
6. **Kofeina przy starcie priorytetowym:** ok. 3 mg/kg i pora względem startu. 30 min.
7. **Pora posiłku z żelazem** jako opcja w ustawieniach: rano albo do 30 min po treningu, z dala od kawy i herbaty. 30 min.
8. **Przykładowe posiłki dla LOW, MEDIUM i HIGH** z gramaturą, jak w FoodCoach. 1 h kodu plus czas Tomasza na treść.
9. **Pogoda dla godziny treningu** koryguje płyny i sód. Wymaga zewnętrznego API (np. Open-Meteo) i lokalizacji, czyli zmiany zasady „łączymy się tylko z intervals.icu”. Najpierw decyzja. 1,5 h.
10. **Powiadomienia** („za 3 h trening, zjedz posiłek przed”). PWA na iOS obsługuje powiadomienia push, ale potrzebny jest serwer, który je wysyła. Łamie zasadę braku serwera, odłożone.

## D. Udostępnienie zawodnikom movementcare (decyzja otwarta)

Nie zaczynać przed spełnieniem warunków:
- co najmniej 2–3 tygodnie używania przez Tomasza, naprawione A1–A4 i gotowe testy B1,
- onboarding przy pierwszym uruchomieniu: masa, wzrost, wiek, płeć, FTP z Intervals, pory dnia,
- deficyt ukryty dla zawodników i włączany przez trenera (ryzyko niskiej dostępności energii bez nadzoru),
- wpis w regulaminie lub na stronie Compliance: narzędzie wspierające, nie porada dietetyczna, dane na urządzeniu i w Intervals,
- 2FA na koncie GitHub: podmiana kodu oznaczałaby dostęp do kluczy wszystkich użytkowników.

Koszt: ok. 4–6 h pracy plus pytania zawodników. Rekomendacja: tylko jako część opieki 1:1, bez osobnej sprzedaży i bez wsparcia technicznego poza opieką.

## E. Do sprawdzenia na iPhonie

Ikona i nazwa na ekranie głównym, praca offline, wycięcie ekranu (safe area), ciemny motyw, zapis klucza po zamknięciu aplikacji, pierwsza synchronizacja kopii ustawień między telefonem a komputerem.

## Odrzucone

„Co do kieszeni” (żele i batony zamiast gramów), natywna aplikacja iOS, własna baza w chmurze, iCloud. Powody w `docs/decyzje.md`.
