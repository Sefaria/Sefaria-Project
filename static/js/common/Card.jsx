import {InterfaceText} from "../Misc";
import React from "react";
const Card = ({cardTitle, cardTitleHref, oncardTitleClick, cardText, bottomLinkText, bottomLinkUrl}) => {
    return <div className="card">
                <a href={cardTitleHref} className="cardTitle" onClick={oncardTitleClick}>
                    <InterfaceText text={cardTitle}/>
                </a>
                <div className="cardDescription">
                    <InterfaceText markdown={cardText}/>
                </div>
                {bottomLinkText &&
                    <div className="bottomCardLink">
                      <a href={bottomLinkUrl}>
                        <InterfaceText text={bottomLinkText}/>
                      </a>
                    </div>
                }
            </div>
    }

export {Card}