import React from 'react';
import {TopicLandingCalendar} from "./TopicLandingCalendar";
import {useState, useEffect} from "react";
import {ParashahLink} from "../NavSidebar";
import {InterfaceText} from "../Misc";
import Sefaria from "../sefaria/sefaria";


export const TopicLandingParasha = () => {
    const [parashah, setParashah] = useState({});

    useEffect(() => {
        Sefaria.getUpcomingDay('parasha').then(setParashah);
    }, []);


    return (
        <div className="topic-landing-parasha" data-anl-feature_name="Parashah">
            <TopicLandingCalendar
                header={<InterfaceText>This Week’s Torah Portion</InterfaceText>}
                title={parashah.displayValue}
                description={parashah.description}
                link={`topics/${parashah?.topic}`}
            >
                <div className="learn-more-prompt">
                    <a href={`topics/${parashah?.topic}`}
                      data-anl-link_type="topic"
                      data-anl-text={`Learn More about ${parashah.displayValue?.en} ›`}
                      data-anl-event="navto_topic:click">
                        <InterfaceText text={{en:`Learn More about ${parashah.displayValue?.en} ›`,
                            he: `${Sefaria._("Learn More about")} ${parashah.displayValue?.he} ›`}} />
                    </a>
                </div>
                <div className="parashah-link">
                <span data-anl-link_type="open reader"
                      data-anl-event="navto_topic:click">
                    <ParashahLink />
                </span>
                </div>
                <div className="read-portion-button">
                    <a href={`/${parashah?.url}`} className="button small blue"
                    data-anl-link_type="open reader"
                    data-anl-text="Read the Portion"
                    data-anl-event="navto_topic:click"
                    >
                        <InterfaceText>Read the Portion</InterfaceText>
                    </a>
                </div>
                <div className="browse-all-parashot-prompt">
                    <a href='/topics/category/torah-portions'
                    data-anl-link_type="category"
                    data-anl-text="Browse All Torah Portions"
                    data-anl-event="navto_topic:click"
                    >
                        <InterfaceText>Browse All Torah Portions</InterfaceText></a >
                </div>
            </TopicLandingCalendar>
        </div>
    );
};