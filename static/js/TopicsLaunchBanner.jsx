import React, { useEffect, useRef, useState } from "react";
import TopicsLaunchBannerGraphics from "./TopicsLaunchBannerGraphics";
import TopicsLaunchBannerMobileGraphics from "./TopicsLaunchBannerMobileGraphics";
import { OnInView } from "./Misc";

const TopicsLaunchBanner = ({ onClose }) => {
  const bannerName = "2025-topics_launch-2";
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
    <div data-anl-event="banner_view:scrollIntoView"
         data-anl-promotion_name="2025-topics_launch-2"
         data-anl-feature_name="Topics Launch Banner">
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
        <div id="topicsLaunchBannerMessageClose" 
             onClick={() => closeBanner("close_clicked")}
             data-anl-event="banner_close_click:click"
             data-anl-promotion_name="2025-topics_launch-2"
             data-anl-link_type="banner_close"
             data-anl-text="close">
          <img src="/static/img/topics-launch-banner-close-button-final.svg" />
        </div>
      </div>
    </div>
  );
};

export { TopicsLaunchBanner };