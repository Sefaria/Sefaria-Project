import React from 'react';


export const WordSalad = ({ numLines, salad, renderItem }) => {
  const nonWhitespaceInvisibleChar = '\u00A0'

  salad = salad.map(saladItem => ({
    ...saladItem,
    text: saladItem.text.replace(/ /g, nonWhitespaceInvisibleChar),
  }));

  const renderItemWithSpacesForBreaks = (item)=>{
    const spacedElement = <span>{renderItem(item)} </span>
    return spacedElement
  }


  return (
    <div className="salad-container" style={{ '--num-lines': numLines }}>
      {salad.map((item, index) => renderItemWithSpacesForBreaks(item))}
    </div>
  );
};