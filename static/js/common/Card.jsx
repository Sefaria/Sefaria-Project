import {InterfaceText} from "../Misc";
import React from "react";
const Card = ({cardTitle, cardTitleHref, oncardTitleClick, cardText, children}) => {
    return <div className="card">
                <a href={cardTitleHref} className="cardTitle" onClick={oncardTitleClick}>
                    <InterfaceText text={cardTitle}/>
                </a>
                <div className="cardDescription">
                    <InterfaceText markdown={cardText}/>
                </div>
                {children}
            </div>
}

export { Card }
