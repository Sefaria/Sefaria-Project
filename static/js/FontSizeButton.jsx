import React, {useContext} from "react";
import {InterfaceText} from "./Misc";
import {ReaderPanelContext} from "./context";
import Sefaria from './sefaria/sefaria';

function FontSizeButtons() {
    const {setOption} = useContext(ReaderPanelContext);
    return (
        <div className="font-size-line">
            <button onClick={()=>setOption('fontSize', 'smaller')} className="font-size-button" aria-label={Sefaria._("font_size_button.decrease_font_size")}>
                <img src="/static/icons/reduce_font.svg" alt={Sefaria._("font_size_button.decrease_font_size")}/>
            </button>
            <InterfaceText>font_size_button.font_size</InterfaceText>
            <button onClick={()=>setOption('fontSize', 'larger')} className="font-size-button" aria-label={Sefaria._("font_size_button.increase_font_size")}>
                <img src="/static/icons/enlarge_font.svg" alt={Sefaria._("font_size_button.increase_font_size")}/>
            </button>
        </div>
    );
}
export default FontSizeButtons;
