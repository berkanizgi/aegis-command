# Technik, Sicherheitsgrenzen und Prüfung

## Aufbau

```text
React/TypeScript + Canvas-Kern
  → isolierte Electron-Preload-Brücke
    → lokaler Dienst: Zustand, Werkzeuge, Planung, Freigaben, Scheduler
      → OpenAI Responses / Realtime oder lokales Ollama
      → Workspace und lokale Notizen
      → direkte Connector-APIs
      → isolierter sichtbarer Browser Operator
```

Renderer hat kein Node.js; Context Isolation und Chromium-Sandbox sind eingeschaltet. Nur das vertrauenswürdige App-Fenster darf IPC verwenden. Der Browser Operator hat einen separaten persistenten Browserbereich, keinen Preload-Zugriff und keine Downloads/Medienberechtigungen. Seiteninhalte können trotzdem fehlerhaft oder bösartig sein; Freigaben genau prüfen.

## Freigaben

Werkzeuge werden serverseitig validiert. Externe Änderungen, Dateiöffnen/-schreiben, Browsernavigation/Klicks/Eingaben und die Einrichtung einer Routine über KI werden zu einer konkreten Freigabe-Mission. Lokale Notizen, Zusagen, Lesen und Fokus können sofort ausgeführt werden. Die Freigabe ist an Argumente sowie relevante Workspace-/Verbindungskonfiguration gebunden. Ein anderer Zielordner oder andere Zugangsdaten machen alte Freigaben ungültig.

Bei laufenden Missionen wird eine Sperre pro ID verwendet. Unklare oder fehlgeschlagene Schreibaktionen werden nicht automatisch wiederholt. Nach Neustart werden unterbrochene Schritte als unklar/fehlgeschlagen markiert. Änderungen außerhalb Aegis bleiben bei Missionslöschung bestehen. Erfolgreiches API-Schreiben bedeutet noch nicht immer bestätigten Endzustand; `verified: false` und die Erklärung werden im Ergebnis angezeigt.

Browseraktionen prüfen aktuelle Referenz, URL, Label, Typ und Linkziel. Nach einer Aktion werden Referenzen verworfen. Es gibt keine Garantie gegen alle Änderungen einer fremden dynamischen Website. Kritische und sicherheitsrelevante Abläufe selbst ausführen. Die KI erhält keine allgemeine Shell und darf ihre eigene Freigabe nicht erteilen.

## Daten

Normaler Desktop-Datenort: Electron `app.getPath('userData')/data/state.json`, unter Windows üblicherweise im Roaming-AppData-Ordner für Aegis. `AEGIS_DATA_DIR` kann den App-Datenort überschreiben. Browsercookies liegen separat im Browserprofil. Das Repository enthält keine persönlichen App-Daten.

Bei verfügbarer OS-Verschlüsselung ist `state.json` ein verschlüsselter v2-Umschlag; Schlüssel werden zusätzlich einzeln über `safeStorage` verschlüsselt. Speichern erfolgt serialisiert über temporäre Datei und Rename. Ein nicht entschlüsselbarer Datenbestand wird nicht still überschrieben. Ohne OS-Schutz: v1-Zustand als Klartext, Schlüssel ausschließlich in der laufenden Sitzung. Backups nur nach vollständigem Beenden der App anlegen; Verschlüsselung ist an das Benutzerkonto gebunden und ersetzt kein allgemeines Backup-Konzept.

Ausgeschlossene Workspace-Pfade: unter anderem `.git`, `node_modules`, `.env`, `.ssh`, gängige Credential-Dateien und Symlinks/Junctions. Es wird nicht garantiert, dass jede beliebig benannte Datei frei von Geheimnissen ist. Einen eng begrenzten Ordner wählen. Dateisuche: maximal 2.000 Einträge, Tiefe 7 und 50 Treffer; direkte Textdateien bis 512 KB. Keine Volltext-Suchmaschine für beliebige Binärformate.

Shadow-Modus bleibt nach Neustart aus. Er speichert Fenstertitel, nicht den Inhalt der Fenster. Titel mit offensichtlichen Passwortmanager-/Privatmodus-Begriffen werden übersprungen; dieser Namensfilter ist kein vollständiger Datenschutzfilter. Sensible Programme während einer Shadow-Sitzung nicht öffnen.

## Testumfang

`npm test` prüft lokal und mit gemockten Providerantworten:

- leeren Erststart, Persistenz, Verschlüsselungsumschlag, Session-only-Secrets;
- Grenzen der Werkzeuge, Workspace-Traversal, Junctions und Skriptstart-Sperre;
- exakte Freigaben, Workspace-Wechsel, kein Überschreiben oder doppeltes Ausführen;
- Report-Readback, wiederherstellbares Undo, Erhalt nachträglicher Benutzeränderungen;
- unterbrochene Schreibaktionen nach Neustart, Routinefreigaben und Deduplizierung;
- Responses-Werkzeugschleife und Anfrage-Limit, Realtime-SDP-Konfiguration;
- Connectorstatus, HTTP-Fehler, Google PKCE/State, Microsoft Device Flow, Token-Refresh;
- Entwurf statt Mailversand, Datums-/Header-Validierung, Home-Assistant-Grenzen, Webquellen.

`npm run test:desktop` startet eine frische Electron-Testinstanz mit isoliertem Datenordner und bedient UI/IPC. Es prüft Gedächtnis, Chat/Fokus, Mission/Approval/Undo, Einstellungen, Navigation und Browser Operator. Screenshots enthalten nur leeren Erststart beziehungsweise ausdrücklich erzeugte Testdaten. Keine echten Konten oder Mikrofonaufnahmen erforderlich.

Im eingeschränkten Build-Konto kann Chromium seine Sandbox nicht starten und Windows-Kryptografie nicht initialisieren. Ausschließlich für diesen Test lässt sich `AEGIS_TEST_RESTRICTED=1` setzen; dann startet das Testskript Electron mit `--no-sandbox --disable-gpu`. **Die ausgelieferte App deaktiviert ihre Sandbox nicht.** Ein vollständiger Start unter dem normalen Benutzerkonto sowie echte OS-Schlüssel-Persistenz und Live-Konto-/Audioaufrufe sind dadurch nicht bewiesen. Die Logik der Verschlüsselung wird mit einem Testadapter geprüft.

Vor echtem produktivem Einsatz: im normalen Windows-Konto starten, Schutzstatus prüfen, API-Verbindung testen, kurze Sprachsitzung ausprobieren und jede gewünschte Integration mit einem unkritischen Leseauftrag testen. Erst danach Schreibaktionen in Testdateien/-konten freigeben. Keine Behauptung eines unabhängigen Security-Audits oder vollständiger Produktionshärtung.

`npm run test:portable` prüft zusätzlich die wirklich selbstentpackende EXE über einen temporären lokalen Debug-Port mit einem frischen Testprofil. Dabei wird auch die IPC-Verbindung nach Expansion verkürzter Windows-Temp-Pfade geprüft. Der Debug-Port wird nur vom Testskript aktiviert, nicht im normalen App-Start. Alle Tests unterdrücken geerbte OpenAI-Schlüssel, damit sie keine echten API-Aufrufe auslösen.
