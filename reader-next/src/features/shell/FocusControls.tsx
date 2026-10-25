import { IconButton } from "~/ui/IconButton/IconButton";
import styles from "./FocusControls.module.css";
import { setHeaderCollapsed, toggleFullscreen, useFullscreen, useHeaderCollapsed } from "./focus-mode";

/** The two reading-focus switches, at the top edge of the page while a text is open. */
export function FocusControls() {
  const collapsed = useHeaderCollapsed();
  const fullscreen = useFullscreen();
  return (
    <div className={styles.controls}>
      {fullscreen ? null : (
        <IconButton icon={collapsed ? "chevron-down" : "chevron-up"} label={collapsed ? "Show the header" : "Hide the header"} onClick={() => setHeaderCollapsed(!collapsed)} />
      )}
      <IconButton icon={fullscreen ? "minimize" : "maximize"} label={fullscreen ? "Leave full screen" : "Full screen"} onClick={toggleFullscreen} />
    </div>
  );
}
