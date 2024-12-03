import React, {useState} from "react";
import { useCombobox } from 'downshift';




export const RainbowLine = ({rainbowClassname}) => {
    const colors = [
        "tankah-teal",
        "commentary-blue",
        "musar-purple",
        "mishna-blue",
        "talmud-gold",
        "modrash-green",
        "halakha-red",
        "philosophy-purple",
        "tanaitic-greem",
        "chasidut-green",
    ];

    return (
        <div className={`rainbow-line ${rainbowClassname}`}>
            {colors.map((color, index) => (
                <span key={index} className={`rainbow-segment ${color}`} />
            ))}
        </div>
    );
};