import React from "react";

export const RainbowLine = ({rainbowClassname, animated=false}) => {
    const baseRainbowClassname = animated ? 'animatedCategoryColorLineRainbow' : 'categoryColorLineRainbow';
    return (
        <div className={`${baseRainbowClassname} ${rainbowClassname}`}/>
    );
};