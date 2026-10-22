/**
 * Page-level analytics that the old ReaderApp and base.html run once per load or session.
 *
 * @feature ANL-008 App mount and visitor marking events
 * @feature ANL-011 Copy and print events
 * @feature ANL-005 Visibility-based impression tracking
 */
import { useEffect, useRef, useState } from "react";
import { PUBLIC_CONFIG } from "~/lib/config";
import { bothEvent, gtagEvent, type AnalyticsParams } from "./core";

export interface AnalyticsUser {
  uid: number | null;
  email?: string | null;
}

const isStaff = (email?: string | null) => !!email && email.includes("sefaria.org");

/** The signed-in user's id and staff flag, as base.html's gtag config sets them from DJANGO_VARS.props._uid / _email. */
export function setAnalyticsUser(user: AnalyticsUser, siteLang: string): void {
  if (typeof window === "undefined") return;
  const id = PUBLIC_CONFIG.analytics.gtag;
  if (id && window.gtag) {
    window.gtag("config", id, {
      user_id: user.uid ?? null,
      traffic_type: isStaff(user.email) ? "sefariaemail" : null,
      site_lang: siteLang,
      site_version: PUBLIC_CONFIG.analytics.appVersion || null,
    });
  }
  setSaMetadata({ loggedIn: !!user.uid, staff: isStaff(user.email) });
}

const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** The old visitor flags (Sefaria.isNewVisitor / isReturningVisitor / markUserAs…), which Strapi audience targeting reads. */
export const visitor = {
  isNew(): boolean {
    try {
      return JSON.parse(sessionStorage.getItem("isNewVisitor") ?? "null") === true || (!("isNewVisitor" in sessionStorage) && !("isReturningVisitor" in localStorage));
    } catch {
      return false;
    }
  },
  isReturning(): boolean {
    try {
      return !visitor.isNew() && "isReturningVisitor" in localStorage && JSON.parse(localStorage.getItem("isReturningVisitor")!) === true;
    } catch {
      return false;
    }
  },
  markNew(): void {
    try {
      sessionStorage.setItem("isNewVisitor", "true");
      localStorage.setItem("isReturningVisitor", "true");
    } catch {
      /* ignore */
    }
  },
  markReturning(): void {
    try {
      sessionStorage.setItem("isNewVisitor", "false");
      localStorage.setItem("isReturningVisitor", "true");
    } catch {
      /* ignore */
    }
  },
};

declare global {
  interface Window {
    sa_metadata?: AnalyticsParams;
  }
}

/** base.html's "Default metadata for Simple Analytics" (session id, persistent sa_id, device, new/old visitor, staff flag). */
export function setSaMetadata({ loggedIn, staff }: { loggedIn: boolean; staff?: boolean }): void {
  if (typeof window === "undefined" || !PUBLIC_CONFIG.analytics.simpleAnalyticsHost) return;
  try {
    if (sessionStorage.getItem("sa_custom_session_id") === null) sessionStorage.setItem("sa_custom_session_id", uuid());
    if (localStorage.getItem("sa_id") === null) localStorage.setItem("sa_id", uuid());
    window.sa_metadata = {
      logged_in: loggedIn,
      interface_lang: document.documentElement.lang === "he" ? "he" : "en",
      device_type: window.matchMedia("(max-width: 600px)").matches ? "mobile" : "desktop",
      user_type: visitor.isReturning() ? "old" : "new",
      custom_session_id: sessionStorage.getItem("sa_custom_session_id"),
      sefaria_id: localStorage.getItem("sa_id"),
      ...(staff ? { traffic_type: "sefaria_email" } : {}),
    };
  } catch {
    /* storage blocked */
  }
}

/**
 * ReaderApp's mount effects (ReaderApp.jsx:237-258): mark the visitor, `reader_app_mounted` once per session,
 * `intersection_observer_not_supported` once per browser; `print` on beforeprint.
 */
export function useAppAnalytics(signedIn: boolean | undefined): void {
  useEffect(() => {
    if (signedIn === undefined) return;
    if (signedIn) visitor.markReturning();
    else if (visitor.isNew()) visitor.markNew();
  }, [signedIn]);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("sa.reader_app_mounted") === null) {
        sessionStorage.setItem("sa.reader_app_mounted", "true");
        bothEvent("reader_app_mounted");
      }
      if (localStorage.getItem("sa.intersection_observer_api_checked") === null) {
        if (!("IntersectionObserver" in window)) bothEvent("intersection_observer_not_supported");
        localStorage.setItem("sa.intersection_observer_api_checked", "true");
      }
    } catch {
      /* storage blocked */
    }
    const onPrint = () => gtagEvent("print");
    window.addEventListener("beforeprint", onPrint);
    return () => window.removeEventListener("beforeprint", onPrint);
  }, []);
}

/**
 * The old useOnceFullyVisible: calls `onVisible` the first time the element is 100% visible, once per session (`key` in
 * sessionStorage, checked when the element mounts and set when it fires — so two elements sharing a key on the same first page
 * both report, as on sefaria.org).
 */
export function useOnceFullyVisible<T extends Element>(onVisible: () => void, key: string): (node: T | null) => void {
  // a callback ref: the element may appear after the first render (the banner probe does)
  const [node, setNode] = useState<T | null>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;
  useEffect(() => {
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      return;
    }
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && entry.intersectionRatio === 1) {
          cb.current();
          try {
            sessionStorage.setItem(key, "true");
          } catch {
            /* ignore */
          }
          io.disconnect();
        }
      },
      { threshold: 1 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [node, key]);
  return setNode;
}

/** The copy events of ReaderApp.handleGACopyEvents: copy_text, plus bilingual_copy_text / spanning_copy_text. */
export function copyEvents(params: { length: number; panelType: string; book: string | null; category: string | null }, sel: { en: number; he: number }): void {
  gtagEvent("copy_text", params);
  if (!params.book) return;
  if (sel.en > 0 && sel.he > 0) gtagEvent("bilingual_copy_text", params);
  if (sel.en > 1 || sel.he > 1) gtagEvent("spanning_copy_text", params);
}
