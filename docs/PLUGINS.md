# Aegis 0.6.0 · Plugin Control

Aegis kann den offiziellen Codex-/ChatGPT-Plugin-Katalog verwenden. Es kopiert keine Passwörter oder rohen OAuth-Tokens in den eigenen Zustand. Installation und Kontoanmeldung laufen über die offiziellen Dialoge des jeweiligen Anbieters; Aegis liest danach nur den vom Codex-App-Server gemeldeten Status.

## Privates Hotmail verbinden

1. Aegis über das Tray-Menü vollständig beenden und Version 0.6.0 starten.
2. **Control Panel → Plugins** öffnen.
3. Falls angezeigt, **ChatGPT anmelden** wählen und die offizielle Geräteanmeldung abschließen.
4. Falls Outlook noch nicht in ChatGPT verbunden ist: **Outlook Email → Verbindung einrichten** wählen. Ein bereits verbundenes Konto nicht erneut registrieren.
5. Im geöffneten ChatGPT-/Microsoft-Dialog die private `@hotmail.com`-, `@outlook.com`- oder `@live.com`-Adresse verbinden und die angezeigten Rechte selbst prüfen.
6. Zu Aegis zurückkehren. Der Status aktualisiert sich beim Fensterfokus oder über **Status prüfen**. **Verbindung testen** liest zusätzlich nur das Outlook-Kontoprofil und zeigt die bestätigte Postfachadresse. Die ChatGPT-Adresse in der Kopfleiste kann von dieser Adresse abweichen.
7. **Postfach öffnen** wählen oder sagen: „Fass meine wichtigsten neuen Hotmail-Mails zusammen.“

Dieser Weg braucht keine eigene Azure-Appregistrierung. Er setzt eine installierte Codex-Desktop-Laufzeit und dasselbe ChatGPT-Konto mit aktiviertem Outlook-Plugin voraus. ChatGPT im Browser und die Codex-Laufzeit können unterschiedlich angemeldet sein. Der direkte Microsoft-Graph-Eintrag unter Einstellungen darf unkonfiguriert bleiben, wenn das Plugin funktioniert.

Bei HTTP 403 zeigt Aegis keine HTML-/CSS-Fehlerseite mehr. Ein fehlgeschlagener Teilabruf löscht auch nicht mehr den erfolgreichen Anmeldestatus. `ZUGRIFF NICHT BESTÄTIGT` ist ein ungeklärter Zustand, kein Beweis für ein getrenntes Hotmail-Konto. Konto in Codex prüfen, Codex aktualisieren und die Verbindung erneut testen; keine Azure-Registrierung und keine Umgehung einer Anbietersperre. Das Öffnen eines Anmeldedialogs wird niemals als erfolgreiche Installation gemeldet.

## Postfach und Antwortablauf

Oben zeigt Inbox Intelligence ein Tageslagebild mit Anzahl, ungelesenen Nachrichten, Aufmerksamkeitssignalen und den wichtigsten Betreffzeilen. Darunter ist der geladene Posteingang scrollbar. Jede Karte zeigt Absender, Betreff, Zeitpunkt, Vorschau und die Gründe für ihre lokale Einstufung. Rot oder Gelb ist eine Heuristik, kein Beweis objektiver Wichtigkeit.

Für Antworten gilt eine feste Sicherheitskette:

1. Nachricht öffnen und **Antwort vorbereiten** wählen oder per Stimme den eindeutigen Betreff nennen.
2. Nur die gewünschte Aussage diktieren; Aegis formuliert einen lokalen Entwurf.
3. Text lesen und bei Bedarf direkt bearbeiten.
4. **Als Outlook-Entwurf speichern** wählen. Das erzeugt genau einen Entwurf zur ausgewählten Nachricht.
5. **In Outlook öffnen** und dort selbst auf **Senden** drücken.

