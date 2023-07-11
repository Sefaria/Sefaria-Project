import React from "react";
import {InterfaceText} from "./Misc";
import PropTypes from "prop-types";

function FontSizeButton({handleReduce, handleEnlarge}) {
    return (
        <div className="font-size-line">
            <button onClick={handleReduce} className="font-size-button">
                <img src="/static/icons/reduce_font.svg" alt="Reduce font size" />
            </button>
            <InterfaceText>Font Size</InterfaceText>
            <button onClick={handleEnlarge} className="font-size-button">
                <img src="/static/icons/enlarge_font.svg" alt="Enlarge font size" />
            </button>
        </div>
    );
}
FontSizeButton.protoTypes = {
    handleEnlarge: PropTypes.func.isRequired,
    handleReduce: PropTypes.func.isRequired,
};
export default FontSizeButton;
