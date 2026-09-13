import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createService } from "../server/service.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const service = await createService({
  dataDir: process.env.AEGIS_DATA_DIR || path.join(root, ".data", "preview"),
});
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
const server = http.createServer(async (req, res) => {
  try {
    if (
      req.headers.host !== `127.0.0.1:${port}` &&
      req.headers.host !== `localhost:${port}`
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    const pathname = new URL(req.url, origin).pathname;
    if (pathname === "/api/invoke") {
      if (
        req.method !== "POST" ||
        req.headers["x-aegis-client"] !== "aegis-ui" ||
        (req.headers.origin &&
          ![origin, `http://localhost:${port}`].includes(req.headers.origin))
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 14 * 1024 * 1024) throw new Error("Anfrage zu groß.");
      }
      const { operation, payload } = JSON.parse(body);
      const result = await service.invoke(operation, payload || {});
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(result));
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }
    const base = path.join(root, "dist");
    let file = path.resolve(base, "." + decodeURIComponent(pathname));
    if (!file.startsWith(base + path.sep)) file = path.join(base, "index.html");
    let bytes;
    try {
      bytes = await fs.readFile(file);
    } catch {
      file = path.join(base, "index.html");
      bytes = await fs.readFile(file);
    }
    res.setHeader(
      "Content-Type",
      mime[path.extname(file)] || "application/octet-stream",
    );
    res.end(bytes);
  } catch (error) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
});
server.listen(port, "127.0.0.1", () => console.log(`Aegis preview: ${origin}`));
const stop = () => {
  service.close();
  server.close();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
