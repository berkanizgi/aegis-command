# Aegis 0.5.0 · Live Desk

Der Sprachkern bleibt sichtbar und rückt automatisch nach links, sobald Aegis ein visuelles Datenwerkzeug verwendet. Rechts erscheinen echte Ergebnisse. Der Chat bleibt optional. Keine automatischen Käufe, Handelsaufträge, Kontoregistrierungen oder Freigaben.

## Per Stimme ausprobieren

- „Wie wird das Wetter morgen in Wien?“ → Globus mit Ortsmarkierung, zehn Vorhersagetage, Temperatur, Wind und stündliche Regenwahrscheinlichkeit.
- „Und in einer Woche?“ → aktuellen Ort verwenden und den entsprechenden Vorhersagetag wählen.
- „Zeig mir die Karte von Dornbirn, Österreich.“ → OpenStreetMap innerhalb der App.
- „Zeig Euro gegen Dollar für die letzten 30 Tage.“ → Referenzkurs-Diagramm, Veränderung und Originalwerte.
- „Wie hat sich Bitcoin gegen Euro in sieben Tagen entwickelt?“ → Coinbase-Kursreihe und jüngster abgerufener Börsenkurs.
- „Recherchiere aktuelle Entwicklungen bei …“ → Rechercheanfrage, Quellen und Zusammenfassung.
- „Fass meine wichtigsten neuen Hotmail-Mails zusammen.“ → sicheres Postfach-Briefing mit rot/gelb markierten Belegkarten und sichtbaren Prioritätssignalen.
- „Öffne die erste Quelle.“ → Seite innerhalb von Aegis anzeigen und sichtbaren Text lesen.
- „Zurück zu den Ergebnissen“, „Vorheriges Ergebnis“ oder „Live Desk schließen“ → Ansichtswechsel, ohne das Gespräch zu beenden.

Alternativ „Live Desk öffnen“ und die Reiter/Eingabe verwenden. Der „Standardort für Wetter & Karten“ in Einstellungen ist optional. Ohne gespeicherten oder gerade genannten Ort fragt Aegis nach. Keine automatische GPS- oder IP-Standortermittlung.

## Datenquellen und Grenzen

| Ansicht    | Quelle                                                  | Einordnung                                                                                                                                                          |
| ---------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wetter/Ort | Open-Meteo / GeoNames                                   | Modellprognose für den gefundenen Ort; kein Regenradar, keine straßengenauen Niederschlagszellen. Größerer Vorlauf bedeutet mehr Unsicherheit.                      |
| Karte      | OpenStreetMap                                           | Ortskarte mit Zoom/Verschieben. Markierung = Ortsname, nicht gemessener GPS-Standort.                                                                               |
| Währungen  | Frankfurter, gefiltert auf EZB                          | Tägliche Referenzkurse, keine Intraday-/Handelskurse. Fehlende Wochenend-/Feiertagswerte werden nicht erfunden.                                                     |
| Krypto     | Coinbase Exchange                                       | Einzelbörse; Tageskerzen und jüngster abgerufener Ticker. Kein permanenter Live-Feed und keine Handelsfunktion.                                                     |
| Postfach   | Outlook-Email-Plugin, Microsoft Graph oder Google Gmail | Nur nach eigener Anmeldung. Priorität aus sichtbaren Signalen wie ungelesen, Provider-Markierung, Alter und Dringlichkeitsbegriffen; keine garantierte Wichtigkeit. |
| Recherche  | Tavily, sonst OpenAI-Websuche                           | Quellen und klickbare Zitate. Aktien werden recherchiert; ohne separaten Börsendatenanbieter keine garantierten Echtzeit-Aktiencharts.                              |

Wetter-, Orts-, Währungs- und Kryptoabrufe brauchen hier keinen zusätzlichen API-Schlüssel. Dienste können Limits und Ausfälle haben. Open-Meteos öffentlicher kostenloser Zugang ist für nichtkommerzielle Nutzung vorgesehen; vor kommerzieller Verteilung Konditionen prüfen. Karten und Quellen laden Inhalte von Drittanbietern, denen die üblichen Verbindungsdaten und die jeweilige Anfrage bekannt werden.

Allgemeine Recherche verwendet zunächst konfiguriertes Tavily. Sonst nutzt sie dein bestehendes OpenAI-Textmodell mit `web_search`: zusätzliche API-/Suchkosten; ein Modell ohne Unterstützung kann einen Fehler liefern. Kein stiller Modellwechsel. Während des Abrufs zeigt Aegis einen animierten, wahrheitsgetreuen Pfad von der Anfrage über den Provider zu Quellen und Evidenz. Das sind keine erfundenen Browserklicks. Die Live-Stimme kann Wetter, Karte, Kurse und ein verbundenes Postfach direkt aufrufen, ohne zusätzlichen Textmodell-Planungsschritt.

