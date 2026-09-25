# Reisekasse

Reisekostenrechner für Gruppenreisen: Reisende und Haushalte, Flüge, Unterkünfte,
Transport vor Ort, Attraktionen und Sonstiges. Rechnet pro Person, pro Haushalt und
gesamt, mit Gruppenrabatten, Mehrwährung, Karte, Reiseplan und PDF-Export.

Ursprünglich als claude.ai-Artifact entstanden, hier als eigenständige Web-App (PWA).

## Starten

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

Bei jedem Push auf `main` deployt `.github/workflows/pages.yml` den Ordner `public/`
auf GitHub Pages. Einmalig einschalten: *Settings → Pages → Source: GitHub Actions*.

Nach Änderungen an der App in `public/sw.js` die `VERSION` hochzählen, damit
installierte Apps das Update laden.

## Roadmap

- [ ] Geteiltes Speichern über ein Backend (z. B. Firebase oder Supabase), damit Mitreisende denselben Stand sehen
- [ ] Flug- und Unterkunftssuche über eigene API-Anbindung
- [ ] App-Store-Versionen (Android/iOS) mit Capacitor
