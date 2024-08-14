import {InterfaceText} from "../Misc";
import React from "react";
const Card = ({cardTitle, cardTitleHref, oncardTitleClick, cardText}) => {
    return <div className="navBlock">
                <a href={cardTitleHref} className="navBlockTitle" onClick={oncardTitleClick}>
                    <InterfaceText text={cardTitle}/>
                </a>
                <div className="navBlockDescription">
                    <InterfaceText text={cardText}/>
                </div>
            </div>
}

export { Card }
