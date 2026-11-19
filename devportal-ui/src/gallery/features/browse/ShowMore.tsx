import { Button } from '../../components/ui/Button';
import styles from './ShowMore.module.css';

export function ShowMore({ onClick }: { onClick: () => void }) {
  return (
    <div className={styles.root}>
      <Button variant="outline" onClick={onClick}>
        Show more projects
      </Button>
    </div>
  );
}
