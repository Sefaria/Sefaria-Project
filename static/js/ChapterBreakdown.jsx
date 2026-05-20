import React from 'react';
import PropTypes from 'prop-types';

function ChapterBreakdown({ topic, book, chapters, interfaceLang }) {
  const entries = Object.entries(chapters)
    .map(([ch, cnt]) => ({ chapter: parseInt(ch, 10), count: cnt }))
    .filter(e => e.chapter > 0)
    .sort((a, b) => a.chapter - b.chapter);

  if (entries.length === 0) return null;

  const maxCount = Math.max(...entries.map(e => e.count));
  const topicLabel = interfaceLang === 'hebrew' ? topic.he : topic.en;

  function handleChapterClick(chapter) {
    const url = `/${book.replace(/ /g, '_')}.${chapter}`;
    window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="chapterSection">
      <h3>
        {interfaceLang === 'hebrew'
          ? `${topicLabel} לפי פרק`
          : `${topicLabel} by Chapter`}
      </h3>
      <div className="barChart">
        {entries.map(({ chapter, count }) => (
          <div
            key={chapter}
            className="barGroup"
            title={`Chapter ${chapter}: ${count}`}
            onClick={() => handleChapterClick(chapter)}
          >
            <div
              className="bar"
              style={{ height: `${Math.max(2, (count / maxCount) * 96)}px` }}
            />
            <span className="chapterLabel">{chapter}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

ChapterBreakdown.propTypes = {
  topic: PropTypes.shape({
    slug: PropTypes.string,
    en: PropTypes.string,
    he: PropTypes.string,
  }).isRequired,
  book: PropTypes.string.isRequired,
  chapters: PropTypes.object.isRequired,
  interfaceLang: PropTypes.string,
};

export default ChapterBreakdown;
