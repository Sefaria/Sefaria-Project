import React from "react";
import {InterfaceText} from "./Misc";
import PropTypes from "prop-types";

function FontSizeButton(props) {
    return (
        <div className="font-size-line">
            <button onClick={props.handleReduce} className="font-size-button">
                <img src="/static/icons/reduce_font.svg" />
            </button>
            <InterfaceText>Font Size</InterfaceText>
            <button onClick={props.handleEnlarge} className="font-size-button">
                <img src="/static/icons/enlarge_font.svg" />
            </button>
        </div>
    );
}
FontSizeButton.prototypes = {
    handleEnlarge: PropTypes.func.isRequired,
    handleReduce: PropTypes.func.isRequired,
};
export default FontSizeButton;
