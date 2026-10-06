import { useEffect, useState } from "react";
import { bothEvent, useOnceFullyVisible } from "~/lib/analytics";

/**
 * The old BannerImpressionProbe: an invisible 1px element that appears after the delay a real banner has (2 s, then a simulated
 * 300–800 ms Strapi call) and reports `banner_probe_viewed` once per session when fully visible — the baseline the banner
 * impression numbers are compared with.
 *
 * @feature ANL-004 Banner visibility probe
 * @feature ANL-006 Banner impression probe
 */
export function BannerImpressionProbe() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let inner: ReturnType<typeof setTimeout> | undefined;
    const outer = setTimeout(() => {
      inner = setTimeout(() => setShown(true), Math.random() * 500 + 300);
    }, 2000);
    return () => {
      clearTimeout(outer);
      clearTimeout(inner);
    };
  }, []);
  const ref = useOnceFullyVisible<HTMLDivElement>(() => bothEvent("banner_probe_viewed"), "sa.banner_probe");
  if (!shown) return null;
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-testid="banner-probe"
      style={{ position: "fixed", top: "50%", left: "50%", width: 1, height: 1, opacity: 0.001, pointerEvents: "none", userSelect: "none", zIndex: -1, overflow: "hidden", border: "none", contain: "layout style paint" }}
    />
  );
}
