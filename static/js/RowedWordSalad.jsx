import React from 'react';


export const RowedWordSalad = ({ numLines, salad, renderItem }) => {
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

  const renderContainedItem = (item)=>{
    return <span className='rowed-salad-item-container'>{renderItem(item)}</span>
  }


  return (
    <div className="rowed-salad-container" >
      {salad.map(renderContainedItem)}
    </div>
  );
};