import React, { useEffect } from 'react';

export const WordSalad = ({ numLines, salad, renderItem, addBullets = true }) => {
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
   * @param {boolean} props.addBullets - A boolean that controls whether bullets should be added between items.
   */

  const renderItemWithSpacesForBreaks = (item) => {
    // inner span to prevent wrapping on spaces mid-item, outer span with trailing space to allow wrapping between items
    const trailingSpacedElement = <span><span className='no-wrapping-salad-item-container'>{renderItem(item)}</span> </span>
    return trailingSpacedElement;
  };

  useEffect(() => {
    if (!addBullets) return; // Skip bullet logic if addBullets is false

    // Function to handle bullet placement based on line breaks
    const placeLineBullets = () => {
      const items = document.querySelectorAll('.no-wrapping-salad-item-container');

      // Clear bullets from all items first
      items.forEach(item => item.classList.remove('has-bullet'));

      // For each item, if it shares a line with the NEXT item,
      // add a bullet to the CURRENT item.
      // Because if item[i] and item[i+1] have the same offsetTop,
      // item[i] is not at the end of its line.
      for (let i = 0; i < items.length - 1; i++) {
        const current = items[i];
        const next = items[i + 1];
        if (current.offsetTop === next.offsetTop) {
          current.classList.add('has-bullet');
        }
      }
    };

    // Call the function after the component mounts
    placeLineBullets();
  }, [salad, addBullets]); // Re-run effect when salad or addBullets changes

  return (
    <div className="salad-container" style={{ '--num-lines': numLines }}>
      {salad.map(renderItemWithSpacesForBreaks)}
    </div>
  );
};