# Homebase Startpage

Homebase ist eine kleine, Docker-freundliche Startseite fuer das Heimnetz. Links, Kategorien, Seitentitel und Untertitel werden direkt im Browser gepflegt und dauerhaft in einem Docker-Volume gespeichert.

## Funktionen

- Browserbasierte Pflege von Links, Kategorien, Profilen, Notizen, Titel und Untertitel
- Kategorie-Icons und Farben fuer bessere Gruppierung
- Einklappbare Suche ueber Linktitel, Kategorie und Notiz, auch per `Cmd+K`/`Ctrl+K`
- Automatisch gruppierte Kategorien mit alphabetischer Sortierung
- JSON-Backup/Restore in der UI
- Import von Browser-Bookmarks als HTML-Datei
- Automatischer Favicon-Abruf mit lokalem Cache
- Optionale Link-Statusanzeigen fuer Proxmox, Unraid, AMP und einfache HTTP-Dienste
- Themes: Retro, Time Circuit, Dark, Light, Terminal, Discord Dark und Discord Light
- Startseiten- und Freigabe-Modus fuer normale Read-only Nutzung
- Widget-Galerie fuer Wetter, Notizen, Statusuebersicht und Linkstatistik

## Erster Start

Voraussetzungen:

- Docker mit Docker Compose
- Ein freier Host-Port, standardmaessig `3000`

Start lokal:

```bash
cp .env.example .env
docker compose up -d
```

Danach ist Homebase unter `http://localhost:3000` erreichbar. Im Heimnetz nutzt du die IP des Docker-Hosts, zum Beispiel:

```text
http://<server-ip>:3000/
```

Beim ersten Start erscheint ein Setup-Dialog. Dort legst du Seitentitel und erstes Profil fest.

## Portainer Deploy

In Portainer kannst du Homebase als Git-Stack deployen.

- Repository URL: `https://github.com/sandavdesigns/homebase.git`
- Branch: `main`
- Compose path: `docker-compose.yml`

Empfohlene Stack-Variablen:

```text
HOMEBASE_IMAGE=ghcr.io/sandavdesigns/homebase:latest
HOMEBASE_PORT=3000
HOMEBASE_INTERNAL_PORT=3000
HOMEBASE_VOLUME_NAME=homebase_data
```

Portainer/Docker Compose vergibt den Container-Namen automatisch mit dem Stack-Namen als Prefix. Das Daten-Volume ist aus Kompatibilitaetsgruenden standardmaessig `homebase_data`, damit bestehende Installationen ihre Daten behalten. Fuer parallele Testinstallationen setze `HOMEBASE_VOLUME_NAME` auf einen eigenen Wert, zum Beispiel `homebase_test_data`.

Testhinweise fuer Portainer:

- Fuer Tests einen eigenen externen Port und ein eigenes Volume verwenden, zum Beispiel `HOMEBASE_PORT=3001` und `HOMEBASE_VOLUME_NAME=homebase_test_data`.
- Vor Restore-Tests ein Backup ueber die UI oder das Docker-Volume erstellen.
- Nach Deploy oder Update `http://<server-ip>:<port>/api/health` pruefen und die Startseite im Browser neu laden.
- Wenn das Image auf `latest` steht, in Portainer vor dem Test ein Pull/Redeploy ausfuehren.

Alternativ kannst du in Portainer einen Stack direkt mit dem Image anlegen:

```yaml
services:
  homebase:
    image: ghcr.io/sandavdesigns/homebase:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      PORT: 3000
      HOST: 0.0.0.0
      DATA_DIR: /data
      ADMIN_PASSWORD:
    volumes:
      - homebase_data:/data

volumes:
  homebase_data:
```

Wenn Port `3000` auf dem Host schon belegt ist, aendere nur den externen Port:

```text
HOMEBASE_PORT=3001
```

Die App bleibt im Container auf `3000`, ist aber extern unter `http://<server-ip>:3001/` erreichbar.

## Environment Variablen

Die Compose-Datei verwendet `HOMEBASE_*` Variablen fuer Deployment-Details und setzt daraus die Container-Umgebung.

