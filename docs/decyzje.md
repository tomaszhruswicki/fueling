# Decyzje

Najnowsze na górze. Każda z datą i powodem, żeby nie otwierać ich ponownie bez nowego argumentu.

## 20.11.2026: test potu i wydatek siłowni

- **Test potu w Ustawieniach** (C3): wybór jazdy lub biegu od 45 min z ostatnich 29 dni, waga przed i po, wypite ml. Potliwość = (przed − po + wypite) / czas. Wynik sprowadzony do ok. 70% FTP tym samym mnożnikiem, którego model używa dla intensywności (0,8 / 1 / 1,15), żeby testy o różnej intensywności dało się uśrednić. Mediana z ostatnich 6 testów osobno na zewnątrz i na trenażerze; brak jednego rodzaju: przeliczenie z drugiego przez 1,25. Testy zastępują pole „Pot” w Parametrach. Wynik poza 0,2–3,5 l/h odrzucany. Temperatury nie uwzględniamy (wymagałaby zewnętrznego API, C9). Testy zapisują się w ustawieniach, więc też w kopii w Intervals.
- **Wydatek siłowni** (B4): z kalorii urządzenia w treningach siłowych z 29 dni (min. 2, od 20 min, minus 90 kcal/h utrzymania, w granicach 120–600 kcal/h). Bez historii MET 5 × masa minus 90 kcal/h (72 kg: 270 kcal/h, blisko dawnych 280). Inne aktywności MET 5 × masa minus 90 kcal/h zamiast stałych 6 kcal/min. Bieg bez zmian (z dystansu od 19.11).
- **Fitatu bez synchronizacji.** Fitatu nie ma publicznego API, a PWA nie czyta Apple Health. Kcal i makro zostają wpisywane w Dzienniku do wellness w Intervals; C2 weźmie je stamtąd.

## 20.11.2026: budowa (nadwyżka)

- **Suwak bilansu od −600 do +300.** Prawa strona to nadwyżka w dzień z siłownią; punkty Budowa (+200) i Budowa+ (+300). Udziały: siłownia 100%, dzień po siłowni i mocny 50%, luźny i średni 25%, wolny 0. Powód: przyrost beztłuszczowej masy u wytrenowanych to ok. 0,25–0,5% masy na miesiąc, większa nadwyżka idzie w tłuszcz (Iraki i in. 2019, Garthe i in. 2013); synteza białek podwyższona do ok. 36 h po siłowni (MacDougall i in. 1995); u kolarza tłuszcz obniża W/kg.
- **Gdzie nadwyżka:** najpierw przekąska przed snem w dzień siłowni (30–40 g białka, ok. 0,15 g/kg węgli; Snijders i in. 2015), dodatkowa ponad posiłki dnia, od +150 kcal i gdy ostatni posiłek jest min. 2 h przed snem. Reszta do regeneracji (siłowni, inaczej pierwszej) i następnego posiłku, 70% węgle i 30% białko; bez treningu do dwóch pierwszych posiłków. Przy +200 prawie całość idzie w przekąskę przed snem.
- **Białko min. 2,0 g/kg, regeneracja min. 0,4 g/kg** (białko przesuwane z posiłków bez treningu, energia wyrównana tłuszczem).
- **Bez nadwyżki:** Choroba, HP (ma własne węgle), ładowanie, dzień startu i dzień przed nim, ręczne wyłączenie dnia.

## 20.11.2026: suwak redukcji i rekompozycja

