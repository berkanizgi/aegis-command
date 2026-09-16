# Aegis 0.7.0 · Zwei Bildschirme

## Einrichten

1. Die alte Aegis-Version über das Tray-Menü vollständig beenden. Das Kreuz allein blendet sie nur aus.
2. `Aegis-0.7.0-Setup.exe` ausführen und für den aktuellen Windows-Benutzer installieren. Danach die Aegis-Verknüpfung verwenden. Der Installationspfad bleibt bei Updates gleich. Der Installer ist nicht code-signiert; die Herkunft prüfen. Er verändert keine Firewall-Regeln, löscht keine Kontodaten und startet keine KI-Sitzung ohne Öffnen der App.
3. Zwei Monitore anschließen und in Windows **Win + P → Erweitern** einstellen. „Duplizieren“ erzeugt keine unabhängig nutzbaren Arbeitsflächen.
4. Aegis starten: Hauptmonitor = Sprachkern / App-Steuerung; erster weiterer Monitor = Live Desk. Weitere Monitore bleiben frei.

In **Einstellungen** lassen sich **Im Vollbild starten**, **Zweiten Bildschirm nutzen** und **Postfach beim Sprachstart prüfen** unabhängig abschalten. F11 bzw. der Vollbildknopf wechselt in den Fenstermodus. Das Schließen des Informationsdisplays holt die Ergebnisse zurück zum Hauptfenster. Zum erneuten Öffnen die Zweitbildschirm-Einstellung aus- und wieder einschalten oder Aegis neu starten. Beim Abziehen eines Monitors erfolgt der Rückfall automatisch; erneutes Anschließen öffnet das Display wieder (sofern nicht zuvor bewusst geschlossen).

## Netzwerkfreigabe

Die wiederkehrende Abfrage kommt laut Nutzer von **Windows-Sicherheit / Firewall**, nicht von Aegis. Eine portable EXE entpackt die eigentliche App in einen temporären Pfad. Pfadgebundene Windows-Freigaben können deshalb bei einem späteren Start nicht mehr passen. Die Setup-Version vermeidet diese wechselnden App-Pfade; sie garantiert jedoch nicht, dass Windows oder eine verwaltete Sicherheitsrichtlinie nie mehr nachfragt.

Die Windows-Freigabe muss gegebenenfalls einmal bewusst bestätigt werden. Nur die benötigten Netzwerkprofile freigeben (im eigenen Heimnetz normalerweise „Privat“). Weder die Firewall insgesamt deaktivieren noch pauschale Regeln für andere Programme anlegen. Aegis installiert keine Firewall-Ausnahmen und benötigt für den Installer keine Administratorrechte. Bei einer Schul-/Firmenrichtlinie entscheidet die Administration.

## Sprache und Tagesstart

- „Geh mal in die Einstellungen“, „Öffne die Plugins“, „Zeig mir die Missionen“: direkte lokale Navigation, ohne zusätzliches Textmodell. Die Oberfläche bestätigt den Seitenwechsel. Ein parallel ausgelöster Modellaufruf derselben Navigation wird zusammengeführt.
- Die kurze Realtime-Anweisung enthält jetzt ebenfalls die App-Steuerung und deutsche Seitenzuordnungen. Normale Live-Desk-Fortschrittsupdates springen nicht mehr zurück ins Command Center.
- Beim **automatischen** Sprachstart liest Aegis standardmäßig einmal pro App-Prozess höchstens 20 aktuelle Outlook-Nachrichten. Bestehende direkte Graph-Verbindungen bzw. der bereits eingerichtete Outlook-Plugin-Zugang werden wiederverwendet. Ohne eingerichteten API-Zugang/automatischen Sprachstart erfolgt dieser Check nicht von selbst.
- Der Abruf findet vor Öffnen der kostenpflichtigen Realtime-Sitzung statt. Nach höchstens 12 Sekunden Wartezeit startet die Sprache auch ohne fertiges Briefing. Langsame Postfachabrufe können im Live Desk weiterlaufen; dann noch keine abgeschlossene Prüfung behaupten. Escape/Beenden verhindert auch während der Wartezeit einen späteren Mikrofonstart.
- Der Sprachkontext bekommt nur Zähler, Zeitstand und höchstens drei kurze Betreffzeilen, nicht alle Nachrichtenkörper. Das benötigt keinen zusätzlichen Textmodell-Aufruf; die gesprochene Antwort selbst wird weiterhin normal vom Sprachmodell abgerechnet.
- Die Tageszahlen gelten für den **geprüften Ausschnitt**, nicht zwingend für das gesamte Postfach. Prioritäten sind weiterhin nachvollziehbare Heuristiken. Fehlgeschlagene oder abgebrochene Abrufe sind keine erfolgreichen Prüfungen. Es wird nichts versendet, gelöscht oder als gelesen markiert.

## Architektur und Tests

Ein Hauptprozess betreibt einen Datendienst und maximal zwei vertrauenswürdige Renderer. Nur das Hauptfenster darf eine Sprachsitzung öffnen, Einstellungen ändern oder App-Steuerungen bestätigen. Das Informationsdisplay darf Live-Desk-Werkzeuge und den vorhandenen manuellen Entwurfsablauf nutzen; es bekommt weder Mikrofonzugriff noch allgemeine Missions-/Shell-Rechte. Webseiten behalten ihre separate, berechtigungslose Quellenansicht. Diese wird beim Bildschirmwechsel umgehängt, bevor das alte Fenster zerstört wird.

`npm test` prüft zusätzlich Sprachzuordnungen, doppelte Navigation, Startcheck, Display-Hotplug und Quellen-Reparenting. `npm run test:displays` betreibt zwei echte Electron-Fenster mit simulierter Monitortopologie und isolierten Mail-Testdaten; es prüft IPC-Grenzen, verweigerten Mikrofonzugriff im Zweitfenster, Darstellung, Seitenwechsel, F11 und Rückfall. `test:voice-ui` schickt tatsächlich deutsche Transkript-Ereignisse durch den Sprachcontroller und die lokale App-Steuerung. Kein Test benötigt private Nachrichten oder kostenpflichtige API-Aufrufe.
