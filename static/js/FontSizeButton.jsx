import React, {useContext} from "react";
import {InterfaceText} from "./Misc";
import {ReaderPanelContext} from "./context";

function FontSizeButtons() {
    const {setOption} = useContext(ReaderPanelContext);
    return (
        <div className="font-size-line">
            <button onClick={()=>setOption('fontSize', 'smaller')} className="font-size-button" aria-label={Sefaria._("Decrease font size")}>
                <img src="/static/icons/reduce_font.svg" alt={Sefaria._("Decrease font size")}/>
            </button>
            <InterfaceText>Font Size</InterfaceText>
            <button onClick={()=>setOption('fontSize', 'larger')} className="font-size-button" aria-label={Sefaria._("Increase font size")}>
                <img src="/static/icons/enlarge_font.svg" alt={Sefaria._("Increase font size")}/>
            </button>
        </div>
    );
}
export default FontSizeButtons;
