import {InterfaceText} from "../Misc";
import React from "react";
const Card = ({cardTitle, cardTitleHref, oncardTitleClick, cardText, bottomLinkText, bottomLinkUrl, analyticsEventName, analyticsLinkType}) => {
    return <div className="card">
                <a href={cardTitleHref} 
                className="cardTitle" onClick={oncardTitleClick}
                data-anl-text={cardTitle?.en}
                data-anl-event={analyticsEventName ? `${analyticsEventName}:click` : null}
                data-target-module={Sefaria.activeModule}
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
                        data-target-module={Sefaria.activeModule}
                      >
                      <InterfaceText markdown={{en: bottomLinkText.en, he: bottomLinkText.he}} disallowedMarkdownElements={['p', 'a']}/>
                      </a>
                    </div>
                }
            </div>
    }

export {Card}
