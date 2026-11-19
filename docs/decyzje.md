# Decyzje

Najnowsze na górze. Każda z datą i powodem, żeby nie otwierać ich ponownie bez nowego argumentu.

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
