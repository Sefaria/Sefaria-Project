import React, {useContext} from "react";
import {InterfaceText} from "./Misc";
import {ReaderPanelContext} from "./context";

function FontSizeButtons() {
    const {setOption} = useContext(ReaderPanelContext);
    return (
        <div className="font-size-line">
            <button onClick={()=>setOption('fontSize', 'smaller')} className="font-size-button" data-prevent-close={true} aria-label="Decrease font size">
                <img src="/static/icons/reduce_font.svg" alt="Decrease font size"/>
            </button>
            <InterfaceText>Font Size</InterfaceText>
            <button onClick={()=>setOption('fontSize', 'larger')} className="font-size-button" data-prevent-close={true} aria-label="Increase font size">
                <img src="/static/icons/enlarge_font.svg" alt="Increase font size"/>
            </button>
        </div>
    );
}
export default FontSizeButtons;
