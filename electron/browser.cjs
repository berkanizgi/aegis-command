const { BrowserWindow, session } = require("electron");
const { randomUUID } = require("node:crypto");
const safeUrl = (value) => {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Dieser Link ist nicht erlaubt.");
  return url.href;
};
function createBrowserOperator(parent) {
  let view = null,
    generation = "",
    references = new Map();
  function ensure() {
    if (view && !view.isDestroyed()) return view;
    const partition = "persist:aegis-operator";
    session
      .fromPartition(partition)
      .setPermissionRequestHandler((_, __, cb) => cb(false));
    session
      .fromPartition(partition)
      .on("will-download", (event) => event.preventDefault());
    view = new BrowserWindow({
      width: 1180,
      height: 850,
      title: "Aegis · Browser Operator",
      backgroundColor: "#08131c",
      autoHideMenuBar: true,
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    view.webContents.on("page-title-updated", (event) => {
      event.preventDefault();
      view?.setTitle("Aegis · Browser Operator");
    });
    view.webContents.on("will-navigate", (event, url) => {
      try {
        safeUrl(url);
      } catch {
        event.preventDefault();
      }
    });
    view.webContents.on("will-redirect", (event, url) => {
      try {
        safeUrl(url);
      } catch {
        event.preventDefault();
      }
    });
    view.webContents.setWindowOpenHandler(({ url }) => {
      try {
        view.loadURL(safeUrl(url)).catch(() => {});
      } catch {}
      return { action: "deny" };
    });
    view.webContents.on("did-start-navigation", () => {
      generation = "";
      references.clear();
    });
    view.on("closed", () => {
      view = null;
      references.clear();
    });
    return view;
  }
  async function snapshot() {
    if (!view || view.isDestroyed())
      throw new Error("Zuerst eine Website im Browser Operator öffnen.");
    generation = randomUUID();
    const data = await view.webContents.executeJavaScript(
      `(()=>{const nodes=[...document.querySelectorAll('a[href],button,input,textarea,select,[role="button"]')].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0).slice(0,100);return {title:document.title,url:location.href,text:document.body.innerText.slice(0,18000),elements:nodes.map((e,i)=>{const ref='aegis-'+${JSON.stringify(generation)}+'-'+i;e.setAttribute('data-aegis-ref',ref);const label=(e.getAttribute('aria-label')||e.innerText||e.getAttribute('placeholder')||e.getAttribute('name')||e.tagName).trim().slice(0,150);return {ref,tag:e.tagName,type:e.getAttribute('type')||'',label,href:e.tagName==='A'?e.href:undefined};})};})()`,
    );
    references = new Map(
      data.elements.map((element) => [
        element.ref,
        { ...element, url: data.url },
      ]),
    );
    return { ...data, verified: true };
  }
  return async (command) => {
    if (command.action === "open") {
      const w = ensure();
      await w.loadURL(safeUrl(command.url));
      w.show();
      return snapshot();
    }
    if (command.action === "read") return snapshot();
    if (!["click", "fill"].includes(command.action))
      throw new Error("Unbekannte Browseraktion.");
    const ref = references.get(command.ref);
    if (!ref || !view || ref.url !== view.webContents.getURL())
      throw new Error(
        "Die Seite hat sich geändert. Bitte neu lesen und freigeben.",
      );
    if (command.url !== ref.url || command.label !== ref.label)
      throw new Error(
        "Seite und Element passen nicht zur Vorschau. Bitte neu lesen und freigeben.",
      );
    if (
      /password|payment|cardnumber|credit|cvv|passwort|kennwort|bezahlen|zahlung|kaufen|purchase|delete|löschen|permissions|berechtigung/i.test(
        ref.label + " " + ref.type,
      )
    )
      throw new Error("Diese Aktion bitte selbst im Browser ausführen.");
    if (command.action === "click" && ref.href) safeUrl(ref.href);
    const result = await view.webContents.executeJavaScript(
      `(()=>{const e=document.querySelector('[data-aegis-ref="'+${JSON.stringify(command.ref)}+'"]');if(!e)throw Error('Element nicht mehr vorhanden');const label=(e.getAttribute('aria-label')||e.innerText||e.getAttribute('placeholder')||e.getAttribute('name')||e.tagName).trim().slice(0,150);if(label!==${JSON.stringify(ref.label)}||e.tagName!==${JSON.stringify(ref.tag)}||(e.getAttribute('type')||'')!==${JSON.stringify(ref.type)})throw Error('Element hat sich verändert');if(e.tagName==='A'&&e.href!==${JSON.stringify(ref.href || "")})throw Error('Linkziel hat sich verändert');if(${JSON.stringify(command.action)}==='fill'){if(!['INPUT','TEXTAREA'].includes(e.tagName)||e.type==='password')throw Error('Kein erlaubtes Textfeld');const set=Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;set.call(e,${JSON.stringify(command.text || "")});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return {filled:e.value===${JSON.stringify(command.text || "")},verified:true};}e.click();return {clicked:true,verified:false,note:'Klick ausgeführt. Mit browser_read den fachlichen Erfolg prüfen.'};})()`,
    );
    references.clear();
    generation = "";
    return result;
  };
}
module.exports = { createBrowserOperator };
