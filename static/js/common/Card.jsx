import {InterfaceText} from "../Misc";
import React from "react";
const Card = ({cardTitle, cardTitleHref, oncardTitleClick, cardText, bottomLinkText, bottomLinkUrl, analyticsEventName, analyticsLinkType}) => {
    cardTitleHref = Sefaria.activeModule === "sheets" ? `/sheets/${cardTitleHref}` : cardTitleHref;
    return <div className="card">
                <a href={cardTitleHref} 
                className="cardTitle" onClick={oncardTitleClick}
                data-anl-text={cardTitle?.en}
                data-anl-event={analyticsEventName ? `${analyticsEventName}:click` : null}
                data-attr-module={Sefaria.activeModule}
                >
                    <InterfaceText text={cardTitle}/>
                </a>
                <div className="cardDescription">
                    <InterfaceText markdown={cardText}/>
                </div>
                {bottomLinkText &&
                    <div className="bottomCardLink">
                      <a href={bottomLinkUrl}
                        data-anl-text={bottomLinkText.en}
                        data-anl-event={analyticsEventName ? `${analyticsEventName}:click` : null}
                        data-attr-module={Sefaria.activeModule}
                      >
                        <InterfaceText text={bottomLinkText}/>
                      </a>
                    </div>
                }
            </div>
    }

export {Card}