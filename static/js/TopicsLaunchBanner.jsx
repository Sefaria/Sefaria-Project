import React, { useEffect, useRef, useState } from "react";
import TopicsLaunchBannerGraphics from "./TopicsLaunchBannerGraphics";
import TopicsLaunchBannerMobileGraphics from "./TopicsLaunchBannerMobileGraphics";
import { OnInView } from "./Misc";

const TopicsLaunchBanner = ({ onClose }) => {
  const bannerName = "2025-topics_launch";
  const bannerKey = `banner_${bannerName}`;

  const [bannerVisibility, setBannerVisibility] = useState("hidden");
  const [shouldRender, setShouldRender] = useState(false);
  const [hasInteractedWithBanner, setHasInteractedWithBanner] = useState(false);

  const bannerRef = useRef(null);
  const desktopButtonRef = useRef(null);
  const mobileButtonRef = useRef(null);

  const bannerVisibilityRef = useRef("hidden");

  const markBannerAsHasBeenInteractedWith = () => {
    sessionStorage.setItem(bannerKey, "true");
  };

  const hasBannerBeenInteractedWith = () => {
    return sessionStorage.getItem(bannerKey) === "true";
  };

  const trackBannerInteraction = (eventDescription) => {
    gtag("event", `banner_interacted_with_${eventDescription}`, {
      campaignID: bannerName,
      adType: "banner",
    });
  };

  const trackBannerImpression = () => {
    gtag("event", "banner_viewed", {
      campaignID: bannerName,
      adType: bannerName,
    });
  };

  const shouldShow = () => {
    return (
      Sefaria.interfaceLang !== "hebrew" &&
      !hasBannerBeenInteractedWith() &&
      window.location.pathname !== "/topics" &&
      !window.location.pathname.startsWith("/sheets")
    );
  };

  const restartButtonAnimations = () => {
    const resetButtonAnimation = (buttonRef) => {
      if (buttonRef.current) {
        const button = buttonRef.current;
        const parent = button.parentNode;
        const clone = button.cloneNode(true);
        if (button.onclick) {
          clone.onclick = button.onclick;
        }
        if (parent) {
          parent.replaceChild(clone, button);
          buttonRef.current = clone;
        }
      }
    };

    resetButtonAnimation(desktopButtonRef);
    resetButtonAnimation(mobileButtonRef);
  };

  const closeBanner = (eventDescription) => {
    if (onClose) onClose();

    setBannerVisibility("hidden");

    trackBannerInteraction(eventDescription);
  };


  useEffect(() => {
    const bannerElement = bannerRef.current;

    if (bannerElement) {
      const handleTransitionEnd = (event) => {
        if (event.propertyName === "height") {
          if (bannerVisibility === "") {
            restartButtonAnimations();
          }

          if (bannerVisibility === "hidden") {
            setHasInteractedWithBanner(true);
            markBannerAsHasBeenInteractedWith();

            if (document.body.classList.contains("hasBannerMessage")) {
              document.body.classList.remove("hasBannerMessage");
            }
          }
        }
      };

      bannerElement.addEventListener("transitionend", handleTransitionEnd);

      return () => {
        bannerElement.removeEventListener("transitionend", handleTransitionEnd);
      };
    }
  }, [bannerVisibility]);

  useEffect(() => {
    if (shouldShow()) {
      setShouldRender(true);

      const timeoutId = setTimeout(() => {
        if (document.getElementById("s2")?.classList.contains("headerOnly")) {
          document.body.classList.add("hasBannerMessage");
        }

        setBannerVisibility("");
      }, 2000);

      return () => clearTimeout(timeoutId);
    }
  }, []);

  if (!shouldRender || hasInteractedWithBanner) {
    return null;
  }

  return (
    <OnInView onVisible={trackBannerImpression}>
      <div id="bannerMessage" className={bannerVisibility} ref={bannerRef}>
        <div id="topicsLaunchBanner">
          <TopicsLaunchBannerGraphics
            onExploreButtonClick={() => closeBanner("banner_button_clicked")}
            buttonRef={desktopButtonRef}
          />
          <TopicsLaunchBannerMobileGraphics
            onExploreButtonClick={() => closeBanner("banner_button_clicked")}
            buttonRef={mobileButtonRef}
          />
        </div>
        <div id="topicsLaunchBannerMessageClose" onClick={() => closeBanner("close_clicked")}>
          <img src="/static/img/topics-launch-banner-close-button-final.svg" alt="Close banner" />
        </div>
      </div>
    </OnInView>
  );
};

export { TopicsLaunchBanner };