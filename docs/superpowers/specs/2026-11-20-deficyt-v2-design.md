# Deficyt v2: jedzenie od dnia przy biurku, kroki według typu dnia, rozdział posiłków

Data: 19.11.2026 (noc). Status: zaakceptowany przez Tomasza. Zastępuje część „Udział dnia” i „Poziomy” z `2026-11-19-deficyt-kroki-design.md` (wdrożone w fueling-v10).

## Po co

Uwagi Tomasza po v10 na żywych danych:
- 19.11 (dzień wolny z 3 h wędrówką, 21 tys. kroków): deficyt −600, jedzenie 2300 kcal, mniej niż zwykły dzień przy komputerze. Przyczyna: deficyt ucina posiłki od pełnego wydatku, a przenoszenie z dni minionych i wspólny limit 600 omijają udział 60% dnia regeneracji.
- 20.11 (siłownia 60 min): posiłek przed i po po 860–880 kcal (160 g węgli), dwa posiłki LOW po 350 kcal. Przyczyna: rozdział makro wkłada energię dnia w posiłki przy treningu.
- 22.11 (mocny dzień, ok. 1400 kcal treningu): 3890 kcal. Utrzymanie zakłada średnie kroki, a w mocne dni Tomasz rusza się mniej (dublowanie ok. 100–250 kcal).

Zasady Tomasza: każdy dzień od zera (logowanie nie będzie idealne); dzień regeneracji z lekkim deficytem; największy deficyt w dzień luźnego treningu; niewielka aktywność dorzucona w ciągu dnia nie zmienia jedzenia, tylko tworzy deficyt (deficyt budowany niską intensywnością); dni mocne na zero; posiłki do ogarnięcia (dwa po 350 kcal przy 74 kg to zły wynik).

## Zmiany

### 1. Deficyt: jedzenie od dnia przy biurku
Jedzenie dnia = większa z wartości:
- dzień przy biurku (utrzymanie przy średnich krokach dni wolnych) − deficyt bazowy,
- pełny wydatek dnia (kroki dnia i trening) − maks. deficyt typu dnia.

| Typ dnia | Deficyt bazowy | Maks. deficyt: lekki / umiarkowany / mocny |
|---|---|---|
| wolny | 150 | 250 / 300 / 350 |
| luźny trening | 150 | 400 / 500 / 600 |
| średni trening | 0 | 200 / 250 / 300 (posiłki przy treningu bez zmian) |
| mocny i dzień przed mocnym | 0 | 0; A+ zostaje (ostatni posiłek ≥ 4 h po regeneracji, jutro bez mocnej jednostki) |

- Bez przenoszenia między dniami. Poziom redukcji ustawia tylko limity z tabeli; własny poziom: użytkownik podaje maks. deficyt dnia luźnego, pozostałe proporcjonalnie do kolumny „umiarkowany”.
- Tydzień pokazuje wynikowy deficyt i tempo w kg/tydz. (7700 kcal/kg) jako informację.
- Bez zmian: próg dostępności energii (jedzenie − trening ≥ 30 kcal/kg masy beztłuszczowej, bez % tłuszczu 85% masy), minimum dnia wolnego RMR × 1,15, brak deficytu w dzień startu, ładowania, HP, choroby i przy ręcznym wyłączeniu, Zmęczenie: połowa limitów i maks. 150.
- Przykłady (umiarkowany, utrzymanie przy biurku ok. 2430): dzień wolny ze spacerem +200 kcal: jedzenie ok. 2280 jak bez spaceru; 19.11 z wędrówką: ok. 2600, deficyt 300; luźna jazda 60 min (ok. 470 kcal): ok. 2400 zamiast 2900, deficyt 500; siłownia 20.11: ok. 2460, deficyt 250.

### 2. Kroki według typu dnia
- Dni przyszłe: średnia kroków z dni tego samego typu (mocny, średni, luźny, wolny) z 28 dni; mniej niż 3 dni danego typu: mocny 75%, średni 90% średniej ogólnej, luźny i wolny 100%.
- Dziś: większa z wartości: średnia typu dnia albo kroki do teraz. Dni minione: rzeczywiste kroki.
- „Dzień przy biurku” w punkcie 1 zawsze ze średniej dni wolnych.

### 3. Spacery i wędrówki
Energia w krokach, nie jako trening (jest w v10). Nowe: spacer lub wędrówka ≥ 90 min chroni posiłek przed i po jak trening (bez cięcia).

### 4. Rozdział posiłków
- Węgle na posiłek według kodu: LOW ok. 0,4 g/kg, MEDIUM 0,8–1,0, HIGH 1,2–1,5, w granicach zakresu dnia (`carbBand`). Posiłek przed startem min. 2 g/kg i ładowanie bez zmian.
- Pozostała energia rozkłada się równo na wszystkie posiłki (głównie tłuszcz), nie jako węgle w posiłkach przy treningu.
- Dwa kolejne posiłki główne poniżej ok. 450 kcal: jeden staje się przekąską 150–250 kcal, drugi przejmuje resztę. Większy zostaje ten bliżej kolejnego treningu, bez treningu kolacja.

### 5. Do usunięcia z v10
Udziały procentowe dni (`SHARE`), przenoszenie w tygodniu, poziomy w % masy jako cel tygodnia (`cutBudget` w obecnej postaci). Zostają: A+, cięcie z posiłków z dala od treningu (maks. 30% posiłku, nigdy regeneracja, posiłek przed treningiem, posiłki HIGH, dwa posiłki przed mocną jednostką), kafelki zgodne z celem dnia, bieg z dystansu.

### 6. Testy i dokumenty
Testy na przypadkach: 19.11 (wędrówka), dzień wolny ze spacerem, luźna jazda 60 min, siłownia 20.11, mocna niedziela, brak kroków w wellness. Dane syntetyczne. Aktualizacja `PROJECT.md` (zasady deficytu), `docs/decyzje.md`, `docs/roadmapa.md`, tekstów w `index.html` i Ustawieniach.
