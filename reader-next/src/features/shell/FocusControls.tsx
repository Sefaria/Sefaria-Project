import { IconButton } from "~/ui/IconButton/IconButton";
import styles from "./FocusControls.module.css";
import { setHeaderCollapsed, toggleFullscreen, useFullscreen, useHeaderCollapsed } from "./focus-mode";

/** The two reading-focus switches, in a pill at the bottom corner of the page while a text is open. */
export function FocusControls() {
  const collapsed = useHeaderCollapsed();
  const fullscreen = useFullscreen();
  return (
    <div className={styles.controls}>
      {fullscreen ? null : (
        <IconButton size="sm" icon={collapsed ? "header-show" : "header-hide"} label={collapsed ? "Show the header" : "Hide the header"} onClick={() => setHeaderCollapsed(!collapsed)} />
      )}
      <IconButton size="sm" icon={fullscreen ? "minimize" : "maximize"} label={fullscreen ? "Leave full screen" : "Full screen"} onClick={toggleFullscreen} />
    </div>
  );
}
