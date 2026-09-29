# Fehler melden (Beta)

Der rote Knopf 🐞 unten links schickt eine Meldung an den Such-Dienst (`POST /bug`, Code in `worker/src/bugs.ts`).
Der Dienst prüft die Anmeldung, erlaubt 5 Meldungen pro Person und Tag, legt ein Bild im R2-Speicher ab und
erstellt ein Issue in einem **privaten** GitHub-Repo. Das Haupt-Repo ist öffentlich, deshalb nicht dorthin:
Meldungen und Bildschirmfotos können Namen und Reisedaten enthalten.

Mit jeder Meldung gehen mit: Beschreibung, Seite (ohne Einladungscode), Sprache, Browser, Bildschirmgröße,
App-Stand (Commit), Art der Ansicht (ohne Namen) und die letzten 10 Fehlermeldungen im Browser.

## Einrichten

1. **Privates Repo** auf GitHub anlegen, z. B. `elvau/splitandfly-bugs`.
2. **Token**: GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.
   Repository access: *Only select repositories* → das Bug-Repo. Permissions → Repository → *Issues: Read and write*.
3. **Cloudflare** → Workers & Pages → `startrek` → Settings → Variables and Secrets:
   - `GITHUB_TOKEN` als Typ **Secret** (der Token aus Schritt 2)
   - `BUG_REPO` als Typ Text, z. B. `elvau/splitandfly-bugs`
   - optional `BUG_DAILY` (Meldungen pro Person und Tag, Standard 5)
4. **Bildspeicher**: Cloudflare → R2 → Create bucket `splitandfly-bugs`.
   Im Bucket → Settings → Object lifecycle rules → Regel „Delete objects“ nach **30 Tagen** für alle Objekte.
   `wrangler.toml` **und** `worker/wrangler.toml` binden den Bucket als `BUG_BUCKET` ein; fehlt er,
   schlägt das Veröffentlichen des Such-Dienstes fehl.

Ohne Schritt 1–3 antwortet der Dienst „noch nicht eingerichtet“. Ohne Schritt 4 kommen Meldungen ohne Bild an
(im Issue steht dann, dass ein Bild mitgeschickt wurde).

Bilder sind unter `https://<such-dienst>/bug-image/<datum>/<zufälliger-name>` abrufbar; der zufällige Name steht
nur im Issue. Nach 30 Tagen löscht R2 sie.

Der Such-Dienst wird nur von `main` veröffentlicht: Der Knopf funktioniert auf der Testumgebung erst nach einem Release.
