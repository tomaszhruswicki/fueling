# Deficyt w rytmie treningu, kroki z danych, poprawka kafelków

Data: 19.11.2026. Status: zaakceptowany przez Tomasza 19.11.2026.

## Po co

Tydzień 16–22.11 z celem 700 kcal dał −250 kcal: w dni treningowe deficyt wychodził 0, bo posiłki LOW są dobijane do minimum posiłku, a deficyt brał tylko z nich. Zasada Tomasza: kalorie falują w rytmie od treningu do treningu, a nie w rytmie doby. Posiłki przed ważną jednostką i po niej są w pełni zasilone, a deficyt ląduje daleko od ważnych jednostek. Przy okazji: dzisiejsza wędrówka liczyła się podwójnie (trening i kroki), a kafelki makro po przeliczeniu pokazywały inny plan niż liczba kcal.

## Cele

1. Deficyt realnie wchodzi w dni wolne, luźne i średnie, w proporcji ustalonej przez Tomasza.
2. Rozkład deficytu zgodny z badaniami: małe porcje na kilka posiłków, bez cięcia regeneracji, umiarkowane tempo, próg dostępności energii.
3. Wydatek z chodzenia z danych dnia, bez podwójnego liczenia. Bieg zaplanowany przez masę ciała.
4. Kafelki makro pokazują ten sam plan co liczba kcal.

## Poza zakresem

Oznaczanie zjedzonych posiłków w trakcie dnia, karta „teraz”, test potu, przykładowe posiłki, plan a wykonanie w Tygodniu. Zostają w roadmapie.

## Czego unikać (porażka mimo działającego kodu)

- Deficyt w posiłku przed mocną jednostką, w regeneracji albo w wieczór przed mocnym dniem.
- Jedna duża dziura zamiast kilku małych cięć.
- Dzień, w którym jedzenie minus trening spada poniżej progu dostępności energii.
- Liczba dnia, której nie da się wytłumaczyć jednym zdaniem w aplikacji.

## Podstawa naukowa

- Rozkład w ciągu dnia: długie godziny w deficycie powyżej 400 kcal i duże jednorazowe deficyty wiążą się z obniżonym RMR i wyższym kortyzolem przy tym samym bilansie dobowym (Torstveit i in. 2018, Fahrenholtz i in. 2017).
- Tempo: 0,7% masy ciała na tydzień zachowało masę beztłuszczową i siłę lepiej niż 1,4% (Garthe i in. 2011).
- Węgle według wymagań najbliższej jednostki (Impey i in. 2018); pełne węgle przed intensywną pracą jako priorytet (Podlogar i in. 2022).
- Dostępność energii poniżej ok. 30 kcal/kg masy beztłuszczowej to próg ryzyka REDs (IOC 2023).

## Sposoby, które rozważyliśmy

| | A+: dzień jako jednostka (wybrane) | B: okna między treningami |
|---|---|---|
| Jak | Udział dnia według intensywności, w dniu cięcie z posiłków najdalej od ważnej jednostki, plus reguła wieczoru po mocnym treningu | Budżet tygodnia dzielony na okna od treningu do treningu (także przez noc), waga według kolejnej jednostki |
| Koszt | ok. 2,5–3 h, obecny model | ok. 4–5 h, nowy model alokacji |
| Zysk | Czytelna liczba dnia, mało przypadków brzegowych | Wierniejszy rytmowi, trudniejszy do sprawdzenia |

Wybór Tomasza: A+. Badania nie rozstrzygają między A i B; oba spełniają te same zasady. A+ zamyka jedyną realną lukę A (wieczór dnia z mocnym treningiem rano, gdy następny dzień jest luźny).

## Zmiany

### 1. Kafelki makro po przeliczeniu (błąd)
Kafelki pokazują cel dnia z wykonania (to samo co liczba kcal). Gdy na dziś nie ma już posiłków, komunikat podaje brakujące makro: „brakuje ok. 730 kcal: B x g, W y g, T z g”.

### 2. Intensywność dnia
Obecna klasyfikacja zostaje (Tomasz: lepsza niż sam IF z artefaktu).
- Mocny: start lub priorytet, ≥ 12 min ≥ 88% FTP, ≥ 6 min ≥ 105% FTP, ≥ 1800 kJ, jazda ≥ 150 min, bieg z IF ≥ 0,85 lub ≥ 100 min.
- Średni: jazda ≥ 75 min albo IF ≥ 0,65, siłownia, pozostałe biegi. *Decyzja Claude: siłownia jako średni.*
- Luźny: pozostałe treningi.
- Wolny: bez treningu (spacery i wędrówki nie są treningiem, punkt 6).
Dzień ma intensywność najmocniejszej jednostki.

### 3. Udział dnia w deficycie
| Dzień | Udział |
|---|---|
| luźny | 100% |
| średni | 60% |
| wolny | 60% |
| mocny | 0, z wyjątkiem reguły A+ |
| wieczór przed mocnym dniem | 0 (jak dziś) |
Bez zmian: bez deficytu w dzień startu, ładowania, HP, choroby i przy ręcznym wyłączeniu. Zmęczenie: połowa udziału i maks. 150 kcal. *Decyzja Claude: 60% z przedziałów 50–75% podanych przez Tomasza.*

