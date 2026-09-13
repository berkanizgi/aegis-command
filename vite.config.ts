import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    ...(command === "serve"
      ? [
          {
            name: "development-csp",
            transformIndexHtml(html: string) {
              return html.replace(
                /<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/i,
                "",
              );
            },
          },
        ]
      : []),
  ],
  base: "./",
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
}));
