import React from 'react';

const CommunityBookBlock = ({ book }) => {
  return (
    <div className="communityBookBlock">
      <div className="bookTitle">
        <a href={book.url || `/${encodeURIComponent(book.sheet_title.replace(/ /g, '_'))}`}>
          {book.sheet_title}
        </a>
      </div>
      {book.sheet_summary && (
        <div className="bookDescription">{book.sheet_summary}</div>
      )}
      <div className="bookMeta">
        <span>{book.publisher_name}</span>
        <span>·</span>
        {book.license && <span className="licenseBadge">{book.license}</span>}
      </div>
    </div>
  );
};

export default CommunityBookBlock;