Für privates Hotmail ist **Control Panel → Plugins → Outlook Email** der einfache Weg ohne eigene Azure-App. Alternativ bleibt Microsoft Graph direkt integriert und benötigt eine persönliche Appregistrierung. Aegis lädt für das Briefing bis zu 50 passende Nachrichten; der direkte Graph-Pfad liefert derzeit höchstens 20 pro Abruf. Rot bedeutet „Aufmerksamkeit“, Gelb „prüfen“; die Karten nennen die Signale und zeigen Absender, Betreff, Zeit und Vorschau als Belege. Der Antwortablauf erstellt zuerst einen lokalen, bearbeitbaren Text. Nur ein separater Klick speichert einen Outlook-Entwurf. Es existiert kein Aegis-Sendeschritt.

Die sichtbaren Fortschrittsschritte sind tatsächliche Abrufphasen, keine simulierten Google-Klicks. Die Quellenansicht ist ein isolierter Leser ohne KI-Klicks, Formulare oder Aegis-Preload. Sie lädt nur ausgewählte öffentliche HTTPS-Quellen, keine lokalen Dateien. Das ist kein universeller automatischer Browser. Die bestehende Browser-Operator-Funktion mit Freigaben bleibt separat.

Ergebnisse und sechs vorherige Ansichten bleiben für die App-Sitzung im Live Desk; gewöhnliche Chat-/Aktivitätsaufzeichnungen behalten ihre bisherigen Regeln. Kleine Caches vermeiden identische Abrufe: Wetter/Kerzen bis fünf Minuten, Ticker eine Minute, EZB eine Stunde, Ortsauflösung einen Tag. Kurszeitpunkt und Vorhersagedatum werden separat vom Abrufzeitpunkt angezeigt. Keine Anlageberatung.

## Mikrofon und Windows

Nur das vertrauenswürdige Aegis-Hauptfenster erhält reinen Audiozugriff automatisch, auch nach Neuladen. Kamera, fremde Seiten, Unterframes und andere Geräteberechtigungen bleiben ausgeschlossen. Der Test verwendet simulierte Hardware, aber den echten Chromium-Berechtigungsweg.

Windows-Datenschutz-/Firewall-Dialoge sind getrennt. Aegis verändert keine Windows-Freigaben und schaltet keine Schutzfunktionen aus. Bei verweigertem Zugriff unter Windows → Datenschutz & Sicherheit → Mikrofon den Zugriff für Desktop-Apps prüfen.

Für einen festen Programmpfad `release/win-unpacked/Aegis.exe` starten; den ganzen Ordner zusammenlassen. Die portable Einzel-EXE entpackt sich bei jedem Start in einen temporären Pfad. Ein fester Pfad ist keine Garantie gegen Windows-Sicherheitsabfragen. Das konkrete Popup des Nutzers wurde ohne Screenshot nicht identifiziert.

„Beim Öffnen begrüßen & zuhören“ bleibt abschaltbar. Escape stoppt Sprache auch bei Tastaturfokus in der Quellenansicht. Die 15-Minuten-Begrenzung bleibt. „Live Desk schließen“ beendet den Datenabruf und die Ansicht, nicht das Gespräch.

## Prüfung

61 automatisierte Tests: unter anderem Quellen/Zahlen, Schemas, Audiofreigaben, Abbruch/späte Ergebnisse, direkte Sprachwerkzeuge, Realtime-Nutzungszähler, Postfach-Priorisierung, lokale Ortskorrektur, Plugin-Metadaten und Outlook-Antwortentwürfe ohne Senden. Desktop- und Sprach-UI-Tests prüfen die bestehenden Funktionen.

`npm run test:live-desk` prüft Chromium-Audiofreigabe mit Testhardware, Kamera-Ablehnung, Wetter/Karte/Märkte/Recherche/Postfach, eingebettete Quelle ohne Aegis-Preload und ein 1024-Pixel-Fenster. Dessen Screenshots und Postfachkarten enthalten simulierte Daten. Zusätzlich wurden echte Open-Meteo-Prognosen für Wien, EZB/Frankfurter-Kursreihen und Coinbase-Kursreihen mit neutralen Anfragen abgerufen. Keine privaten Konten, echten Mikrofonaufnahmen oder kostenpflichtigen OpenAI-/Tavily-Suchen. Live-Sprachqualität und kontospezifische Suchverfügbarkeit sind nicht end-to-end bewiesen.

## Quellen und Kartendaten

- [OpenAI Realtime](https://developers.openai.com/api/docs/guides/realtime-conversations) und [Websuche/Zitate](https://developers.openai.com/api/docs/guides/tools-web-search)
- [Electron-Berechtigungen](https://www.electronjs.org/docs/latest/api/session) und [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Open-Meteo-Prognose](https://open-meteo.com/en/docs) und [Geocoding](https://open-meteo.com/en/docs/geocoding-api)
- [Frankfurter](https://frankfurter.dev/) und [Coinbase-Kurskerzen](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles)
- [Natural Earth: Public Domain](https://www.naturalearthdata.com/about/terms-of-use/). `src/lib/earth-land.json` enthält auf zwei Dezimalstellen gerundete Konturen aus [ne_110m_land.geojson](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson). Keine politischen Grenzlinien oder Standortmessungen werden daraus abgeleitet.
