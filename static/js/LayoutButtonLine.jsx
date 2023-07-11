import React from "react";
import {InterfaceText} from "./Misc";
import PropTypes from "prop-types";
import {getLayoutOptions} from './constants'

function LayoutButtonLine({layoutState, sourceDir, layout, onClick}) {
    const layoutOptions = getLayoutOptions(sourceDir)[layoutState];
    const layoutButton = (layoutOption) => {
        const path = `/static/icons/${layoutState}-${layoutOption}.svg`;
        return (
            <button
                key={layoutOption}
                className={`layout-button ${layout === layoutOption ? 'checked' : ''}`}
                onClick={() => onClick(layoutOption)}
                style={{"--url": `url(${path})`}}
            />
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