- **Suwak zamiast trzech poziomów.** Jedna wartość: maks. deficyt dnia z luźnym treningiem, 0–600 kcal co 50. Punkty Lekki (400), Umiarkowany (500), Mocny (600) dają limity z tabeli v2, między nimi liniowo, poniżej 400 proporcjonalnie do lekkiego. 0 = utrzymanie (deficyt wyłączony). Powód: Tomasz chciał poziomów pośrednich; suwak daje je bez nowych tabel. Starsze ustawienia przechodzą automatycznie (lekki 400, umiarkowany 500, mocny 600, własny według wpisanej wartości).
- **Rekompozycja jako punkt suwaka (250) z przełącznikiem.** Dni z siłownią i mocne na zero (bez A+), białko min. 2,2 g/kg (Helms i in. 2014, Barakat i in. 2020). Nadwyżka po siłowni odłożona: najpierw obserwacja.
- **Utrzymanie jako osobny tryb odrzucone:** to samo co deficyt wyłączony, więc jest punktem 0 na suwaku.
- **Tempo tygodnia** pod suwakiem i w widoku Tydzień tylko jako informacja (7700 kcal/kg).

## 20.11.2026: deficyt v2

Spec `docs/superpowers/specs/2026-11-20-deficyt-v2-design.md`, odpowiedź na uwagi Tomasza z żywych danych 19–22.11 (dzień wolny z wędrówką −600, siłownia 860/880 kcal przy treningu i dwa LOW po 350, mocna niedziela 3890 kcal).

- **Jedzenie od dnia przy biurku.** Jedzenie dnia = większa z wartości: dzień przy biurku (utrzymanie przy średnich krokach dni wolnych) − deficyt bazowy albo pełny wydatek − maks. deficyt typu dnia. Deficyt bazowy: wolny i luźny 150, średni i mocny 0. Maks. (lekki/umiarkowany/mocny): wolny 250/300/350, luźny 400/500/600, średni 200/250/300, mocny 0. Powód: niewielka aktywność w ciągu dnia ma tworzyć deficyt, a nie podnosić jedzenie; każdy dzień od zera, bo logowanie nie będzie idealne.
- **Bez przenoszenia między dniami i bez celu tygodnia** (`SHARE`, `cutBudget` z v10 usunięte). Tydzień pokazuje wynikowy deficyt i tempo (7700 kcal/kg) tylko jako informację. Własny poziom: maks. deficyt dnia luźnego, pozostałe proporcjonalnie do umiarkowanego.
- **A+ w dzień mocny z limitem dnia wolnego.** Spec mówi „mocny 0, A+ zostaje” bez kwoty; przyjęto limit dnia wolnego (w v10 A+ miał udział dnia wolnego, 60%). Do potwierdzenia przez Tomasza.
- **Kroki według typu dnia z 28 dni**, mniej niż 3 dni typu: mocny 75%, średni 90%, luźny i wolny 100% średniej. Utrzymanie odnosi się do średniej z 28 dni (wcześniej 7). Powód: w mocne dni Tomasz rusza się mniej, a utrzymanie zakładało średnie kroki (dublowanie 100–250 kcal).
- **Spacer lub wędrówka od 90 min chroni posiłek przed i po** (bez cięcia), energia nadal w krokach.
- **Rozdział posiłków.** Suma dnia jak wcześniej: białko i tłuszcz z ustawień, węgle reszta, w granicach zakresu dnia (powyżej górnej nadwyżka idzie w tłuszcz). Posiłek dostaje węgle według kodu (LOW 0,4, MEDIUM 0,9, HIGH 1,35 g/kg, przekąska połowa), reszta węgli po równo na posiłki, a tłuszcz domyka równą energię posiłków (więcej w LOW, mało przy treningu). Odrzucone dosłowne „reszta energii głównie w tłuszczu”: w dzień 4 h jazdy dawało ok. 3,5 g/kg tłuszczu, a w dni wolne węgle spadały pod zakres po deficycie. Deficyt tnie węgle tylko do dolnej granicy zakresu dnia, dalej tłuszcz.
- **Dwa kolejne posiłki główne poniżej ok. 450 kcal** (poza treningiem): mniejszy staje się przekąską 150–250 kcal (25% sumy), większy zostaje ten bliżej kolejnego treningu, bez treningu późniejszy.

## 19.11.2026 (noc)

