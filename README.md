# vacaYtion (vormals Reisekasse)

Reisekostenrechner für Gruppenreisen: Reisende und Haushalte, Flüge, Unterkünfte,
Transport vor Ort, Attraktionen und Sonstiges. Rechnet pro Person, pro Haushalt und
gesamt, mit Gruppenrabatten, Mehrwährung, Karte, Reiseplan und PDF-Export.

Ursprünglich als claude.ai-Artifact entstanden, hier als eigenständige Web-App (PWA).

## Zwei Apps nebeneinander

| | Adresse | Ordner |
| --- | --- | --- |
| **vacaYtion** (im Aufbau) | `/neu/` | `app/` (Svelte, TypeScript, Vite) |
| Bisherige Reisekasse | `/` | `public/` |
| Designprototyp | `/design/` | `public/design/` |

Die bisherige App bleibt online, bis die neue alles kann, was man täglich braucht.
Plan und Anwendungsfälle: [`docs/KONZEPT.md`](docs/KONZEPT.md).

## Neue App entwickeln

```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm test         # Rechenkern
npm run test:rules   # Sicherheitsregeln (Firebase-Emulator, braucht Java)
npm run test:cloud   # zwei Personen planen gemeinsam (Emulator + Browser)
npm run check    # Typprüfung
```

| Pfad | Inhalt |
| --- | --- |
| `app/src/lib/model.ts` | Datenmodell: Reise, Reisende, Posten mit Status und Angeboten |
| `app/src/lib/calc/` | Rechenkern ohne Oberfläche, mit Tests |
| `app/src/lib/ui/` | Oberfläche: Kapitel, Karten, Ambiente, Fokusmodus |
| `app/src/styles/` | Design-System (Farben je Kapitel, hell und dunkel) |
| `app/src/lib/cloud/` | Konto, Synchronisation und Teilen über Firebase |
| `app/firestore.rules` | Sicherheitsregeln der Datenbank, getestet in `app/rules-test/` |

Konto und Teilen: Einrichtung in [`docs/FIREBASE.md`](docs/FIREBASE.md). Ohne Firebase läuft die App nur lokal.

## Bisherige App starten

```bash
npm start        # http://localhost:8080
```

Kein Build-Schritt: alles in `public/` wird direkt ausgeliefert.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `public/index.html` | die App (HTML, CSS, JS in einer Datei) |
| `public/claude-shim.js` | Ersatz für die claude.ai-Laufzeit (`window.claude.use`) |
| `public/sw.js`, `manifest.webmanifest`, `icons/` | PWA: installierbar, offline nutzbar |
| `public/packs.json` | Länderpakete (Preise, Orte, Verbindungen, Attraktionen) |
| `public/world.json` | Länder, Städte, Flughäfen weltweit |
| `public/geo/` | Küstenlinien für die Karte |
| `public/places/` | Orte ab 2000 Einwohnern (GeoNames), nach Land verteilt |
| `public/plz.txt` | deutsche Postleitzahlen für die Anreise zum Flughafen |

## Unterschiede zur claude.ai-Version

| Funktion | claude.ai | eigenständig |
| --- | --- | --- |
| Speichern | geteilte Datenbank, alle Mitreisenden sehen denselben Stand | nur auf diesem Gerät (localStorage) |
| Flugsuche (Kiwi.com) | über MCP | noch nicht verfügbar |
| Unterkunftssuche (Booking.com, Trivago) | über MCP | noch nicht verfügbar |
| PDF | Speichern-Dialog | normaler Download |

## Veröffentlichen

Bei jedem Push auf `main` prüft `.github/workflows/pages.yml` die neue App (Tests,
Typprüfung), baut sie nach `/neu/` und veröffentlicht alles auf GitHub Pages. Bei Pull
Requests laufen nur die Prüfungen. Einmalig einschalten: *Settings → Pages → Source: GitHub Actions*.

Nach Änderungen an der App in `public/sw.js` die `VERSION` hochzählen, damit
installierte Apps das Update laden.

## Roadmap

- [x] Geteiltes Speichern über Firebase, damit Mitreisende denselben Stand sehen
- [ ] Flug- und Unterkunftssuche über eigene API-Anbindung
- [ ] App-Store-Versionen (Android/iOS) mit Capacitor
