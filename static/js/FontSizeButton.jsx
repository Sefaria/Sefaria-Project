import React, {useContext} from "react";
import {InterfaceText} from "./Misc";
import {ReaderPanelContext} from "./context";

function FontSizeButtons() {
    const {setOption} = useContext(ReaderPanelContext);
    return (
        <div className="font-size-line">
            <div
                onClick={()=>setOption('fontSize', 'smaller')}
                className="font-size-button preventClosing"
                role="button"
                aria-label="Decrease font size"
            >
                <img src="/static/icons/reduce_font.svg" alt=""/>
            </div>
            <InterfaceText>Font Size</InterfaceText>
            <div
                onClick={()=>setOption('fontSize', 'larger')}
                className="font-size-button preventClosing"
                role="button"
                aria-label="Decrease font size"
            >
                <img src="/static/icons/enlarge_font.svg" alt=""/>
            </div>
        </div>
    );
}
export default FontSizeButtons;
