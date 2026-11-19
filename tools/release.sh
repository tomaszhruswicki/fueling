#!/bin/bash
# Wydanie: testy, kontrola danych osobowych i sekretów, podbicie wersji w sw.js, commit, push (GitHub Pages publikuje od razu).
# Użycie: tools/release.sh "Opis zmian"
set -euo pipefail
cd "$(dirname "$0")/.."
msg="${1:?Podaj opis zmian: tools/release.sh \"Opis\"}"

[ "$(git branch --show-current)" = "main" ] || { echo "Wydanie tylko z gałęzi main."; exit 1; }
node --test >/dev/null || { echo "Testy nie przechodzą: node --test"; exit 1; }

# Kontrola: klucze API, ID zawodników Intervals (i123456), adresy e-mail, pliki z danymi testowymi.
git add -A
if git diff --cached --name-only | grep -E '(^|/)_seed|\.local' ; then echo "W zmianach są pliki z danymi testowymi."; exit 1; fi
hits=$(git diff --cached -U0 -- . ':!tools/release.sh' | grep '^+' | grep -v '^+++' | grep -nEi '(api[_-]?key|token|secret|password)["'"'"' ]*[:=] *["'"'"'][A-Za-z0-9_\-]{12,}|\bi[0-9]{5,7}\b|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}' || true)
if [ -n "$hits" ]; then echo "Możliwe dane osobowe lub sekrety w zmianach:"; echo "$hits"; git reset -q; exit 1; fi

# Wersja pamięci podręcznej PWA: bez tego telefon może pokazywać starą wersję.
v=$(sed -nE 's/.*fueling-v([0-9]+).*/\1/p' sw.js | head -1)
sed -i '' -E "s/fueling-v${v}/fueling-v$((v + 1))/" sw.js
git add sw.js
git commit -q -m "$msg" && git push -q && echo "Wydano fueling-v$((v + 1))."
