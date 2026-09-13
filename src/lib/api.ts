export type Row = Record<string, any>;
export interface AegisState {
  settings: Row;
  missions: Row[];
  memories: Row[];
  commitments: Row[];
  routines: Row[];
  activity: Row[];
  messages: Row[];
  connectors: Row[];
  focus: Row;
  shadow: Row;
  usage: Row;
}
declare global {
  interface Window {
    aegis?: {
      invoke: (operation: string, payload?: Row) => Promise<any>;
      windowControl?: (action: string) => void;
      [key: string]: any;
    };
  }
}
export async function invoke(
  operation: string,
  payload: Row = {},
): Promise<any> {
  if (window.aegis?.invoke) return window.aegis.invoke(operation, payload);
  const response = await fetch("/api/invoke", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Aegis-Client": "aegis-ui",
    },
    body: JSON.stringify({ operation, payload }),
  });
  const value = await response
    .json()
    .catch(() => ({
      error:
        "Der lokale Aegis-Dienst antwortet nicht. Bitte starte die App neu.",
    }));
  if (!response.ok)
    throw new Error(
      typeof value.error === "string"
        ? value.error
        : value.error?.message ||
            "Die Aktion konnte nicht abgeschlossen werden.",
    );
  return value;
}
export const initialState: AegisState = {
  settings: {
    name: "Boss",
    provider: "openai",
    model: "gpt-4.1-mini",
    realtimeModel: "gpt-realtime-mini",
    voice: "cedar",
    dailyRequestLimit: 100,
  },
  missions: [],
  memories: [],
  commitments: [],
  routines: [],
  activity: [],
  messages: [],
  connectors: [],
  focus: { active: false },
  shadow: { active: false, events: [] },
  usage: {},
};
export function dateTime(value?: string) {
  return value
    ? new Date(value).toLocaleString("de-AT", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}
export function relativeTime(value?: string) {
  if (!value) return "gerade eben";
  const mins = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  return mins < 1
    ? "gerade eben"
    : mins < 60
      ? `vor ${mins} Min.`
      : mins < 1440
        ? `vor ${Math.floor(mins / 60)} Std.`
        : dateTime(value);
}
