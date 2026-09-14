# Verbindungen einrichten

Nur die Dienste verbinden, die du tatsächlich brauchst. Es gibt keine eingebauten Konten oder globalen OAuth-Secrets. Aegis unterstützt direkte APIs und ab Version 0.5.1 zusätzlich den offiziellen Codex-/ChatGPT-Plugin-Katalog. Für privates Hotmail ist der Plugin-Weg empfohlen; Details stehen unter [Plugin Control](PLUGINS.md).

## OpenAI

Eigenen Schlüssel unter [API Keys](https://platform.openai.com/api-keys) erstellen, API-Abrechnung aktivieren und in Aegis → Einstellungen speichern. Danach „KI-Verbindung testen“; dieser Test macht einen kleinen kostenpflichtigen API-Aufruf. Ein gespeicherter Schlüssel bedeutet zunächst „konfiguriert“, nicht „live erfolgreich getestet“. Fehler zu Guthaben, Modellen, Netzwerk und Limits erscheinen in der App. Zum Wechseln neuen Schlüssel speichern; „Schlüssel entfernen“ löscht ihn aus dem Aegis-Schlüsselspeicher.

Ab Version 0.2.0 ist „Beim Öffnen begrüßen & zuhören“ standardmäßig an: Mit gespeichertem OpenAI-Zugang startet die Desktop-App beim Laden das Mikrofon und eine kostenpflichtige Realtime-Sitzung. Ohne Zugang oder mit anderem KI-Anbieter kein automatischer Sprachstart. Unter Einstellungen abschaltbar. Mikrofonzugriff für Desktop-Apps muss in Windows erlaubt sein. Der Sprachknopf oder Escape beendet die Verbindung; spätestens nach 15 Minuten wird sie automatisch beendet. Bei Abbruch oder Fehler gibt es keinen automatischen Neuversuch. Betriebssystemstimme für normale Textantworten ist getrennt von der Realtime-KI-Stimme. Der Chat bleibt verborgen, bis du „Chat anzeigen“ wählst.

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

## Microsoft 365 / privates Outlook und Hotmail

### Empfohlen: Outlook-Email-Plugin

Für eine normale private Hotmail-/Outlook.com-Adresse zuerst **Control Panel → Plugins → Outlook Email** verwenden. Die offizielle ChatGPT-/Microsoft-Anmeldung übernimmt die Verbindung; du brauchst dafür keine eigene Azure-Appregistrierung und kein Azure-Abo. Die genaue Klickfolge und der sichere Entwurfsablauf stehen in [PLUGINS.md](PLUGINS.md).

### Alternative für Entwickler: Microsoft Graph direkt

Der direkte Connector bleibt für eigene Deployments erhalten. Dieser persönliche Build enthält dafür keine vorregistrierte Microsoft-OAuth-App. Eine App-Registrierung und die spätere Anmeldung am Postfach sind **zwei verschiedene Schritte**. Ein Hotmail-Konto allein garantiert keinen Zugang zu einem Entra-Verwaltungsmandanten. Aegis kann fehlende Tenant-/Administratorrechte nicht selbst vergeben.

Falls du bewusst den direkten Graph-Weg statt des Plugins verwendest und das private Konto noch kein Azure-/Entra-Verzeichnis verwalten kann, zuerst ein [kostenloses Azure-Konto](https://azure.microsoft.com/free/) beziehungsweise ein eigenes Verzeichnis anlegen. Das ist die Entwickler-Einrichtung; dein normales Hotmail-Konto bleibt das Konto, das später per Gerätecode am Postfach angemeldet wird.

1. In einem Entra-Mandanten, in dem du Apps registrieren darfst, eine eigene App nach der [offiziellen Registrierungsanleitung](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app) erstellen. Für Hotmail/Outlook muss die Registrierung **persönliche Microsoft-Konten** unterstützen: entweder nur persönliche Konten oder beliebige Organisationsverzeichnisse plus persönliche Konten. Eine reine Single-Tenant-/Schulkonto-App reicht dafür nicht.
2. Unter Authentifizierung **öffentliche Client-Flows zulassen** (Device Code Flow). Delegierte Microsoft-Graph-Berechtigungen einrichten: `User.Read`, `Mail.ReadWrite`, `Calendars.ReadWrite`, `Tasks.ReadWrite`. Je nach Organisation müssen diese administrativ genehmigt werden. Kein Client Secret nötig; keines in Aegis eintragen.
3. Die **Anwendungs-/Client-ID** der eigenen Registrierung in Aegis speichern. Kontotyp passend wählen: `consumers` für private Hotmail-/Outlook-Konten, `organizations` für Organisationen, `common` für beides bei einer entsprechend registrierten App. Bestehende konkrete Tenant-IDs bleiben unterstützt.
4. Erst jetzt **„Postfach anmelden“** wählen: Auf der angezeigten Microsoft-Seite den sichtbaren Gerätecode eingeben, das gewünschte Konto auswählen und Berechtigungen prüfen. Aegis wartet auf Bestätigung oder Ablauf. Danach mit einem unkritischen Leseauftrag testen.

Nach erfolgreicher Anmeldung öffnet „Fass meine wichtigsten neuen Hotmail-Mails zusammen“ die Inbox-Intelligence-Ansicht. Die Priorisierung zeigt ihre Signale und Mailausschnitte; sie ist eine Arbeitshilfe, keine garantierte objektive Wichtigkeit. `Mail.Send` wird nicht angefordert, und Aegis versendet keine Nachricht automatisch.

### Fehler „Microsoft Services“ / Konto im Mandanten nicht vorhanden

Die im gemeldeten Fehler angezeigte ID `74658136-14ec-4630-ad9b-26e160ff0fc6` gehört zum Microsoft-Verwaltungsportal, **nicht zu einer Aegis-App**. Der frühere Link „Zugang einrichten“ öffnete dieses Portal, nicht die Postfach-Anmeldung. Deshalb kann bereits die Entwickler-Einrichtung mit einem privaten Konto scheitern. Siehe die [Microsoft-Erklärung zu diesem Portalfehler](https://learn.microsoft.com/en-us/answers/questions/1346227/the-selected-user-account-does-not-exist-in-the-mi) und die [offizielle Anleitung zum Kontotyp-/Tenant-Fehler](https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/error-code-AADSTS50020-user-account-identity-provider-does-not-exist).

Kein Passwortwechsel und keine fremde Client-ID beheben diese Voraussetzung. Benötigt wird Zugang zu einem passenden eigenen oder freigegebenen Entra-Mandanten; bei einem Hochschul-/Arbeitskonto gegebenenfalls die zuständige Administration fragen. Nicht ungeprüft kostenpflichtige Azure-Angebote aktivieren oder Organisationsrechte verändern. Die neue Aegis-Oberfläche erklärt dies vor dem Portallink und blockiert die bekannte Portal-ID als versehentlich eingetragene Client-ID.

Angefragte delegierte Scopes: `openid profile offline_access User.Read Mail.ReadWrite Calendars.ReadWrite Tasks.ReadWrite`. `Mail.Send` wird nicht angefragt. Outlook-Nachrichten lesen, Entwürfe erstellen, persönliche Termine sowie To-Do-Listen/Aufgaben verwenden. Lesen/Schreiben bezieht sich auf das angemeldete Konto, nicht automatisch alle Team-/SharePoint-Daten.

## Home Assistant

In deinem Home-Assistant-Profil einen Long-lived Access Token erstellen. URL und Token in Aegis speichern und testen. HTTP ist nur für ausdrücklich konfigurierte lokale Adressen erlaubt; für externe Hosts HTTPS verwenden. Bei Änderung der Server-URL ist ein neuer Token erforderlich.

Unterstützt: Zustände lesen, ein konkretes Licht oder einen Schalter an/aus, Szene aktivieren, Lichthelligkeit. Jede Steueraktion braucht Freigabe. Bei Szenen wird die Annahme bestätigt; die einzelnen Geräte einer Szene werden nicht separat verifiziert. Auch ein `switch` kann reale Geräte schalten: immer den tatsächlichen Zielgegenstand prüfen.

## Web-Recherche

Der Live Desk kann auch ohne Tavily über deinen OpenAI-Zugang recherchieren. Dabei entstehen zusätzliche API-/Websuchkosten; das gewählte Textmodell muss Websuche unterstützen. Mit konfiguriertem Tavily wird dieses verwendet. Öffentliche Wetter-/Ortsdaten, OpenStreetMap, EZB-Wechselkurse und Coinbase-Kryptokurse benötigen keinen zusätzlichen Schlüssel. [Live-Desk-Anleitung](LIVE-DESK.md).

Eigenen Schlüssel in [Tavily](https://app.tavily.com/) erstellen, in Aegis unter Web-Recherche speichern und testen. Der Test verbraucht einen Such-Credit. Suchergebnisse enthalten Titel, Quellenlink und Auszug. Keine umgangene Paywall, keine Garantie vollständiger oder richtiger Informationen.

## Trennen und Aufbewahrung

„Trennen“ entfernt die Zugangsdaten dieses Connectors aus Aegis und beendet noch offene Anmeldevorgänge. Es widerruft das Token nicht automatisch beim Anbieter und entfernt keine zuvor gelesenen Inhalte aus Missionen/Chat. Für einen vollständigen Widerruf auch die App-/Token-Verwaltung des jeweiligen Anbieters verwenden. Lokale Erinnerungen und Missionen können in Aegis gelöscht werden.
