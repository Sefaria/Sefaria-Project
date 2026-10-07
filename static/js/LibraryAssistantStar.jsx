import React from 'react';

// The Library Assistant's ✦, drawn as a shape so it looks the same everywhere (as text it
// depends on the font). Same path as the "✦ Ask" button in the ai-chatbot widget.
// Sized at 1.125em: 18px next to 16px text, like the widget.
const LibraryAssistantStar = ({className = ''}) => (
  <svg className={`libraryAssistantStarIcon ${className}`.trim()} width="1.125em" height="1.125em"
       viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M12 0C12.6 6.6 17.4 11.4 24 12C17.4 12.6 12.6 17.4 12 24C11.4 17.4 6.6 12.6 0 12C6.6 11.4 11.4 6.6 12 0Z"/>
  </svg>
);

export default LibraryAssistantStar;
