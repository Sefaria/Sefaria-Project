import {InterfaceText} from "../Misc";
import React from "react";
import { handleKeyboardClick } from "./Button";
const Card = ({cardTitle, cardTitleHref, oncardTitleClick, cardText, bottomLinkText, bottomLinkUrl, analyticsEventName, analyticsLinkType}) => {
    cardTitleHref = Sefaria.activeModule === Sefaria.SHEETS_MODULE ? `/sheets/${cardTitleHref}` : cardTitleHref;
    return <div className="card">
                <a href={cardTitleHref}
                className="cardTitle" onClick={oncardTitleClick}
                data-anl-text={cardTitle?.en}
                data-anl-event={analyticsEventName ? `${analyticsEventName}:click` : null}
                data-target-module={Sefaria.activeModule}
                onKeyDown={handleKeyboardClick()}
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
                        onKeyDown={handleKeyboardClick()}
                      >
                      <InterfaceText markdown={{en: bottomLinkText.en, he: bottomLinkText.he}} disallowedMarkdownElements={['p', 'a']}/>
                      </a>
                    </div>
                }
            </div>
    }

export {Card}
