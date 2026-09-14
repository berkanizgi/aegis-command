export default function MicrosoftSetup() {
  return (
    <div className="microsoft-setup">
      <div className="micro-label">OUTLOOK · HOTMAIL · MICROSOFT 365</div>
      <h4>Für Hotmail: zuerst das Outlook-Email-Plugin.</h4>
      <p>
        Öffne links im Control Panel <strong>Plugins</strong> und richte dort
        <strong> Outlook Email</strong> ein. Du meldest dich im offiziellen
        ChatGPT-/Microsoft-Dialog ganz normal mit deiner Hotmail-Adresse an.
        Dafür brauchst du keine eigene Azure-App und keine Client-ID.
      </p>
      <p className="microsoft-direct-note">
        Die Felder weiter unten bleiben als professionelle Standalone-Option
        erhalten, falls du später eine eigene Microsoft-Graph-App besitzt. Für
        dein privates Hotmail-Konto kannst du sie leer lassen.
      </p>
      <details open>
        <summary>Empfohlener Weg ohne Azure</summary>
        <ol>
          <li>
            <strong>Plugins öffnen</strong>
            <span>Outlook Email mit einem Klick einrichten.</span>
          </li>
          <li>
            <strong>Hotmail anmelden</strong>
            <span>Im offiziellen Dialog deine private E-Mail auswählen.</span>
          </li>
          <li>
            <strong>Postfach öffnen</strong>
            <span>
              Im Live Desk auf Postfach drücken. Aegis liest und bereitet
              Entwürfe vor; Senden bleibt immer bei dir.
            </span>
          </li>
        </ol>
      </details>
      <details>
        <summary>Alternative für Entwickler: eigene Microsoft-Graph-App</summary>
      <ol>
        <li>
          <strong>App registrieren</strong>
          <span>
            In einem Entra-Verzeichnis, auf das du Zugriff und
            App-Registrierungsrechte hast, eine eigene App „Aegis Personal“
            registrieren. Falls du noch kein Verzeichnis hast, verweist
            Microsoft auf ein kostenlos erstellbares Azure-Konto. Für Hotmail
            „Persönliche Microsoft-Konten“ oder „Beliebige
            Organisationsverzeichnisse und persönliche Microsoft-Konten“
            zulassen.
          </span>
        </li>
        <li>
          <strong>Geräteanmeldung erlauben</strong>
          <span>
            In der Registrierung unter Authentifizierung öffentliche
            Client-Flows aktivieren. Delegierte Microsoft-Graph-Berechtigungen:
            User.Read, Mail.ReadWrite, Calendars.ReadWrite und Tasks.ReadWrite.
            Aegis fragt kein Mail.Send an.
          </span>
        </li>
        <li>
          <strong>Hier verbinden</strong>
          <span>
            Eigene Client-ID unten eintragen, Kontotyp auswählen und speichern.
            Erst dann „Postfach anmelden“ drücken, Gerätecode auf der
            Microsoft-Seite bestätigen und dein gewünschtes Postfach-Konto
            wählen.
          </span>
        </li>
      </ol>
      </details>
      <details>
        <summary>Fehler „Konto nicht im Mandanten Microsoft Services“?</summary>
        <p>
          Steht in der Meldung die App-ID{" "}
          <code>74658136-14ec-4630-ad9b-26e160ff0fc6</code>, betrifft das
          Microsofts Entra-/Azure-Verwaltungsportal – nicht dein Postfach und
          nicht Aegis. Ein privates Hotmail-Konto allein bedeutet noch keinen
          Zugang zu einem Entra-Verzeichnis.
        </p>
        <p>
          Wähle beim Portal ein Konto mit Zugriff auf dein eigenes Verzeichnis.
          Ein Schul-/Firmenkonto kann Registrierungen verbieten; dann ist dessen
          Administration zuständig. Ohne passende Appregistrierung kann Aegis
          diesen Microsoft-Zugriff nicht herstellen. Ein anderes Passwort, eine
          fremde Client-ID oder das bloße Öffnen des Portals löst das nicht.
        </p>
        <p>
          Eine neue Azure-/Entra-Einrichtung ist ein separater Schritt mit
          eigenen Voraussetzungen und möglichen Kosten. Aegis legt keine
          Abonnements an und verändert keine Organisation.
        </p>
      </details>
      <div className="microsoft-help-links">
        <a
          className="inline-link"
          href="https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app"
          target="_blank"
          rel="noreferrer"
        >
          Microsoft-Anleitung zur Appregistrierung ↗
        </a>
        <a
          className="inline-link"
          href="https://azure.microsoft.com/free/"
          target="_blank"
          rel="noreferrer"
        >
          Kostenloses Azure-Konto, falls kein Verzeichnis vorhanden ↗
        </a>
        <a
          className="inline-link"
          href="https://entra.microsoft.com/"
          target="_blank"
          rel="noreferrer"
        >
          Verwaltungsportal öffnen (nicht Postfach-Anmeldung) ↗
        </a>
      </div>
    </div>
  );
}
