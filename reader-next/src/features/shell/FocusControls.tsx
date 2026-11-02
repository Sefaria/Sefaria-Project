import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { IconButton } from "~/ui/IconButton/IconButton";
import styles from "./FocusControls.module.css";
import { setHeaderCollapsed, toggleFullscreen, useFullscreen, useHeaderCollapsed } from "./focus-mode";

/** The two reading-focus switches, in a pill at the bottom corner of the page while a text is open. */
export function FocusControls() {
  const collapsed = useHeaderCollapsed();
  const fullscreen = useFullscreen();
  const he = useInterfaceLang() === "hebrew";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  return (
    <div className={styles.controls}>
      {fullscreen ? null : (
        <IconButton size="sm" icon={collapsed ? "header-show" : "header-hide"} label={collapsed ? t("Show the header", "הצגת הכותרת") : t("Hide the header", "הסתרת הכותרת")} onClick={() => setHeaderCollapsed(!collapsed)} />
      )}
      <IconButton size="sm" icon={fullscreen ? "minimize" : "maximize"} label={fullscreen ? t("Leave full screen", "יציאה ממסך מלא") : t("Full screen", "מסך מלא")} onClick={toggleFullscreen} />
    </div>
  );
}
