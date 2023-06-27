import React from "react";
import PropTypes from "prop-types";
import ToggleSwitchButton from "./components/ToggleSwitch";

function TextsPropertiesMenu(props) {
    const hasAliyot = props.hasAliyot;
    const hasVowels = props.hasVowels;
    const hasCantilation = props.hasCantilation;
    const hasPunctuation = props.hasPunctuation;
    return (
        <div className={textsPropertiosMenu}>
            <SwitchButton className="showSorce"></SwitchButton>
            <SwitchButton className="showTranslation"></SwitchButton>
            <LayoutButton />
            { hasAliyot && <SwitchButton className="aliyot"></SwitchButton> }
            <FontSizeButton />
            { hasVowels && <SwitchButton className="vowels"></SwitchButton> }
            { hasCantilation && <SwitchButton className="cantilation"></SwitchButton> }
            { hasPunctuation && <SwitchButton className="punctuation"></SwitchButton> }
        </div>
    );
}
TextsPropertiesMenu.proptypes = {
    hasAliyot: PropTypes.bool,
    hasVowels: PropTypes.bool,
    hasCantilation: PropTypes.bool,
    hasPunctuation: PropTypes.bool,
};

export default TextsPropertiesMenu;
