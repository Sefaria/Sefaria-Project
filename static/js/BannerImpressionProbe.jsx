
import Sefaria from "./sefaria/sefaria";
import { useEffect, useState } from "react";
import { useOnceFullyVisible } from "./Misc";

const BannerImpressionProbe = () => {
  const [shouldRender, setShouldRender] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Simulate the delayed rendering that real banners have
  useEffect(() => {
    let renderTimer, apiCallTimer;

    renderTimer = setTimeout(() => {
      setShouldRender(true);
      // Simulate the API call to Strapi that real banners make
      // Mock API delay (300-800ms)
      const apiDelay = Math.random() * 500 + 300;
      apiCallTimer = setTimeout(() => {
        setDataLoaded(true);
        if (Sefaria._debug) {
          console.log(`BannerImpressionProbe: Simulated Strapi data loaded after ${apiDelay.toFixed(0)}ms`);
        }
      }, apiDelay);
    }, 2000);

    return () => {
      clearTimeout(renderTimer);
      clearTimeout(apiCallTimer);
    };
  }, []);

  const probeRef = useOnceFullyVisible(() => {
    sa_event("banner_probe_viewed");
    gtag("event", "banner_probe_viewed");

    if (Sefaria._debug) {
      console.log("BannerImpressionProbe: Analytics events fired");
    }
  }, `sa.banner_probe`);

  // Don't render anything until delays have passed
  if (!shouldRender || !dataLoaded) {
    return null;
  }

  return (
    <div
      ref={probeRef}
      style={{
        // Prevent from showing up in document flow
        position: "fixed",
        top: "50%",
        left: "50%",
        width: "1px",
        height: "1px",
        opacity: 0.001, // Minimum opacity for IntersectionObserver to detect
        pointerEvents: "none", // Prevent all mouse/touch interactions
        userSelect: "none", // Prevent text selection
        zIndex: -1,
        overflow: "hidden",
        border: "none",
        contain: "layout style paint", // CSS containment - prevent layout and style outside of it from being affected
      }}
      aria-hidden="true" // Hide from screen readers
    >
    </div>
  );
};

export { BannerImpressionProbe };