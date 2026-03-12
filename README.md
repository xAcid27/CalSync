# Kalender Sync

Ein Thunderbird-Add-on zum automatischen Kopieren von Kalenderterminen zwischen zwei Kalendern – ohne Duplikate.

Entwickelt für die Synchronisation vom Exchange-Kalender (via TbSync/EAS) in einen CalDAV-Kalender (Horde Groupware / SabreDAV).

---

## Features

- **Duplikat-freie Synchronisation** – bereits übertragene Termine werden übersprungen
- **Auto-Sync** – konfigurierbarer Zeitplan (15 min bis 24 h), läuft im Hintergrund ohne geöffnetes Popup
- **Automatische Authentifizierung** – liest Zugangsdaten direkt aus dem Thunderbird-Passwort-Manager
- **Persistente Einstellungen** – Kalenderauswahl und Intervall bleiben nach Neustart erhalten
- **Manueller Sync** – jederzeit per Klick oder Tastenkürzel `Strg+Shift+Y` auslösbar
- **Sync-Reset** – Übertragungshistorie zurücksetzen, um alle Termine erneut zu kopieren

---

## Voraussetzungen

- Thunderbird **115.0 oder neuer**
- Ein Quellkalender vom Typ **storage** (z. B. TbSync/Exchange-Cache)
- Ein Zielkalender vom Typ **CalDAV** (z. B. Horde Groupware)
- Die CalDAV-Zugangsdaten müssen im Thunderbird-Passwort-Manager gespeichert sein (werden automatisch beim Einrichten des CalDAV-Kalenders in Thunderbird hinterlegt)

---

## Installation

1. Die aktuelle `.xpi`-Datei von der [Releases-Seite](../../releases) herunterladen
2. In Thunderbird: **Extras → Add-ons → Add-on aus Datei installieren**
3. Die `.xpi`-Datei auswählen und bestätigen

Da das Add-on eine Experiment-API verwendet, erscheint ein Hinweis auf „vollständigen Zugriff" – das ist für den Zugriff auf Kalender und Passwort-Manager erforderlich.

---

## Verwendung

1. Add-on über das Toolbar-Symbol oder `Strg+Shift+Y` öffnen
2. **Quellkalender** (Exchange/TbSync) und **Zielkalender** (CalDAV) auswählen
3. Optional: **Auto-Sync-Intervall** festlegen
4. **„Termine jetzt synchronisieren"** klicken

Die Kalenderauswahl und das Intervall werden automatisch gespeichert.

---

## Projektstruktur

```
kalender-sync-addon/
├── manifest.json          # Add-on-Manifest (Berechtigungen, Metadaten)
├── background.js          # Hintergrundskript (Auto-Sync via Alarms API)
├── popup/
│   ├── popup.html         # Benutzeroberfläche
│   └── popup.js           # Popup-Logik
├── api/
│   ├── schema.json        # Experiment-API-Schema
│   └── implementation.js  # Experiment-API-Implementierung (XPCOM)
└── icons/
    ├── icon48.png
    └── icon96.png
```

---

## Technische Hinweise

- Nutzt eine **Thunderbird Experiment API** für direkten Zugriff auf die Kalender-SQLite-Datenbank (`local.sqlite`) und den Passwort-Manager (`nsILoginManager`)
- Authentifizierung läuft über den gespeicherten Login mit `httpRealm: "Horde DAV Server"`
- Termine werden per **CalDAV PUT** mit manuell generiertem iCal (RFC 5545) übertragen, inklusive RFC-konformem Line-Folding für Kompatibilität mit SabreDAV 1.8
- Der Sync-State wird als JSON-Datei im Thunderbird-Profil gespeichert

---

## Changelog

### v2.0.0
- Automatische Authentifizierung über Thunderbird-Passwort-Manager
- Kalenderauswahl wird persistent gespeichert
- Auto-Sync-Intervall konfigurierbar (15 min – 24 h)
- Manuelles Credential-Formular entfernt

### v1.x
- Grundlegende Sync-Funktionalität
- Manuelle Credential-Eingabe
- iCal Line-Folding für SabreDAV-Kompatibilität
- RRULE-Unterstützung
