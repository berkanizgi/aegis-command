import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { isTrustedFile } from "../electron/trust.cjs";

test("portable IPC accepts canonical equivalents of 8.3 temp paths", () => {
  const short = "C:\\Users\\BERKAN~1\\Temp\\app.asar\\dist\\index.html";
  const long = "C:\\Users\\Berkan Izgi\\Temp\\app.asar\\dist\\index.html";
  const resolve = (p) => (p === short ? long : p);
  assert.equal(isTrustedFile(pathToFileURL(long).href, short, resolve), true);
  assert.equal(
    isTrustedFile(
      pathToFileURL(long.replace("index.html", "other.html")).href,
      short,
      resolve,
    ),
    false,
  );
});
test("IPC trust rejects remote pages, sibling files and missing files", () => {
  assert.equal(
    isTrustedFile("https://example.com/index.html", "index.html"),
    false,
  );
  assert.equal(isTrustedFile("not a url", "index.html"), false);
  const require = createRequire(import.meta.url);
  const file = require.resolve("../electron/main.cjs");
  assert.equal(isTrustedFile(pathToFileURL(file).href, file), true);
  assert.equal(
    isTrustedFile(
      pathToFileURL(file.replace("main.cjs", "trust.cjs")).href,
      file,
    ),
    false,
  );
  assert.equal(
    isTrustedFile(pathToFileURL(file + "-missing").href, file),
    false,
  );
});
