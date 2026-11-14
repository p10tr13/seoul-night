# Seoul night

Mod do Claude Code: ciemny, neonowy motyw w klimacie nocnego Seulu.

- **Animowane tło**: uliczka pełna neonów (포차, 부동산, GS25, emart…), namiot pocha ze stolikami, soju i makgeolli, sklep GS25 z zamrażarką na lody i małe stworki, z których jeden jest już po kilku kieliszkach (딸꾹).
- **Pikselowy pasek nad polem wpisywania**: szklanka somaek (limit 5 h), butelka soju (limit tygodniowy), szaszłyk 어묵 (kontekst rozmowy), czas pracy z 칼퇴 / 야근 / 주말 출근, gałąź git i status CI pull requesta.
- **Koreańskie napisy** w trakcie pracy Claude'a i `한 잔 할까?` pod polem wpisywania.

Tło i pasek rysują się w aplikacji desktopowej i mobilnej; w terminalu pasek jest jedną linijką tekstu. Status CI wymaga zainstalowanego i zalogowanego `gh`.

## Instalacja

W sesji Claude Code w terminalu:

```
/plugin install seoul-night --marketplace p10tr13/seoul-night
```

Odpowiedz `y` na pytanie o dodanie marketplace, potem wybierz zakres (domyślnie użytkownik).

Z powłoki:

```bash
claude plugin install seoul-night --marketplace p10tr13/seoul-night
```

W aplikacji desktopowej: `+` obok pola wpisywania → Plugins → Add marketplace z `p10tr13/seoul-night` → Add plugin.

Repozytorium jest prywatne: instalacja działa tylko na koncie z dostępem do niego i na komputerze z danymi logowania git do github.com (klucz SSH albo `gh auth login`, a potem `gh auth setup-git`).

## Rozwój

Zamiast instalować, można załadować mod prosto z folderu, wpisując go w `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\<ty>\\.claude\\mods\\seoul-night"
  }
}
```

Na macOS ścieżka to np. `~/.claude/mods/seoul-night`.

- `hooks/register.tsx`: motyw, tło, pasek, napisy.
- `hooks/meter.ts`: pikselowa grafika paska.
- `hooks/scene.ts`: wygenerowane tło (SVG); nie edytuj ręcznie.
- `tools/gen-scene.mjs`: generator tła: `node tools/gen-scene.mjs hooks <katalog na podgląd alley.svg>`.
- `tools/band-preview.mjs`: podgląd paska w kilku stanach: `node tools/band-preview.mjs hooks/meter.ts`.
