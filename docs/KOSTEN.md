# Aegis 0.5.1 · Kostenwächter

## Die kurze Empfehlung

Für dieses Projekt bleiben `gpt-4.1-mini` als Text-/Werkzeugmodell und `gpt-realtime-mini` als Sprachmodell eingestellt. `gpt-4.1-mini` ist für Werkzeugaufrufe deutlich geeigneter als ein reines Nano-Modell und kostet laut offizieller Modellseite $0,40 Input, $0,10 Cached Input und $1,60 Output je eine Million Text-Tokens. Ein größeres Realtime-Modell wird nicht automatisch gewählt.

Der Schalter **Kostenwächter** ist standardmäßig aktiv. Er:

- begrenzt den aktiven Sprachverlauf nach den festen Anweisungen auf 6.000 Tokens und behält bei einer Kürzung 80 Prozent;
- lässt Aegis normalerweise in ein bis zwei kurzen Sätzen antworten;
- begrenzt normale Text- und Rechercheantworten auf 900 Output-Tokens;
- nutzt bei OpenAI-Websuche weiterhin die niedrige Suchkontextgröße;
- zeigt Realtime-Text-, Audio- und Cache-Tokens in den Einstellungen an.

Das löscht keine gespeicherten Erinnerungen. Aegis lädt nur eine kleine Auswahl relevanter lokaler Erinnerungen in die Sprachsitzung. „Merke dir …“ landet im dauerhaften lokalen Gedächtnis; belangloser alter Gesprächstext soll nicht endlos als teurer Live-Kontext mitgeschleppt werden.

## Warum einige Minuten bereits spürbar kosten

Realtime berechnet jede erzeugte Antwort. Der komplette bisherige Gesprächsverlauf wird zur Eingabe der nächsten Antwort, weshalb spätere Gesprächsrunden teurer werden können. Nutzer-Audio entspricht ungefähr einem Token pro 100 ms, Assistenten-Audio ungefähr einem Token pro 50 ms. Lange Aegis-Monologe sind deshalb besonders teuer. Prompt Caching kann wiederverwendete Präfixe günstiger machen, ist aber best effort.

Zusätzlich läuft für sichtbare Nutzertranskripte `gpt-4o-mini-transcribe`; die offizielle Preisseite nennt dafür derzeit ungefähr $0,003 pro Minute. Eine OpenAI-Websuche kostet derzeit $10 pro 1.000 Aufrufe plus Modell-/Suchkontext-Tokens. Bei `gpt-4.1-mini` wird Suchinhalt laut Preisseite als fester Block von 8.000 Input-Tokens pro Aufruf berechnet. Wetter, Ortskarte, EZB-Wechselkurse, Coinbase-Krypto und Microsoft-Graph-Postfachabrufe verursachen keine OpenAI-Websuchgebühr.

OpenAI listet für das aktuelle `gpt-realtime-2.1-mini` Audio mit $10 Input und $20 Output je eine Million Audio-Tokens. Aegis wechselt dein eingetragenes Alias `gpt-realtime-mini` nicht still auf dieses Modell; Modellverfügbarkeit und die konkrete Abrechnung des Alias im eigenen API-Konto müssen im OpenAI-Dashboard geprüft werden. Deshalb zeigt Aegis Tokens und keine erfundene exakte Eurozahl.

## So bauen andere Voice-Agenten kostengünstig

Das übliche Muster ist eine Kaskade: lokale Spracherkennung/VAD trennt echte Rede von Stille; ein günstiges Realtime-Modell führt den Dialog; Datenwerkzeuge erledigen deterministische Abrufe; nur komplexe Aufgaben gehen an ein separates Textmodell. Langzeitgedächtnis liegt als strukturierte Fakten außerhalb des Live-Verlaufs. Alte Dialogteile werden begrenzt oder durch eine kurze Zusammenfassung ersetzt. Lange Werkzeugarbeit kann unabhängig von der Sprachverbindung laufen.

Aegis setzt davon bereits um: Server-VAD, Realtime Mini, direkte Wetter-/Karten-/Kurs-/Postfachwerkzeuge ohne zusätzlichen Planungsaufruf, kompakten Sprachkontext, lokales Langzeitgedächtnis und kurze Antworten. Für eine längere Denk- oder Recherchephase kannst du zusätzlich Escape drücken und die Sprache nach dem Ergebnis wieder starten. Das beendet nicht die lokalen Aufgaben oder das Gedächtnis.

## Praktischer Vergleich

Der echte Vergleichswert ist **Kosten pro erfolgreich erledigter Aufgabe**, nicht nur der günstigste Tokenpreis. Ein zu schwaches Modell kann durch Wiederholungen und falsche Werkzeugaufrufe insgesamt teurer werden. Für dein Schulprojekt ist `gpt-4.1-mini` daher ein vernünftiger Text-Kompromiss. Für reine lokale Notizen, Timer und gespeicherte Erinnerungen braucht Aegis überhaupt keinen KI-Aufruf.

Nach einer typischen zehnminütigen Testsitzung in den Einstellungen die Audio-/Text-/Cache-Zähler notieren und im OpenAI-Dashboard mit derselben Uhrzeit vergleichen. Die beobachteten 60 Cent können auch mehrere vorherige API-Aufrufe oder Websuchen im Dashboard enthalten; Aegis behauptet deshalb keine pauschale Kostenrate pro Minute.

## Offizielle Grundlagen

- [OpenAI: Realtime-Kostenoptimierung](https://developers.openai.com/api/docs/guides/voice-latency-cost)
- [OpenAI: aktuelle API-Preise](https://developers.openai.com/api/docs/pricing)
- [OpenAI: GPT-Realtime Mini](https://developers.openai.com/api/docs/models/gpt-realtime-mini)
- [OpenAI: GPT-4.1 Mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
- [OpenAI: Realtime Voice Activity Detection](https://developers.openai.com/api/docs/guides/realtime-vad)
