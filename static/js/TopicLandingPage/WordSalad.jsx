import React from 'react';


export const WordSalad = ({ numLines, salad, renderItem }) => {
  const nonWhitespaceInvisibleChar = '\u00A0'

  salad = salad.map(saladItem => ({
    ...saladItem,
    text: saladItem.text.replace(/ /g, nonWhitespaceInvisibleChar),
  }));


  return (
    <div className="salad-container" style={{ '--num-lines': numLines }}>
      {salad.map((item, index) => renderItem(item))}
    </div>
  );
};