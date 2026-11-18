import { Tag, type TagSize } from '../../components/ui/Tag';
import styles from './TopicTags.module.css';

interface TopicTagsProps {
  topics: readonly string[];
  /** 'sm' = 28px row (cards), 'xs' = 24px row (list). */
  size: Extract<TagSize, 'sm' | 'xs'>;
}

/**
 * Always a single line: tags that don't fit are clipped away whole (never cut,
 * never wrapped, no "+n").
 */
export function TopicTags({ topics, size }: TopicTagsProps) {
  return (
    <div className={size === 'sm' ? styles.rowSm : styles.rowXs} data-testid="topic-tags">
      {topics.map((topic) => (
        <Tag key={topic} variant="topic" size={size}>
          {topic}
        </Tag>
      ))}
    </div>
  );
}