- **Deficyt w rytmie treningu (A+)**, spec `docs/superpowers/specs/2026-11-19-deficyt-kroki-design.md`. Udziały Tomasza: luźny 100%, średni 60%, wolny 60% (dzień regeneracji), mocny 0. Rozważone okna między treningami (B): wierniejsze, ale trudniejsze do sprawdzenia; badania nie rozstrzygają między A i B. A+ dodaje ostatni posiłek dnia mocnego, gdy jest 4 h po regeneracji i jutro nie ma mocnej jednostki.
- **Rozkład po trochu z kilku posiłków** (maks. 30%), regeneracja po każdym treningu bez cięcia (Torstveit 2018, Fahrenholtz 2017: długie godziny w deficycie i duże jednorazowe deficyty wiążą się z obniżonym RMR).
- **Próg dostępności energii 30 kcal/kg masy beztłuszczowej** w dni treningowe; minimum RMR × 1,15 tylko w dni wolne. Bez % tłuszczu masa beztłuszczowa = 85% masy.
- **Poziomy w % masy na tydzień** (0,25/0,5/0,7%; Garthe 2011). Lekki i własny to sufit, umiarkowany i mocny przenoszą resztę na dni wolne i luźne do niedzieli.
- **Kroki dnia w utrzymaniu**, spacery i wędrówki nie są treningiem. Powód: wędrówka 19.11 liczyła się podwójnie.
- **Bieg z dystansu** (1 kcal/kg/km), bez dystansu z tempa z biegów z 28 dni. Tomasz odrzucił stałą i samą masę × czas.
- **Klasyfikacja intensywności bez zmian** (minuty ≥ 88% FTP, VO2, kJ, długość) zamiast IF z artefaktu: Tomasz uznał obecną za lepszą.

## 19.11.2026 (wieczór)

- **Dopasowanie aktywności do planu tylko po parowaniu w Intervals** (`paired_event_id`). Wcześniej także ten sam rodzaj sportu tego dnia, przez co poranny dojazd rowerem „wykonywał” wieczorny trening i obcinał kolację. Okno czasowe 3 h odrzucone: Intervals paruje wystarczająco dobrze. Niesparowany trening przy aktywności tego samego sportu dostaje podpowiedź (sparuj albo odznacz „robię”), bo do tego czasu liczą się oba.
- **Minione posiłki, których nie było w widocznym planie** (np. regeneracja po treningu poza planem), nie liczą się jako zjedzone; ich energię przejmuje reszta dnia.
- **Przeliczenie dnia po treningu.** Aktywność z Intervals zastępuje sparowany trening z planu; niesparowana dochodzi osobno. Energia z `icu_joules`, inaczej z kalorii urządzenia minus 90 kcal/h. Charakter treningu (jakość, długi) zostaje z planu, gdy wykonanie trwało min. 70% planu, bo z samej aktywności nie znamy minut ≥ 88% FTP. Posiłki, których pora minęła, liczone jak zjedzone według planu; różnicę przejmują kolejne posiłki, posiłek przed i regeneracja nie oddają węgli, nic poniżej minimum. Gdy kolejnych posiłków nie ma, aplikacja pisze, ile brakuje. Powód: główna luka wobec Hexis Live.
- **Węgle w trakcie z pola „carbs” w Intervals**, bez wpisu z planu proporcjonalnie do czasu, a dla jazdy poza planem ok. 40 g/h powyżej 75 min. Powód: zakładanie zera zawyżałoby regenerację po każdej jeździe.
- **Dni minione liczone z wykonania**, trening bez aktywności nie wchodzi do bilansu. Dziennik porównuje zjedzone z planem z wykonania.
- **Odświeżanie bez serwera:** przy otwarciu, po powrocie do aplikacji po 2 min, co 5 min, a co 2 min, gdy dzisiejszy trening powinien się skończyć, a aktywności nie ma (do 4 h). iOS wstrzymuje liczniki PWA w tle, więc w praktyce przeliczenie pojawia się po otwarciu aplikacji. Powiadomienia push odrzucone (wymagają serwera).
- **Dziennik wysyła tylko zmienione pola** i ostrzega przy kcal niezgodnych z makro o ponad 10% lub ponad 1,8 × planu. Takie dni nie wchodzą do kalibracji.
- **Jedna kalibracja utrzymania** dla Ustawień i Dziennika: 28 dni, trend masy z regresji liniowej, trening z wykonania.
- **Podział kodu na moduły ES** bez narzędzi budujących i testy `node --test` bez zależności. Zasada „żadnych zewnętrznych bibliotek” bez zmian.

