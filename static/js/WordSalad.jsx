import React from 'react';


export const WordSalad = ({ numLines, salad, renderItem }) => {
/**
 * This component renders a collection of text items, styled to fit within a specified
 * number of lines. Each item can be rendered using a custom `renderItem` function, and
 * spaces within the items are replaced with non-breaking spaces to ensure consistent
 * line breaking behavior in CSS.
 *
 * @param {number} props.numLines - The number of lines the container should display.
 *                                  This is used in the CSS to control layout.
 * @param {Array} props.salad - An array of objects representing the text items to display.
 *                              Each object must have a `text` property.
 * @param {Function} props.renderItem - A function that receives an item from the `salad` array
 *                                      and returns a React element to render it.
 */

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