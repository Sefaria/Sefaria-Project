import React from 'react';


export const WordSalad = ({ numLines, salad, renderItem }) => {
/**
 * This component renders a collection of items, styled to fit within a specified
 * number of lines. Each item can be rendered using a custom `renderItem` function, and
 * spaces within the items are replaced with non-breaking spaces to ensure consistent
 * line breaking behavior in CSS.
 *
 * @param {number} props.numLines - The number of lines the container should display.
 * @param {Array} props.salad - An array of objects representing the items to display.
 * @param {Function} props.renderItem - A function that receives an item from the `salad` array
 *                                      and returns a React element to render it.
 */

  const renderItemWithSpacesForBreaks = (item)=>{
    // inner span to prevent wrapping on spaces mid-item, outer span with trailing space to allow wrapping between items
    const trailingSpacedElement = <span><span className='no-wrapping-salad-item-container'>{renderItem(item)}</span> </span>
    return trailingSpacedElement;
  }


  return (
    <div className="salad-container" style={{ '--num-lines': numLines }}>
      {salad.map(renderItemWithSpacesForBreaks)}
    </div>
  );
};