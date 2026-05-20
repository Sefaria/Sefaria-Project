import React, { useState, useEffect, useRef } from 'react';
import Sefaria from './sefaria/sefaria';
import TopicBubbleChart from './TopicBubbleChart';
import ChapterBreakdown from './ChapterBreakdown';

function collectBooks(tocNode, topCategory, out) {
  if (!tocNode) return;
  if (Array.isArray(tocNode)) {
    tocNode.forEach(item => collectBooks(item, topCategory, out));
    return;
  }
  if (tocNode.title) {
    out.push({ title: tocNode.title, heTitle: tocNode.heTitle || tocNode.title, category: topCategory });
  } else if (tocNode.category) {
    const cat = topCategory || tocNode.category;
    (tocNode.contents || []).forEach(child => collectBooks(child, cat, out));
  }
}

function buildBookList() {
  if (!Sefaria.toc) return [];
  const out = [];
  collectBooks(Sefaria.toc, null, out);
  return out;
}

function groupByCategory(books) {
  const groups = {};
  books.forEach(b => {
    if (!groups[b.category]) groups[b.category] = [];
    groups[b.category].push(b);
  });
  return groups;
}

export default function TopicMapPage({ interfaceLang: propLang }) {
  const interfaceLang = propLang || (Sefaria._lang === 'he' ? 'hebrew' : 'english');

  const [selectedBook, setSelectedBook] = useState('');
  const [bookData, setBookData] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [topicBooksData, setTopicBooksData] = useState(null);
  const [loadingBook, setLoadingBook] = useState(false);
  const [loadingTopic, setLoadingTopic] = useState(false);
  const [error, setError] = useState(null);

  const bookList = useRef(buildBookList());
  const bookGroups = useRef(groupByCategory(bookList.current));

  useEffect(() => {
    if (!selectedBook) return;
    setLoadingBook(true);
    setBookData(null);
    setSelectedTopic(null);
    setTopicBooksData(null);
    setError(null);

    fetch(`/api/book-topics/${encodeURIComponent(selectedBook)}?n=60`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setBookData(data);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoadingBook(false));
  }, [selectedBook]);

  useEffect(() => {
    if (!selectedTopic) return;
    setLoadingTopic(true);
    setTopicBooksData(null);

    fetch(`/api/topic-books/${encodeURIComponent(selectedTopic.slug)}?n=30`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setTopicBooksData(data);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoadingTopic(false));
  }, [selectedTopic]);

  function handleBubbleClick(topicData) {
    setSelectedTopic(prev =>
      prev && prev.slug === topicData.slug ? null : topicData
    );
    setTopicBooksData(null);
  }

  function handleBookRankClick(bookTitle) {
    setSelectedBook(bookTitle);
  }

  const isHebrew = interfaceLang === 'hebrew';

  const chapterData = selectedTopic && bookData
    ? (bookData.topics || []).find(t => t.slug === selectedTopic.slug)
    : null;

  return (
    <div id="topicMapPageContent">
      <div className="topicMapHeader">
        <h1>{isHebrew ? 'מפת נושאים' : 'Topic Map'}</h1>
        <p>
          {isHebrew
            ? 'בחר ספר כדי לראות אילו נושאים מופיעים בו ובאיזו תדירות'
            : 'Select a book to see which topics appear most frequently, then click a bubble to rank all books by that topic.'}
        </p>
      </div>

      <div className="bookSelector">
        <label htmlFor="bookSelect">
          {isHebrew ? 'ספר:' : 'Book:'}
        </label>
        <select
          id="bookSelect"
          value={selectedBook}
          onChange={e => setSelectedBook(e.target.value)}
        >
          <option value="">{isHebrew ? '— בחר ספר —' : '— Select a book —'}</option>
          {Object.keys(bookGroups.current).map(cat => (
            <optgroup key={cat} label={cat}>
              {bookGroups.current[cat].map(b => (
                <option key={b.title} value={b.title}>
                  {isHebrew ? b.heTitle : b.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {!selectedBook && (
        <div className="topicMapEmpty">
          {isHebrew ? 'בחר ספר להתחלה' : 'Select a book above to get started.'}
        </div>
      )}

      {selectedBook && loadingBook && (
        <div className="topicMapLoading">
          {isHebrew ? 'טוען נושאים…' : 'Loading topics…'}
        </div>
      )}

      {error && <div className="topicMapError">{error}</div>}

      {bookData && !loadingBook && (
        <div className="topicMapLayout">
          <div className="topicMapLeft">
            {bookData.topics.length === 0 ? (
              <div className="topicMapEmpty">
                {isHebrew ? 'לא נמצאו נושאים לספר זה' : 'No topics found for this book.'}
              </div>
            ) : (
              <TopicBubbleChart
                topics={bookData.topics}
                selectedTopic={selectedTopic}
                onBubbleClick={handleBubbleClick}
                interfaceLang={interfaceLang}
              />
            )}
          </div>

          <div className="topicMapRight">
            {!selectedTopic && (
              <div className="topicMapRightEmpty">
                {isHebrew ? 'לחץ על בועה לפרטים' : 'Click a bubble to see where else this topic appears.'}
              </div>
            )}

            {selectedTopic && (
              <>
                <p className="selectedTopicHeader">
                  <span>{isHebrew ? selectedTopic.he : selectedTopic.en}</span>
                  {' '}
                  {isHebrew ? 'בספרים' : 'across books'}
                </p>

                <div className="topicBooksSection">
                  <h3>{isHebrew ? 'ספרים לפי שכיחות' : 'Books by frequency'}</h3>
                  {loadingTopic && (
                    <div className="topicMapLoading" style={{ padding: '12px 0' }}>
                      {isHebrew ? 'טוען…' : 'Loading…'}
                    </div>
                  )}
                  {topicBooksData && (
                    <ul className="topicBooksList">
                      {topicBooksData.books.map((book, i) => (
                        <li
                          key={book.title}
                          className={book.title === selectedBook ? 'active' : ''}
                          onClick={() => handleBookRankClick(book.title)}
                          title={`${book.title}: ${book.count}`}
                        >
                          <span className="rank">#{i + 1}</span>
                          <span className="bookTitle">
                            {isHebrew ? book.heTitle : book.title}
                          </span>
                          <span className="bookCategory">{book.category}</span>
                          <span className="bookCount">{book.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {chapterData && chapterData.chapters && Object.keys(chapterData.chapters).length > 0 && (
                  <ChapterBreakdown
                    topic={selectedTopic}
                    book={selectedBook}
                    chapters={chapterData.chapters}
                    interfaceLang={interfaceLang}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
