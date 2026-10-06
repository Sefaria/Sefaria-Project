import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toCookie, type ReaderSettings } from "~/lib/reader/settings";

interface SettingsApi {
  settings: ReaderSettings;
  /** Apply a patch and persist each changed setting to its cookie (same names/values as the old site). */
  update: (patch: Partial<ReaderSettings>) => void;
}

const Ctx = createContext<SettingsApi | null>(null);

const YEAR = 60 * 60 * 24 * 365;

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${YEAR}; samesite=lax`;
}

/**
 * Reader display settings for the whole app. The initial value comes from the request's cookies (so the
 * server render already matches); changes are written back to the same cookies. Panels that need their
 * own settings (compare, sidebar) take them through props, not through this provider.
 *
 * @feature SHL-008 Settings persistence in cookies
 * @feature SHL-010 New panels inherit display settings
 */
export function ReaderSettingsProvider({ initial, children }: { initial: ReaderSettings; children: ReactNode }) {
  const [settings, setSettings] = useState(initial);
  const update = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    for (const [key, value] of Object.entries(patch) as [keyof ReaderSettings, ReaderSettings[keyof ReaderSettings]][]) {
      const [name, v] = toCookie(key, value as never);
      writeCookie(name, v);
      if (key === "language") writeCookie("contentLang", v);
    }
  }, []);
  const api = useMemo(() => ({ settings, update }), [settings, update]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useReaderSettings(): SettingsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useReaderSettings must be used inside ReaderSettingsProvider");
  return v;
}
