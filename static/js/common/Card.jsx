import {InterfaceText} from "../Misc";
import React from "react";
import Util from "../sefaria/util";
import Sefaria from "../sefaria/sefaria";

const Card = ({cardTitle, cardTitleHref, oncardTitleClick, cardText, bottomLinkText, bottomLinkUrl, analyticsEventName, analyticsLinkType, additionalContent: AdditionalContent=null}) => {
    return <div className="card">
                <a href={cardTitleHref}
                className="cardTitle" onClick={oncardTitleClick}
                data-anl-text={cardTitle?.en}
                data-anl-event={analyticsEventName ? `${analyticsEventName}:click` : null}
                data-target-module={Sefaria.activeModule}
                onKeyDown={(e) => Util.handleKeyboardClick(e)}
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
                        onKeyDown={(e) => Util.handleKeyboardClick(e)}
                      >
                      <InterfaceText markdown={{en: bottomLinkText.en, he: bottomLinkText.he}} disallowedMarkdownElements={['p', 'a']}/>
                      </a>
                    </div>
                }
                {AdditionalContent && <AdditionalContent/>}
            </div>
    }

export {Card}
