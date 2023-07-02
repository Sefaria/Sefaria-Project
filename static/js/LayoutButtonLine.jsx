import React from "react";
import {InterfaceText} from "./Misc";
import PropTypes from "prop-types";
import {getLayoutOptions} from './constants'

function LayoutButtonLine(props) {
    const layoutState = props.layoutState;
    const layoutOptions = getLayoutOptions(props.sourceDir)[layoutState];
    const layoutButton = (layoutOption) => {
        return (
        <button
            key={layoutOption}
            className={`layout-button ${props.layout === layoutOption ? 'checked' : ''}`}
            onClick={() => props.onClick(layoutOption)}
        >
            <img src={`/static/icons/${layoutState}-${layoutOption}.svg`} />
        </button>
        );
    };
    return (
        <div className="layout-button-line">
            <InterfaceText>Layout</InterfaceText>
            <div className="layout-options">
                {layoutOptions.map(option => layoutButton(option))}
            </div>
        </div>
    );
}
LayoutButtonLine.proprtypes = {
    layoutState: PropTypes.string.isRequired,
    layout: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired,
    sourceDir: PropTypes.string.isRequired,
};
export default LayoutButtonLine;
