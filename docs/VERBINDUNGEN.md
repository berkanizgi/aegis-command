# Verbindungen einrichten

Nur die Dienste verbinden, die du tatsächlich brauchst. Es gibt keine eingebauten Konten, globalen OAuth-Secrets oder Anmeldung über dein Codex-Konto. Aegis nutzt diese APIs direkt; Codex-Plugins werden nicht automatisch übernommen.

## OpenAI

Eigenen Schlüssel unter [API Keys](https://platform.openai.com/api-keys) erstellen, API-Abrechnung aktivieren und in Aegis → Einstellungen speichern. Danach „KI-Verbindung testen“; dieser Test macht einen kleinen kostenpflichtigen API-Aufruf. Ein gespeicherter Schlüssel bedeutet zunächst „konfiguriert“, nicht „live erfolgreich getestet“. Fehler zu Guthaben, Modellen, Netzwerk und Limits erscheinen in der App. Zum Wechseln neuen Schlüssel speichern; „Schlüssel entfernen“ löscht ihn aus dem Aegis-Schlüsselspeicher.

Das Mikrofon wird nur nach Aktivierung geöffnet. Mikrofonzugriff für Desktop-Apps muss in Windows erlaubt sein. Erneuter Klick oder Escape beendet die Verbindung. Bei Netzwerkabbruch erneut verbinden. Betriebssystemstimme für normale Textantworten ist getrennt von der Realtime-KI-Stimme.

## GitHub

1. In [GitHub Token Settings](https://github.com/settings/tokens?type=beta) einen Fine-grained Personal Access Token für die gewünschten Repositories erstellen.
2. Metadata lesen und Issues lesen erlauben; für Issue-Erstellung Issues schreiben erlauben. Keine pauschalen Account-Adminrechte erforderlich.
3. Aegis → Einstellungen → GitHub: Token speichern, „Testen“ wählen.

Aegis kann zugängliche Repositories und Issues/PR-Einträge auflisten und nach Freigabe Issues erstellen. PRs werden nicht gemergt und Repository-Dateien nicht verändert. Der Test bestätigt die Identität, nicht jede einzelne Repository-Berechtigung; einzelne APIs können weiterhin 403 liefern.

## Google Workspace

1. Eigenes Projekt in [Google Cloud](https://console.cloud.google.com/) verwenden. Gmail API, Google Calendar API und Google Drive API aktivieren.
2. OAuth-Zustimmungsbildschirm konfigurieren. Im Testmodus dein Google-Konto als Testnutzer hinzufügen. Workspace-Organisationen können Administratorfreigabe erfordern.
3. OAuth Client ID vom Typ **Desktop-App** anlegen. Client ID und Client Secret in Aegis speichern.
4. „Anmelden“ wählen und die angezeigten Berechtigungen im Browser prüfen. Der Rückweg führt einmalig zu einem zufälligen Loopback-Port auf `127.0.0.1`; Aegis prüft State und PKCE.

Angefragte Scopes: `openid`, `email`, `gmail.readonly`, `gmail.compose`, `calendar.events`, `drive.readonly`. Diese Provider-Berechtigungen sind teilweise weiter als die tatsächlich angebotenen Werkzeuge. Die App versendet keine E-Mail und erstellt keine Termine mit eingeladenen Teilnehmern. Drive-Lesen unterstützt Google Docs und `text/plain`, keine universelle Office-/PDF-Extraktion. Für eine öffentliche Verteilung an weitere Nutzer können zusätzliche Google-Verifizierungen erforderlich sein; dieser Build ist eine persönliche App.

## Microsoft 365

1. In [Microsoft Entra](https://entra.microsoft.com/) eine App registrieren; den passenden Account-Typ für dein persönliches oder Organisationskonto wählen.
2. Öffentliche Client-Flows / Device Code Flow aktivieren. Je nach Organisation müssen delegierte Graph-Berechtigungen administrativ genehmigt werden.
3. Application (Client) ID in Aegis speichern, Tenant ID als deine Tenant-ID oder passend zur Registrierung `common`, `organizations` oder `consumers`.
4. „Anmelden“: Auf der Microsoft-Seite den sichtbaren Code eingeben. Aegis prüft den Status bis zur Bestätigung oder zum Ablauf. Kein Client Secret in dieser Geräteanmeldung nötig.

Angefragte delegierte Scopes: `openid profile offline_access User.Read Mail.ReadWrite Calendars.ReadWrite Tasks.ReadWrite`. `Mail.Send` wird nicht angefragt. Outlook-Nachrichten lesen, Entwürfe erstellen, persönliche Termine sowie To-Do-Listen/Aufgaben verwenden. Lesen/Schreiben bezieht sich auf das angemeldete Konto, nicht automatisch alle Team-/SharePoint-Daten.

## Home Assistant

In deinem Home-Assistant-Profil einen Long-lived Access Token erstellen. URL und Token in Aegis speichern und testen. HTTP ist nur für ausdrücklich konfigurierte lokale Adressen erlaubt; für externe Hosts HTTPS verwenden. Bei Änderung der Server-URL ist ein neuer Token erforderlich.

Unterstützt: Zustände lesen, ein konkretes Licht oder einen Schalter an/aus, Szene aktivieren, Lichthelligkeit. Jede Steueraktion braucht Freigabe. Bei Szenen wird die Annahme bestätigt; die einzelnen Geräte einer Szene werden nicht separat verifiziert. Auch ein `switch` kann reale Geräte schalten: immer den tatsächlichen Zielgegenstand prüfen.

## Web-Recherche

Eigenen Schlüssel in [Tavily](https://app.tavily.com/) erstellen, in Aegis unter Web-Recherche speichern und testen. Der Test verbraucht einen Such-Credit. Suchergebnisse enthalten Titel, Quellenlink und Auszug. Keine umgangene Paywall, keine Garantie vollständiger oder richtiger Informationen.

## Trennen und Aufbewahrung

„Trennen“ entfernt die Zugangsdaten dieses Connectors aus Aegis und beendet noch offene Anmeldevorgänge. Es widerruft das Token nicht automatisch beim Anbieter und entfernt keine zuvor gelesenen Inhalte aus Missionen/Chat. Für einen vollständigen Widerruf auch die App-/Token-Verwaltung des jeweiligen Anbieters verwenden. Lokale Erinnerungen und Missionen können in Aegis gelöscht werden.
