import React from 'react';


export const WordSalad = ({ numLines, salad, renderItem }) => {
  const nonWhitespaceInvisibleChar = '\u00A0'
  // replace the normal space with the HTML space char, in order for css to not break line mid-item.
  salad = salad.map(saladItem => ({
    ...saladItem,
    text: saladItem.text.replace(/ /g, nonWhitespaceInvisibleChar),
  }));

  const renderItemWithSpacesForBreaks = (item)=>{
    // needed in order for css to recognize space after each item to potentially break the line at this space.
    const spacedElement = <span>{renderItem(item)} </span>
    return spacedElement
  }


  return (
    <div className="salad-container" style={{ '--num-lines': numLines }}>
      {salad.map((item, index) => renderItemWithSpacesForBreaks(item))}
    </div>
  );
};