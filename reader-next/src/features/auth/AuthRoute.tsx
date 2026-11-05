/**
 * The page behind /login, /register and the reset link: one AuthPage that stays mounted while the reader moves between them (so
 * the funnel's flow change and the typed email survive a cross-link, as on the old site, where AuthPage was one component).
 *
 * @feature ACC-001 In-app login/register page integration
 * @feature ACC-007 Auth routes and in-app auth page mounting
 */
import { useEffect, useRef } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { AuthPage } from "./AuthPage";
import { recordSignupSource, takeSignupSource } from "./signup-source";

export function AuthRoute() {
  const loc = useLocation();
  const router = useRouter();
  const path = loc.pathname + (loc.searchStr ?? "");
  // the source belongs to the navigation that brought us here; taken once per address
  const src = useRef<{ path: string; source: string | null } | null>(null);
  if (src.current?.path !== path) src.current = { path, source: takeSignupSource(loc.pathname) };
  useEffect(() => {
    document.documentElement.dataset.authRoute = "true";
    return () => {
      delete document.documentElement.dataset.authRoute;
    };
  }, []);
  return (
    <AuthPage
      initialPath={path}
      authSource={src.current.source}
      onNavigate={(to, source) => {
        recordSignupSource(to.split("?")[0]!, source);
        src.current = { path: to, source: source ?? null };
        void router.navigate({ href: to });
      }}
    />
  );
}
