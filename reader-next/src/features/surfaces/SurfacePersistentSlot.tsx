/**
 * The persistent mount's slot in the shell (src/routes/__root.tsx): only while the `social` lab is on, and only once the page has
 * hydrated, it loads the surface code (./SurfaceMount.tsx, its own chunk) and renders the persistent mount. Nothing of the surface is
 * in the page's up-front scripts, and the server renders nothing here (the mount is fixed-position: appearing later shifts nothing).
 *
 * @feature SHL-076 Social lab and /social routes
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useLab } from "~/features/reader-state/labs";

const SurfacePersistent = lazy(() => import("./SurfaceMount").then((m) => ({ default: m.SurfacePersistent })));

export function SurfacePersistentSlot() {
  const on = useLab("social");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if (!on || !hydrated) return null;
  return (
    <Suspense fallback={null}>
      <SurfacePersistent />
    </Suspense>
  );
}
