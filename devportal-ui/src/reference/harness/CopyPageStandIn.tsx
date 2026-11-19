// Harness only: a static stand-in for W2's Copy Page split button, sized as live's, so the headline region of the
// pixel loop compares like with like.
import { Icon } from '../ui/icons';
import styles from './harness.module.css';

export function CopyPageStandIn() {
  return (
    <div className={styles.copyPage}>
      <button type="button" className={styles.copyLeft}>
        <Icon name="copy" className={styles.copyIcon} />
        <span>Copy Page</span>
      </button>
      <button type="button" className={styles.copyRight} aria-label="Copy Page options">
        <Icon name="chevron-down" className={styles.copyChevron} />
      </button>
    </div>
  );
}
