# Roadmapa

Stan na 19.11.2026. Szacunki to czas pracy z Claude, bez testu na telefonie (ok. 5 min na zmianę).

## Proponowana kolejność

1. A1 i A2: dane w Dzienniku przestają się psuć (35 min).
2. B1: testy modelu, zanim zmienimy w nim cokolwiek więcej (1–1,5 h).
3. A3 i A4: jedna, poprawna kalibracja utrzymania (1 h 15 min).
4. C1: przeliczanie dnia po wykonanym treningu, czyli główna luka wobec Hexis Live (2–3 h).
5. A5 i B2: skrypt wydania i podział `app.js` (2 h).

Reszta według potrzeby. Sekcja D dopiero po decyzji o zawodnikach.

## A. Błędy i ryzyka danych

1. **Dziennik zapisuje wszystkie wstępnie wypełnione pola**, nie tylko zmienione. Przy podwojonych danych z Garmina utrwala błąd w wellness (tak było 16.11). Poprawka: wysyłać tylko pola zmienione przez użytkownika. 15 min.
2. **Brak kontroli wiarygodności dnia.** Ostrzeżenie, gdy kcal nie zgadzają się z makro (4/4/9) o ponad 10% albo są ponad 1,8 raza wyższe od planu. Takie dni pomijane w kalibracji. 20 min.
3. **Dwie różne kalibracje.** Ustawienia liczą z 28 dni i półśrednich wagi, Dziennik z 21 dni i średniej 7-dniowej. Mogą pokazywać różne liczby. Jedna funkcja, jeden wynik w obu miejscach. 30 min.
4. **Kalibracja odejmuje trening z planu, nie z wykonania.** Pominięty albo skrócony trening zawyża wyliczone utrzymanie. Pobierać wykonane aktywności (kJ z Intervals) za 28 dni. 45 min.
5. **Ręczne podbijanie wersji w `sw.js`.** Łatwo zapomnieć, wtedy telefon pokazuje starą wersję. Skrypt `tools/release.sh`: podbija wersję, szuka w zmianach kluczy i danych osobowych, commit, push. 20 min.
6. **Kopia ustawień nadpisuje całość** (wygrywa nowszy zapis). Zmiany na dwóch urządzeniach w krótkim odstępie mogą się zgubić. Przy jednym użytkowniku do przyjęcia. Scalanie per pole dopiero przy zawodnikach. 1 h.

## B. Porządek kodu

1. **Testy `model.js`** (`node --test`, bez zależności): kJ z kroków zgodne z Intervals, bloki 30 min, timeline dla 3–6 posiłków i treningu rano, w południe i wieczorem, deficyt nigdy przed jakością, minimum dnia i posiłku, ładowanie przed startem. Dane syntetyczne, nie z Intervals. 1–1,5 h.
2. **Podział `app.js` (708 linii)** na moduły: pamięć i stan, API i kopia ustawień, utrzymanie, widoki Dzień, Tydzień, Dziennik, Ustawienia. 1,5–2 h, po testach.
3. **Stałe modelu w jednym miejscu** ze źródłami: progi 88% i 105% FTP, 90 kcal/h w utrzymaniu, krzywa udziału węglowodanów, ml/kg. 30 min.
4. **Wydatek siłowni i biegu stały** (280 kcal/h, 10 kcal/min) niezależnie od masy. Przeliczać przez masę ciała albo brać kJ/kcal z wykonanej aktywności. 30 min.
5. **Opis modelu tylko w `index.html`.** Przenieść do `docs/model.md`, w aplikacji zostawić skrót. 30 min.
6. **Domyślny wiek 35 i płeć M**, gdy Intervals ich nie poda. Dla jednego użytkownika bez znaczenia, przy zawodnikach do onboardingu (D).

## C. Funkcje

1. **Przeliczenie dnia po treningu (Hexis Live).** Po wgraniu aktywności regeneracja i kolejne posiłki liczą się z rzeczywistych kJ i czasu. Wymaga pobierania wykonanych aktywności (wspólne z A4). 2–3 h.
2. **Plan a wykonanie w widoku Tydzień:** kcal i węgle z planu obok danych z Fitatu, z oznaczeniem wykonanych treningów. 1 h.
3. **Test potu:** waga przed i po jeździe plus wypite płyny dają potliwość. Średnia z kilku testów, osobno trenażer i jazda na zewnątrz, zamiast stałych 0,9 l/h. 1 h.
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
