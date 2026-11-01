import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ApplyContext } from "~/lib/reader-state/core/types";
import { createSettingsSlice } from "~/lib/reader-state/sefaria/slices/settings";
import { toCookie, type ReaderSettings } from "~/lib/reader/settings";
import { useRegisterSlice } from "~/features/reader-state/context";

interface SettingsApi {
  settings: ReaderSettings;
  /** Apply a patch and persist each changed setting to its cookie (same names/values as the old site). */
  update: (patch: Partial<ReaderSettings>) => void;
  /**
   * Show settings that are not the person's own (a replay, someone being followed): with `persist: false` the state changes and no
   * cookie is written, so a reload shows their own settings again. With `persist: true` it is an {@link SettingsApi.update}.
   */
  apply: (settings: ReaderSettings, ctx: Pick<ApplyContext, "persist">) => void;
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
 * It also registers the `sefaria.settings` slice of the reader state API (no-op outside its provider), so a recording carries the
 * settings and a replay shows them without writing cookies.
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
  const apply = useCallback<SettingsApi["apply"]>(
    (next, ctx) => {
      if (ctx.persist) update(next);
      else setSettings((prev) => ({ ...prev, ...next }));
    },
    [update],
  );

  // The slice reads the latest settings at call time and hears every change once it has rendered.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const listeners = useRef(new Set<() => void>());
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    for (const cb of [...listeners.current]) cb();
  }, [settings]);
  const slice = useMemo(
    () =>
      createSettingsSlice({
        get: () => settingsRef.current,
        apply: (s, ctx) => apply(s, ctx),
        subscribe: (cb) => {
          listeners.current.add(cb);
          return () => void listeners.current.delete(cb);
        },
      }),
    [apply],
  );
  useRegisterSlice(slice);

  const api = useMemo(() => ({ settings, update, apply }), [settings, update, apply]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useReaderSettings(): SettingsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useReaderSettings must be used inside ReaderSettingsProvider");
  return v;
}