**Reguła A+:** w dzień mocny ostatni posiłek może przyjąć deficyt (udział 60%), jeśli jest co najmniej 4 h po regeneracji ostatniego treningu, a następnego dnia nie ma mocnej jednostki.

### 4. Skąd deficyt w dniu
- Kandydaci: posiłki LOW, potem posiłki MEDIUM, które nie są posiłkiem przed treningiem, przekąską przed treningiem ani regeneracją.
- Nigdy: posiłki HIGH, regeneracja po każdym treningu, dwa ostatnie posiłki przed mocną jednostką (także dzień wcześniej wieczorem, co pokrywa reguła wieczoru).
- Rozkład: proporcjonalnie do kcal kandydatów, każdy posiłek maks. 30% swoich kcal. Kolejność w posiłku: najpierw węgle do 0,3 g/kg, potem tłuszcz do 10 g, potem reszta proporcjonalnie (zmiana przy wdrożeniu: tłuszcz najpierw obniżał dzień wolny do 0,6 g/kg przy 5,9 g/kg węgli, wbrew zasadzie węgli według treningu). *Decyzja Claude: 30% na posiłek i kolejność makro.*
- Minimum posiłku przy cięciu: dla posiłków LOW 70% obecnego minimum, nie mniej niż 300 kcal; przekąska 150 kcal. Dla MEDIUM obecne minimum. *Decyzja Claude.*

### 5. Progi bezpieczeństwa
- Minimum dnia bez treningu: RMR × 1,15 (bez zmian).
- Nowy próg dostępności energii: jedzenie minus wydatek treningowy ≥ 30 kcal/kg masy beztłuszczowej. Masa beztłuszczowa z % tkanki tłuszczowej w ustawieniach; bez niego 85% masy ciała. Gdy próg ogranicza deficyt, dzień pokazuje to jednym zdaniem. *Decyzja Claude: 85% jako przybliżenie bez pomiaru.*

### 6. Kroki i chodzenie
- Dni przyszłe: utrzymanie ze średniej kroków z 7 ostatnich pełnych dni (zamiast 28).
- Dziś: większa z dwóch wartości: średnia albo kroki z wellness do tej pory.
- Dni minione i kalibracja: rzeczywiste kroki dnia.
- Aktywności Walk i Hike nie są treningiem (ich wydatek jest w krokach). Bieg, jazda, siłownia i pozostałe zostają treningiem.

### 7. Bieg zaplanowany
Koszt biegu na kilometr prawie nie zależy od tempa (ok. 1 kcal/kg/km), więc liczy się dystans.
1. Dystans z planu w Intervals (`distance` treningu albo `workout_doc.distance`) × masa ciała × 1 kcal/kg/km.
2. Bez dystansu: czas × średnia prędkość z wykonanych biegów z 28 dni (dystans / czas ruchu) × masa.
3. Bez biegów w historii: 10 km/h.
Minus 90 kcal/h jak przy rowerze. Bieg wykonany bez zmian (kalorie urządzenia). Siłownia bez zmian (280 kcal/h). (Zmiana po uwadze Tomasza: zamiast samej masy i czasu.)

### 8. Poziomy redukcji i cel tygodnia
| Poziom | Tempo | Przy 72,5 kg | Cel tygodnia |
|---|---|---|---|
| Lekki | 0,25% masy/tydz. | ok. 1400 kcal | sufit: bez odrabiania |
| Umiarkowany | 0,5% | ok. 2800 kcal | cel: niewykorzystana część przechodzi na kolejne dni wolne i luźne tego tygodnia |
| Mocny | 0,7% | ok. 3900 kcal | jak umiarkowany |
| Własny | kcal na tydzień i maks. na dzień | | sufit |
Dzienny limit: cel tygodnia / 3, nie więcej niż 600 kcal. Przechodzenie tylko w przód i tylko w obrębie tygodnia Pn–Nd. Deficyt domyślnie wyłączony (bez zmian). *Uwaga:* obecny „mocny” to 1750 kcal; nowe poziomy są wyższe, a ochronę dają progi z punktu 5.

## Pliki

- `model.js`: klasyfikacja intensywności, nowy rozdział deficytu w `planDay`, próg dostępności energii, bieg przez masę, kafelki w `liveAdjust` (cel dnia, brakujące makro).
- `calc.js`: udział dnia i reguła A+, poziomy i przechodzenie w tygodniu, kroki (średnia 7 dni, dziś, dni minione), Walk/Hike poza treningiem.
- `app.js`, `settings.js`: komunikaty dnia, poziomy redukcji, % tkanki tłuszczowej przy progu.
- `test/model.test.mjs`: testy dla punktów 1–8, w tym usunięcie `test.todo` deficytu w dzień treningowy.
- `PROJECT.md`: zmiana zasady „Deficyt tylko z posiłków LOW” na regułę z punktu 4 i dodanie progu z punktu 5. `docs/decyzje.md`, `docs/roadmapa.md`.

## Dla wykonawcy

Nazwy funkcji, struktura danych, teksty w interfejsie (styl: po polsku, konkretnie, bez myślników długich), szczegóły algorytmu rozkładu w granicach punktu 4. Szacunek: ok. 4 h z testami i sprawdzeniem w podglądzie.
