# Split&Fly (vormals Reisekasse)

Reisekostenrechner für Gruppenreisen: Reisende und Haushalte, Flüge, Unterkünfte,
Transport vor Ort, Attraktionen und Sonstiges. Rechnet pro Person, pro Haushalt und
gesamt, mit Gruppenrabatten, Mehrwährung, Karte, Reiseplan und PDF-Export.

Ursprünglich als claude.ai-Artifact entstanden, hier als eigenständige Web-App (PWA).

## Umgebungen

| | Adresse | Wann |
| --- | --- | --- |
| **Produktion** | https://splitandfly.com | bei jedem Push auf `main` |
| **Testumgebung** | https://elvau.github.io/startrek/ | bei jedem Push auf einen Feature-Branch |

Code der App in `app/` (Svelte, TypeScript, Vite), Daten und Rechtliches in `public/`.
Ablauf und Einrichtung: [`docs/RELEASE.md`](docs/RELEASE.md). Plan und Anwendungsfälle: [`docs/KONZEPT.md`](docs/KONZEPT.md).

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

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `app/` | die App (Svelte, TypeScript, Vite) |
| `worker/` | Such-Dienst für Flüge und Unterkünfte (Cloudflare Worker) |
| `public/airports.json` | Flughäfen und Städte (OurAirports, bei jedem Deploy erneuert) |
| `public/packs.json`, `public/world.json` | Länder, Städte, Richtwerte |
| `public/places/` | Orte ab 2000 Einwohnern (GeoNames), nach Land verteilt |
| `public/impressum.html`, `public/datenschutz.html` | Rechtliches |
| `public/neu/` | Weiterleitung von der früheren Adresse `/neu/` |
| `public/sw.js` | räumt den Service Worker der früheren Reisekasse auf |
| `docs/design/prototyp.html` | ursprünglicher Designprototyp |

## Veröffentlichen

- **Testumgebung:** Jeder Push auf einen Feature-Branch wird von `.github/workflows/pages.yml` geprüft (Tests, Typprüfung,
  Browser-Tests) und bei Erfolg auf GitHub Pages veröffentlicht.
- **Produktion:** Jeder Push auf `main` (Merge eines Feature-Branches) startet `.github/workflows/release.yml` und bringt den Stand
  auf splitandfly.com (Firebase Hosting). Siehe [`docs/RELEASE.md`](docs/RELEASE.md).

## Roadmap

- [x] Geteiltes Speichern über Firebase, damit Mitreisende denselben Stand sehen
- [ ] Flug- und Unterkunftssuche über eigene API-Anbindung
- [ ] App-Store-Versionen (Android/iOS) mit Capacitor
