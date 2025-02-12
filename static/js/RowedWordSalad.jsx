import React from 'react';


export const RowedWordSalad = ({salad, renderItem }) => {
/**
 * This component renders a collection of items, and styles them into one (scrollable) lines.
 * Each item can be rendered using a custom `renderItem` function, and
 *
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