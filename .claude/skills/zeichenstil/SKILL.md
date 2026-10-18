---
name: zeichenstil
description: Split&Fly-Zeichenstil für Illustrationen (SVG-Szenen). Nutzen für neue Bilder in Anleitung, Reiseideen, Aktionsseiten oder Vorschaubildern, auch zusammen mit Claude Design.
---
# Split&Fly-Zeichenstil

Vorbild: `app/src/lib/seo/art.ts` (Reiseideen) und `app/src/lib/guide/art.ts` (Anleitung). Eine Szene ist ein SVG, 1200×480, als Text im Code.

## Stil
- Flach, ohne Konturen und Verläufe außer dem Himmel (`sky(oben, unten)`), runde Ecken, einfache Grundformen.
- Palette `C` aus `seo/art.ts`: Blau `#2F6FDB`, Orange, Gold, Pink, Grün, Dachrot, Creme, Nachtviolett. Hell- und Dunkelstimmung über den Himmel (Tag, Abend, Nacht), nicht über Schatten.
- Bausteine wiederverwenden (`sun, cloud, hills, water, house, palm, pine, boat, star, confetti`); Figuren und Gegenstände je Szene als kleine Funktion.
- Eine Szene erzählt einen Gedanken (Koffer + Route = Start; Kalender mit Lücke = Tagesplan). Wenig Schrift: höchstens kurze Wörter in Pillen (system-ui, fett), Wortlaut wie in der App.
- Barrierefrei: `role="img"`, `aria-label` und `<title>` mit Beschreibung (`alt` in `ART` bzw. `GUIDE_ART`). Gradient-IDs eindeutig (`sky()` zählt hoch).
- Keine Fotos, keine Marken, keine echten Personen.

## Mit Claude Design
Für neue Motive in Claude Design: Palette und Regeln oben mitgeben, Ergebnis als SVG 1200×480 zurückholen und als Szene in `art.ts` einbauen (Bausteine statt Fremdcode), dann als Bild prüfen: Playwright-Screenshot der erzeugten Seite.