Aegis hat für diesen Ablauf keinen Senden-Button. Die Plugin-Brücke führt keinen autonomen KI-Agenten mehr aus. Eine feste Allowlist erlaubt nur Kontoprofil, Nachrichtenliste, Nachrichtensuche und den ausdrücklich per UI beauftragten Antwortentwurf. Der geprüfte Text und die exakte Nachrichten-ID werden direkt übergeben, mit `reply_all=false`. Das Ergebnis muss eine Entwurfs-ID und `isDraft=true` enthalten. Doppelklicks werden gesperrt; bei unklarem Ausgang erfolgt kein automatischer Wiederholungsversuch. Beim direkten Microsoft-Graph-Fallback wird `Mail.Send` nicht angefordert.

## Weitere nützliche Plugins

Die Startauswahl priorisiert fertige Erweiterungen, die zu einem persönlichen Command OS passen:

- Outlook Calendar, Google Calendar und Todoist für Tagesplanung und Aufgaben;
- Gmail für alternative Postfächer;
- Google Drive, Dropbox und Notion für Wissen und Dokumente;
- GitHub für Entwicklungsarbeit;
- Trello und Asana für Projektsteuerung;
- Spotify für Mediensteuerung und Canva für kreative Abläufe.

Über die Suche bleibt der lokal gecachte offizielle Katalog auffindbar. Weitere Plugins im Katalog sind **nicht automatisch als Aegis-Sprachwerkzeuge eingebunden**. Die Installation einer ChatGPT-Erweiterung überträgt nicht beliebige Funktionen in eine eigenständige API-App. In diesem Update wurde der Outlook-Pfad implementiert; die bestehenden direkten Integrationen bleiben erhalten. Senden, Kaufen, Löschen oder Veröffentlichen darf nicht als stillschweigende Vollmacht behandelt werden.

## Technik und Datenschutz

Die Brücke startet lokal den [Codex App Server](https://learn.chatgpt.com/docs/app-server) über JSON-RPC. `account/read` und `app/installed` werden unabhängig geprüft; der störanfällige `app/list`-Katalogabruf ist kein Teil der Verbindungskette mehr. `mcpServerStatus/list` entdeckt die Laufzeitwerkzeuge, `mcpServer/tool/call` ruft ausschließlich die erlaubten Outlook-Funktionen auf. Es gibt keinen `turn/start`-Modellaufruf. Die unter Entwicklung stehende `plugin/install`-Schnittstelle wird nicht als Produktionsinstaller benutzt. Externe Mailinhalte bleiben unvertrauenswürdige Daten.

## App per Sprache steuern

- „Öffne die Einstellungen“ / „Gehe zu Plugins“ / „Zeig mir die Missionen“: sichtbare Navigation, erst nach UI-Bestätigung als erledigt gemeldet.
- „Prüfe meine Einstellungen“: aktueller lokaler Zustand ohne API-Schlüssel oder OAuth-Tokens.
- „Öffne Chrome“: fest freigegebener Programmstart; auch Edge, Editor und Rechner sind unterstützt. Kein beliebiger Shell-Befehl und keine automatische Kontrolle eines privaten Browserprofils.
- „Gespräch beenden“ / „Mikrofon aus“: Mikrofon und Sprachverbindung werden getrennt; kein automatisches Wiederverbinden. Escape bleibt verfügbar.
- Missionen, Gedächtnis und Workspace nutzen die vorhandenen Werkzeuge und Freigaben. Dateien außerhalb des gewählten Workspaces werden nicht pauschal freigegeben.

Der Postfachabruf über das Plugin kann zusätzlich zum Aegis-OpenAI-API-Verbrauch die Nutzungsgrenzen des angemeldeten ChatGPT-/Codex-Kontos berühren. Aegis zeigt deshalb keine erfundene Euro-Garantie. Kurze Abfragen, kleinere Mail-Limits und das bestehende Kostenwächter-Profil reduzieren unnötigen Kontext.
