# HarborDash

Dein persönlicher Heimathafen für Links, Profile und Widgets. Auf Basis von
[Homebase](https://github.com/sandavdesigns/homebase), mit verpflichtendem Login
und gemerkten Geräten für die tägliche Nutzung als Browser-Startseite.

## So funktioniert der Zugang

- Ein Besitzer, ein starkes Server-Passwort. Keine öffentliche Registrierung.
- **Dieses Gerät merken**: standardmäßig 180 Tage angemeldet, auch nach Browser-
  und Container-Neustarts oder einem Wechsel des Netzwerks. Danach erneut anmelden.
- Ohne Häkchen: Browser-Sitzung mit maximal zwölf Stunden Gültigkeit. Manche Browser
  stellen Sitzungscookies beim Wiederherstellen alter Fenster wieder her; an fremden
  Geräten deshalb ausdrücklich abmelden.
- Unter **Einstellungen → Angemeldete Geräte verwalten** einzelne oder alle anderen
  Geräte abmelden. Offene Dashboards sperren sich beim nächsten aktiven Prüfintervall
  (zehn Sekunden); API-Zugriff wird sofort verweigert.
- Ändern von ADMIN_PASSWORD und anschließender Neustart melden alle Geräte ab.
- Ohne ausreichend langes Passwort startet der Server nicht. IP-Adressen und
  X-Forwarded-For erlauben niemals den Login zu umgehen.

Zufällige 256-Bit-Sitzungstokens werden ausschließlich in HttpOnly-/Secure-/SameSite-
Cookies gehalten. Auf dem Server liegen nur Token-Hashes im Datenvolume. Authentifizierung
und Sicherheitseinstellungen sind nicht Bestandteil des Dashboard-JSON-Imports.
Grundlage für die Cookie-Einstellungen: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Portainer + Nginx Proxy Manager

Für **Docker Standalone / Compose Stacks**. Diese Datei ist kein Docker-Swarm-Stack.

1. In Portainer **Stacks → Add stack → Repository** wählen:
   - Repository URL: https://github.com/wetterhahn/harbordash
   - Repository reference: refs/heads/main
   - Compose path: docker-compose.yml
2. Die folgenden Environment-Variablen im Stack setzen:

| Variable | Wert |
| --- | --- |
| ADMIN_PASSWORD | Eigenes zufälliges Passwort, mindestens 16 Zeichen |
| APP_ORIGIN | https://dash.wetterhahn.com |
| DASH_PORT | 3000 oder ein freier Port deines Docker-Hosts |
| SESSION_DAYS | 180 |
| DASH_VOLUME_NAME | harbordash_data |

3. Stack deployen. Das Image ist ghcr.io/wetterhahn/harbordash:latest und wird
   durch GitHub Actions für amd64 und arm64 gebaut. Der erste Build muss vor dem
   Deployment abgeschlossen sein. Falls GHCR das Paket noch als privat führt:
   GitHub → Profil → Packages → harbordash → Package settings → Change visibility
   → Public. Ein öffentliches Repository garantiert allein kein öffentliches Paket.
4. Im DNS dash.wetterhahn.com auf deinen bestehenden NPM-Zugang zeigen lassen.
5. In Nginx Proxy Manager einen **Proxy Host** anlegen:
   - Domain Names: dash.wetterhahn.com
   - Scheme: **http** (Verbindung NPM → Dashboard)
   - Forward Hostname / IP: LAN-IP deines Docker-Hosts
   - Forward Port: Wert aus DASH_PORT, standardmäßig **3000**
   - Cache Assets: **aus**
   - SSL: Let's-Encrypt-Zertifikat anfordern, **Force SSL** einschalten.
6. https://dash.wetterhahn.com öffnen, anmelden, Gerät merken und Dashboard einrichten.
   Diese HTTPS-Adresse als Browser-Startseite verwenden, auch im Heimnetz.

Am Router nur die vorhandenen NPM-Ports weiterleiten. **Port 3000 nicht ins Internet
weiterleiten.** Der interne HTTP-Port ist für NPM gedacht; der Browserzugang erfolgt
über HTTPS, damit die Secure-Cookies funktionieren. APP_ORIGIN muss exakt zur
Browseradresse passen (Schema, Host und gegebenenfalls Port). NPM benötigt keine
eigene Basic-Auth-Abfrage für HarborDash.

Wenn NPM als Container im selben Docker-Netz läuft, kann alternativ intern der
Dienstname harbordash und Port 3000 verwendet und die ports-Veröffentlichung
entfernt werden. Dazu beide Dienste demselben externen Docker-Netz hinzufügen.
Bei NPM auf einem anderen Host DASH_BIND_IP auf die LAN-IP des Dashboard-Hosts
setzen und den Zugriff per Firewall auf den NPM-Host begrenzen.

## Betrieb und Updates

Alle persistenten Daten liegen in einem Volume unter /data:

- homebase.json: kompatible Dashboard-Konfiguration einschließlich Integrations-Secrets
- favicons/ und background/: Bilder und Cache
- sessions.json und auth-salt: Geräte-Sitzungen und Passwort-Prüfwert

Volume-Backups vertraulich behandeln. Ein Dashboard-JSON-Export enthält auch die
konfigurierten Integrations-Zugangsdaten, aber keine Geräte-Sitzungen.
Ein Backup von sessions.json kann frühere Sitzungen wiederherstellen. Nach einer
Wiederherstellung bei Bedarf das Passwort ändern und den Container neu starten.

Updates: In Portainer neues Image pullen und Stack neu deployen. Das Volume und
ADMIN_PASSWORD beibehalten; dann bleiben die Geräte angemeldet. Nicht das Volume löschen.
Für feste Versionen HARBORDASH_IMAGE auf einen sha-Tag aus GHCR setzen.

Passwort vergessen: ADMIN_PASSWORD in Portainer ändern und neu deployen.
Zum Widerruf aller Sitzungen kann alternativ bei gestopptem Container sessions.json
im Volume gelöscht werden. Die Dashboard-Konfiguration bleibt erhalten.

## Vorhandene Homebase-Daten übernehmen

Dashboard-JSON aus Homebase exportieren und in HarborDash nach dem Login importieren.
Für Bilder und Cache alternativ bei gestoppten Containern ein Backup des bestehenden
Volumes anlegen und dessen **Kopie** als DASH_VOLUME_NAME verwenden. Bereits bestehende
Volumes müssen für Container-Benutzer UID/GID **1000:1000** schreibbar sein. Neue
benannte Volumes erhalten die richtigen Rechte automatisch. Die bisherige IP-Allowlist
wird entfernt: Auch im Heimnetz ist eine Geräte-Anmeldung nötig.

## Weitere Konfiguration

| Variable | Standard / Bedeutung |
| --- | --- |
| HARBORDASH_IMAGE | ghcr.io/wetterhahn/harbordash:latest |
| DASH_BIND_IP | 0.0.0.0, Host-Adresse für den NPM-Zugang |
| SESSION_DAYS | 180; gültig sind ganze Zahlen von 1 bis 365 |
| HOMEBASE_STATUS_TARGETS | [] oder vorhandenes JSON mit Statusintegrationen |
| ADMIN_PASSWORD_FILE | Optional im Container: Passwort aus eingebundener Secret-Datei lesen; hat Vorrang vor ADMIN_PASSWORD |

Die Compose-Datei nutzt ADMIN_PASSWORD als Portainer-Variable. Für ADMIN_PASSWORD_FILE
die Compose-Datei entsprechend auf einen Secret-Mount umstellen. Keine echten Secrets
in Git speichern. Zur Browser-Nutzung reichen die Stack-Variablen; keine OAuth- oder
Mail-Konfiguration nötig.

## Lokal entwickeln und testen

Node.js 20 oder neuer, keine zusätzlichen npm-Pakete nötig:

~~~powershell
$env:ADMIN_PASSWORD='local-development-password'
$env:ALLOW_INSECURE_HTTP='true'
$env:DATA_DIR='./data'
node server.js
~~~

Unter http://localhost:3000 testen. ALLOW_INSECURE_HTTP niemals für den öffentlichen
Zugang verwenden; die Portainer-Datei aktiviert diesen Entwicklungsmodus nicht.

~~~sh
node --test tests/*.test.js
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
~~~

Die Tests prüfen Zugriffsschutz ab dem ersten Start, Cookies, Neustart-Persistenz,
Sitzungsablauf, Gerätewiderruf, Passwortwechsel, CSRF-Prüfungen, Login-Drosselung,
parallele Dashboard-Änderungen und Favicon-Aktualisierung. Zehn Fehlversuche pro
Socket-Gegenstelle sperren weitere Versuche bis zum Ende des 15-Minuten-Fensters.
Hinter NPM teilen sich Browser dieses Limit; Forwarded-Header werden absichtlich
nicht vertraut. Bestehende Sitzungen sind davon nicht betroffen.

Der Container läuft als Benutzer node, mit schreibgeschütztem Root-Dateisystem,
ohne Linux-Capabilities und mit Healthcheck. Nur /data und temporärer Speicher sind
schreibbar. /api/health ist bewusst öffentlich und gibt nur {"ok":true} aus.

## Dashboard-Funktionen und Herkunft

Die Homebase-Funktionen bleiben enthalten: Profile, Kategorien, Suchpalette, Themes,
Notizen, Wetter, Hintergrundbilder, Bookmark-/Homarr-Import, JSON-Backup und Status-
Widgets für unter anderem Proxmox, Unraid, AMP und Home Assistant.

Details zu den übernommenen Funktionen: [Homebase-Referenz](docs/HOMEBASE-REFERENCE.md).
Diese archivierte Referenz beschreibt das Original; für Login, Deployment und
Sicherheit gelten ausschließlich die Hinweise in dieser README.

Die Anmeldung schützt das Dashboard. Links zu ausschließlich intern erreichbaren
Diensten benötigen unterwegs weiterhin VPN oder einen eigenen externen Zugang.
Homebase-Integrationen übernehmen teilweise die bisherige Behandlung interner
selbstsignierter Zertifikate; dieser Fork ist kein vollständiges Audit aller Integrationen.

[Herkunft und Lizenzhinweis](UPSTREAM.md)
