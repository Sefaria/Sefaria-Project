import React from 'react';
import {TopicLandingSearch} from "./TopicLandingSearch";
import classNames from "classnames";
import {useRef, useEffect, useState} from "react";
import lineClamp from 'line-clamp';


export const WordSalad = ({ numLines, salad, renderItem }) => {
  const containerRef = useRef(null);
  const zeroWidthSpace = '\u200B';

  useEffect(() => {
    if (containerRef.current) {
      lineClamp(containerRef.current, numLines, {ellipsis: zeroWidthSpace}); // Apply lineClamp to the actual DOM element
    }
  }, [numLines, salad]); // Reapply if numLines or salad changes

  return (
    <div ref={containerRef} className="salad-container">
      {salad.map((item, index) => renderItem(item))}
    </div>
  );
};