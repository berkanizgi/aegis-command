const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

// Chromium expands Windows 8.3 paths while a portable launcher may retain
// the short form in __dirname. Resolve both before comparing the exact file.
function isTrustedFile(rawUrl, appFile, resolve = fs.realpathSync) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "file:") return false;
    return path.relative(resolve(appFile), resolve(fileURLToPath(url))) === "";
  } catch {
    return false;
  }
}
module.exports = { isTrustedFile };
