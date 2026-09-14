# Aegis 0.5.0 · Plugin Control

Aegis kann den offiziellen Codex-/ChatGPT-Plugin-Katalog verwenden. Es kopiert keine Passwörter oder rohen OAuth-Tokens in den eigenen Zustand. Installation und Kontoanmeldung laufen über die offiziellen Dialoge des jeweiligen Anbieters; Aegis liest danach nur den vom Codex-App-Server gemeldeten Status.

## Privates Hotmail verbinden

1. Aegis vollständig beenden und Version 0.5.0 starten.
2. **Control Panel → Plugins** öffnen.
3. Falls angezeigt, **ChatGPT anmelden** wählen und die offizielle Geräteanmeldung abschließen.
4. Auf der hervorgehobenen Karte **Outlook Email → Mit einem Klick einrichten** wählen.
5. Im geöffneten ChatGPT-/Microsoft-Dialog die private `@hotmail.com`-, `@outlook.com`- oder `@live.com`-Adresse verbinden und die angezeigten Rechte selbst prüfen.
6. Zu Aegis zurückkehren und **Status prüfen** wählen. Erst `KONTO VERBUNDEN` gilt als bestätigte Verbindung.
7. Im Live Desk **Postfach → Lagebild laden** wählen oder sagen: „Fass meine wichtigsten neuen Hotmail-Mails zusammen.“

Dieser Weg braucht keine eigene Azure-Appregistrierung. Er setzt jedoch eine installierte Codex-Desktop-Laufzeit, eine ChatGPT-Anmeldung und die Verfügbarkeit des Outlook-Email-Plugins für den angemeldeten Account/Plan voraus. Wenn die Laufzeit nicht antwortet, zeigt Aegis ehrlich `SAFE CACHE` und öffnet beim Einrichten den offiziellen App-Dialog. Das ist noch keine bestätigte Verbindung.

## Postfach und Antwortablauf

Oben zeigt Inbox Intelligence ein Tageslagebild mit Anzahl, ungelesenen Nachrichten, Aufmerksamkeitssignalen und den wichtigsten Betreffzeilen. Darunter ist der geladene Posteingang scrollbar. Jede Karte zeigt Absender, Betreff, Zeitpunkt, Vorschau und die Gründe für ihre lokale Einstufung. Rot oder Gelb ist eine Heuristik, kein Beweis objektiver Wichtigkeit.

Für Antworten gilt eine feste Sicherheitskette:

1. Nachricht öffnen und **Antwort vorbereiten** wählen oder per Stimme den eindeutigen Betreff nennen.
2. Nur die gewünschte Aussage diktieren; Aegis formuliert einen lokalen Entwurf.
3. Text lesen und bei Bedarf direkt bearbeiten.
4. **Als Outlook-Entwurf speichern** wählen. Das erzeugt genau einen Entwurf zur ausgewählten Nachricht.
5. **In Outlook öffnen** und dort selbst auf **Senden** drücken.

Aegis hat für diesen Ablauf keinen Senden-Button. Die Plugin-Brücke wird ausdrücklich angewiesen, niemals zu senden, weiterzuleiten, zu löschen, zu verschieben oder andere Nachrichten zu verändern. Beim direkten Microsoft-Graph-Fallback wird `Mail.Send` nicht angefordert und die API-Antwort zusätzlich auf `isDraft=true` geprüft.

## Weitere nützliche Plugins

Die Startauswahl priorisiert fertige Erweiterungen, die zu einem persönlichen Command OS passen:

- Outlook Calendar, Google Calendar und Todoist für Tagesplanung und Aufgaben;
- Gmail für alternative Postfächer;
- Google Drive, Dropbox und Notion für Wissen und Dokumente;
- GitHub für Entwicklungsarbeit;
- Trello und Asana für Projektsteuerung;
- Spotify für Mediensteuerung und Canva für kreative Abläufe.

Über die Suche bleibt der restliche offizielle Katalog auffindbar. „Einrichten“ bedeutet nicht automatisch „Aegis darf alles“: tatsächliche Funktionen hängen vom Plugin, Account, Plan und den beim Anbieter bestätigten Rechten ab. Senden, Kaufen, Löschen oder Veröffentlichen darf nicht als stillschweigende Vollmacht behandelt werden.

## Technik und Datenschutz

Die Brücke startet lokal den [Codex App Server](https://learn.chatgpt.com/docs/app-server) über JSON-RPC und verwendet dessen Plugin-, App- und Account-Schnittstellen. Ist er nicht erreichbar, wird ausschließlich der lokal vorhandene offizielle Katalogcache zur Anzeige benutzt; Zugang wird dann nicht behauptet. Externe Mailinhalte gelten als unvertrauenswürdige Daten und dürfen Aegis-Regeln nicht überschreiben.

Der Postfachabruf über das Plugin kann zusätzlich zum Aegis-OpenAI-API-Verbrauch die Nutzungsgrenzen des angemeldeten ChatGPT-/Codex-Kontos berühren. Aegis zeigt deshalb keine erfundene Euro-Garantie. Kurze Abfragen, kleinere Mail-Limits und das bestehende Kostenwächter-Profil reduzieren unnötigen Kontext.