| Variable | Standard | Beschreibung |
| --- | --- | --- |
| `HOMEBASE_IMAGE` | `ghcr.io/sandavdesigns/homebase:latest` | Docker Image fuer den Stack. Fuer reproduzierbare Deployments auf einen Versions-Tag setzen. |
| `HOMEBASE_PORT` | `3000` | Externer Host-Port. |
| `HOMEBASE_INTERNAL_PORT` | `3000` | Interner Container-Port und Wert fuer `PORT`. Normalerweise unveraendert lassen. |
| `HOMEBASE_VOLUME_NAME` | `homebase_data` | Docker-Volume fuer Daten und Favicons. Fuer mehrere Stacks jeweils einen eigenen Namen setzen. |
| `ADMIN_PASSWORD` | leer | Optionales Server-Passwort als Login-Fallback, sobald eine IP-Allowlist gepflegt ist. Ohne IP-Liste ist Homebase frei erreichbar. |
| `HOMEBASE_STATUS_TARGETS` | `[]` | Optionales JSON fuer Link-Statusanzeigen. Secrets bleiben in der Container-Umgebung. |

Container-interne Variablen:

- `PORT`: Wird von `HOMEBASE_INTERNAL_PORT` gesetzt.
- `HOST`: Wird im Container auf `0.0.0.0` gesetzt.
- `DATA_DIR`: Wird im Container auf `/data` gesetzt.

## Docker Image

Das Image wird per GitHub Actions automatisch gebaut und in GitHub Container Registry veroeffentlicht:

```text
ghcr.io/sandavdesigns/homebase:latest
```

Bei Pushes auf `main` wird `latest` aktualisiert. Git-Tags im Format `v0.1.0` erzeugen zusaetzliche versionierte Image-Tags. Pull Requests werden nur gebaut, aber nicht gepusht.

Fuer lokale Entwicklung mit Build aus dem Repository:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

## Profile

Profile werden direkt im Browser verwaltet. Jedes Profil hat eigene Kategorien und Links, teilt sich aber Titel, Theme, Widgets und Favicon-Cache mit der Homebase-Instanz.

- `+ Profil` erstellt ein neues Profil.
- `Profil löschen` entfernt das aktive Profil, solange mindestens ein weiteres Profil existiert.
- Das Profil-Dropdown wechselt zwischen Profilen.
- `Demo-Profil` in den Einstellungen erstellt ein anonymes Beispielprofil fuer Tests oder Screenshots.

## Admin-Modus

Homebase startet im Startseiten-Modus: Links und Widgets sind sichtbar, Bearbeitung bleibt verborgen. Ohne IPs in der Allowlist ist Homebase frei erreichbar. Sobald mindestens eine IP eingetragen ist, duerfen diese IPs ohne Login hinein; alle anderen brauchen `ADMIN_PASSWORD`. Ist kein `ADMIN_PASSWORD` gesetzt, bleibt nur die IP-Allowlist.

Der Freigabe-Modus blendet im gesperrten Zustand den Admin-Hinweis aus. Das ist fuer Familien-, Werkstatt- oder Tablet-Ansichten gedacht, bei denen Homebase wie eine ruhige Startseite wirken soll.

## Themes

Das Theme-Dropdown wechselt zwischen `Retro`, `Time Circuit`, `Dark`, `Light`, `Terminal`, `Discord Dark` und `Discord Light`. Die Auswahl wird in `homebase.json` gespeichert.

Optional kannst du in den Einstellungen mehrere Hintergrundbilder hochladen, die Transparenz regeln und ein Wechsel-Intervall setzen. Die Bilder werden im Docker-Datenvolume gespeichert und auf der Startseite weich uebergeblendet. Ohne hochgeladenes Bild nutzt Homebase nur das jeweilige Theme.

## Import, Backup und Restore

Backup:

- Im Browser unter `Einstellungen` ein Backup herunterladen.
- Alternativ `http://<server-ip>:<port>/api/homebase/export` aufrufen.
- Die Datei wird als `homebase.json` heruntergeladen.

Restore:

- Im Browser unter `Einstellungen` ein Restore starten.
- JSON-Datei auswaehlen oder JSON direkt einfuegen.
- `Importieren` ersetzt die aktuelle Konfiguration.

Browser-Bookmarks:

- HTML-Export aus dem Browser waehlen, zum Beispiel `bookmarks.html`.
- Homebase liest Ordner als Kategorien und Lesezeichen als Links ein.
- Pruefe nach dem Import Kategorien, Dubletten und fehlende URLs.

Homarr-Board:

- JSON-Export aus Homarr waehlen, zum Beispiel `SWGN_01.json`.
- Homebase importiert Homarr-Kategorien als Kategorien und Apps als Links in ein neues Profil.
- Homarr-Icon-URLs werden nicht uebernommen. Die Link-Bilder kommen wie gewohnt ueber die Favicons der Zielseiten.