## 19.11.2026

- **Repozytorium w `~/Developer/fueling`.** Wcześniej `Personal AI/Moj Trening/fueling-app` w iCloud. Kod z gitem nie powinien leżeć w iCloud (ryzyko uszkodzenia `.git` przy synchronizacji), a repozytoria movementcare są w `~/Developer`.
- **Tydzień zawsze od poniedziałku do niedzieli** we wszystkich widokach.
- **Pory posiłków na trzech poziomach:** dzień, dzień tygodnia, domyślne. Bez ustawień: równy podział od pobudki do kolacji 3 h przed snem. Trening sam przejmuje najbliższy posiłek przed (1,5–4 h) i po.
- **Minimum posiłku głównego** (domyślnie utrzymanie ÷ liczba posiłków × 0,8, min. 400 kcal; przekąska 150 kcal). Za mały posiłek dobiera energię z większych, a gdy energii nie starcza, najmniejszy posiłek bazowy znika. Powód: posiłki po 190–380 kcal były niepraktyczne.
- **Liczba posiłków bazowych w dzień wolny w ustawieniach** (3–6, domyślnie 4). W dzień treningowy aplikacja dokłada posiłki tylko, gdy czegoś brakuje.
- **Kalkulator utrzymania zamiast ręcznej wartości:** RMR (ten Haaf 2014, przy znanym % tłuszczu Cunningham) × 1,2 + kroki z 28 dni. Po 14 dniach z kcal i 8 pomiarach wagi średnia z kalibracją z danych. Tryb ręczny zostaje.
- **Minimum dnia RMR × 1,15 i łagodniejsze poziomy deficytu** (150/250/400 kcal dziennie), deficyt domyślnie wyłączony. Powód: dzień bez treningu wychodził 1900 kcal, czyli dokładnie to, czego wcześniejsze ustalenia żywieniowe miały unikać.
- **Hosting GitHub Pages z domeną fueling.movementcare.pl** zamiast FTPS na dhosting. Powód: wdrożenie bez haseł, historia zmian i łatwe wycofanie, osobny serwer od WordPressa. Koszt: kod publiczny (bez danych). Adres można przepiąć na dhosting jednym rekordem DNS.
- **Dane w Intervals, bez własnej bazy.** Waga i kcal w wellness, ustawienia w notatce z datą 1.01.2020. Powód: ten sam stan na telefonie i komputerze po wpisaniu klucza, a przy zawodnikach movementcare nie staje się administratorem ich danych zdrowotnych. Odrzucone: własna baza w chmurze (RODO, serwer), iCloud (wymaga natywnej aplikacji).
- **PWA zamiast natywnej aplikacji iOS.** Natywna wymaga Xcode i konta Apple Developer (99 USD rocznie). PWA z ekranu głównego pokrywa potrzeby.
- **Połączenie przez klucz API Intervals, nie przez MCP.** Artefakt „Paliwo tygodnia” działał tylko w aplikacji Claude. API Intervals obsługuje CORS, więc telefon pyta je bezpośrednio.
- **Węgle i kJ z kroków treningu, nie z IF.** Trening z mocnym początkiem i długim tlenem ma niskie IF, a wysokie zapotrzebowanie na starcie.
- **Odrzucone: „co do kieszeni”** (zamiana gramów na żele i batony). Wystarczy g/h, suma i rozpisanie na bloki 30 min.