Die Datei liegt im Container unter:

```text
/data/homebase.json
```

Beim Schreiben normalisiert Homebase Daten wie fehlende IDs, Kategorien und URLs. Gueltige URLs duerfen mit `http://`, `https://`, `mailto:` oder `tel:` beginnen.

## Backups

Wichtige Daten liegen im Docker-Volume:

- `homebase.json`: Startseiten-Konfiguration
- `favicons/`: Lokaler Favicon-Cache

Ein einfaches Backup ist der UI-Backup-Download im Browser. Fuer ein vollstaendiges Volume-Backup sichere das Docker-Volume aus `HOMEBASE_VOLUME_NAME`, standardmaessig `homebase_data`.

Beispiel mit einem temporaeren Alpine-Container:

```bash
docker run --rm \
  -v homebase_data:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/homebase_data.tar.gz -C /data .
```

Restore:

```bash
docker compose down
docker run --rm \
  -v homebase_data:/data \
  -v "$PWD":/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/homebase_data.tar.gz -C /data"
docker compose up -d
```

Pruefe vor dem Restore, dass der Volume-Name zum Zielsystem passt.

## Favicon Cache

Favicons werden automatisch ueber `/api/favicon?url=...` geladen und unter `/data/favicons/` gecacht. Der Browser darf Favicons bis zu sieben Tage cachen.

Wenn ein Icon falsch oder veraltet ist:

1. Container stoppen.
2. Den Ordner `favicons/` im Daten-Volume loeschen oder einzelne Cache-Dateien entfernen.
3. Container starten.
4. Browser-Cache hart aktualisieren, falls das alte Icon weiterhin angezeigt wird.

Wenn kein Icon geladen werden kann, zeigt Homebase ein eingebautes Fallback-Icon.

## Widgets

Diese Version enthaelt diese Widgets:

- Datum
- Uhrzeit
- Wetter per Open-Meteo ohne API-Key
- Offene Google-Suchleiste als Startseiten-Widget
- Mehrere Notizen
- Optionale Linkstatistik
- Optionale Statusuebersicht
- Link-Statusanzeigen, wenn ein Link ein Status-Widget aktiviert hat

## Einstellungen

Im Browser-Menue `Einstellungen` kannst du Titel und Untertitel pflegen und Anzeigeoptionen umschalten:

- Kategorie-Zahlen anzeigen
- Freigabe-Modus aktivieren
- Uebersicht-Widget anzeigen
- Status-Widget anzeigen
- Wetter-Widget anzeigen
- Google-Suche anzeigen
- Status an Linkkarten anzeigen
- Notizenbereich anzeigen
- Links in neuem Tab oeffnen

Kategorien koennen im Kategorien-Dialog neben dem Namen auch ein Icon und eine Farbe bekommen. Die Startseite nutzt diese Farbe dezent fuer Gruppentitel und Linkkarten.

Das Wetter-Widget nutzt Open-Meteo. Dafuer brauchst du nur einen Anzeigenamen sowie Breiten- und Laengengrad des Standorts.

## Status Widgets

Statusanzeigen werden direkt am Link gepflegt:

- Link bearbeiten oder neu erstellen
- `Status-Widget an diesem Link` aktivieren
- Typ auswaehlen
- Die passenden Zugangsdaten eintragen

Wenn die Status-URL leer bleibt, nutzt Homebase die normale Link-URL. Dadurch kannst du mehrere Server vom gleichen Typ als eigene Links mit eigenen Widgets pflegen.

Proxmox mit API-Token:

- Widget: `Proxmox`
- Token-ID: zum Beispiel `root@pam!homebase`
- Token-Secret: dein Proxmox API-Token

Ohne Proxmox-Token prueft Homebase nur die API-Erreichbarkeit. Mit Token zeigt es zusaetzlich Nodes, laufende VM/CT, offene Updates und RAM-Nutzung an. Die genaue APT-Update-Liste braucht in Proxmox `Sys.Modify`; falls dein Token nur `Sys.Audit` hat, nutzt Homebase automatisch die Proxmox-Paketversionen als lesbaren Fallback und zeigt die Zahl mit `+`, zum Beispiel `4+`. Unraid nutzt einen API-Key fuer `/graphql`; AMP nutzt Benutzername und Passwort fuer `Core/Login` und `Core/GetStatus`.

Home Assistant:

- Widget: `Home Assistant`
- Status-URL: deine Home-Assistant-URL, zum Beispiel `http://homeassistant.local:8123`
- API-Key / Long-Lived Token: in Home Assistant unter Profil -> Sicherheit -> Long-Lived Access Tokens erstellen
- HA Schalter: Entity-IDs fuer kleine Buttons, zum Beispiel `switch.steckdose, light.schreibtisch`

Homebase liest damit `/api/`, `/api/config` und `/api/states` und zeigt Version, Entities sowie deine konfigurierten Schalter an. Button-Klicks laufen ueber den Homebase-Server, der Token wird also nicht an den Browser ausgegeben.

Die Suche auf der Startseite kann ausserdem direkt Google oeffnen: Suchbegriff eingeben und `Enter` druecken. In der Befehlspalette (`Cmd/Ctrl + K`) erscheint bei Suchtext ebenfalls ein Google-Treffer.

Status-Zugangsdaten werden in `homebase.json` gespeichert und sind damit auch im JSON-Export enthalten. Wenn du Secrets lieber ausschliesslich als Container-Environment halten willst, funktioniert `HOMEBASE_STATUS_TARGETS` weiterhin als Fallback:

```text
HOMEBASE_STATUS_TARGETS=[{"type":"proxmox","name":"Proxmox","url":"https://<proxmox-ip>:8006","tokenId":"root@pam!homebase","tokenSecret":"dein-token-secret"}]
```

## Updates

Lokales Update:

```bash
git pull
docker compose pull
docker compose up -d
```

Portainer Update:

1. Stack oeffnen.
2. `Pull latest image/redeploy` oder `Update the stack` ausfuehren.
3. Bei Git-Stacks sicherstellen, dass Branch `main` und Compose path `docker-compose.yml` weiterhin stimmen.

Das Daten-Volume bleibt bei normalen Updates erhalten. Loesche das Volume nur, wenn du bewusst alle Homebase-Daten entfernen willst.

Nach dem Update:

- `http://<server-ip>:<port>/api/health` sollte `{"ok":true}` liefern.
- Startseite im Browser neu laden.
- Backup und Restore testen, wenn Datenmigrationen erwartet werden.

## Bedienung im Browser

- `+ Link` legt neue Links an.
- `...` an einem Link bearbeitet oder loescht ihn.
- `+ Profil` erstellt ein weiteres Profil.
- `Demo-Profil` erstellt Testdaten ohne private Links oder Zugangsdaten.
- `Cmd+K` oder `Ctrl+K` oeffnet die schnelle Suche.
- `Einstellungen` aendert Titel, Untertitel, Anzeigeoptionen, Widget-Galerie, Kategorien, Import, Backup und Restore.

Kategorien und Links werden alphabetisch angezeigt. Linkkarten zeigen Titel, Favicon und optionale Notiz; die URL bleibt als Klickziel hinterlegt, wird aber nicht extra angezeigt.

Die lokale Suche ist immer sichtbar. In der Kachelansicht sind Symbole und Titel groesser dargestellt.

Bei gemeinsamer Nutzung werden Aenderungen anhand des zuletzt geladenen Standes zusammengefuehrt. Unabhaengige Bearbeitungen bleiben erhalten. Wurde derselbe Wert bereits anders geaendert oder der bearbeitete Eintrag geloescht, wird das Speichern gestoppt und die aktuelle Seite geladen. Geoeffnete Formulare werden nicht durch die automatische Aktualisierung alle zehn Sekunden ersetzt. Nach diesem Update muessen bereits offene Browserseiten einmal neu geladen werden.

Favicons werden pro Seiten-URL gespeichert und hoechstens einmal in 24 Stunden neu geladen. Auch fehlgeschlagene Abrufe werden einen Tag zwischengespeichert; ein vorhandenes Icon bleibt bei Fehlern erhalten. Gleichzeitige Abrufe derselben URL werden zusammengefasst. Auch dauerhaft offene Seiten aktualisieren ihre Icons nur taeglich.

Der laufende Server aktualisiert die Favicons aller Profile auch ohne geoeffneten Browser. Er prueft nach dem Start und stuendlich auf abgelaufene Cache-Eintraege; nur mindestens 24 Stunden alte Icons werden neu abgerufen, nacheinander statt alle gleichzeitig. Der Docker-Container muss dafuer laufen.

`npm test` prueft paralleles Speichern, geloeschte Eintraege, Konflikte und Favicon-Aktualisierungen mit isolierten lokalen Testservern.
