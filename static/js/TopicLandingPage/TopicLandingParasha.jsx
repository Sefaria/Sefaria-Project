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
        <div className="topic-landing-parasha">
            <TopicLandingCalendar
                header={<InterfaceText>This Week’s Torah Portion</InterfaceText>}
                title={parashah.displayValue}
                description={parashah.description}
                link={`topics/${parashah?.topic}`}
            >
                <div className="learn-more-prompt">
                    <a href={`topics/${parashah?.topic}`}>
                        <InterfaceText text={{en: `Learn More about ${parashah.displayValue?.en} ›`,
                            he:`${Sefaria._("Learn More about")} ${parashah.displayValue?.he} ›`}}
                        />
                    </a>
                </div>
                <div className="parashah-link">
                <ParashahLink />
                </div>
                <div className="read-portion-button">
                    <a href={`/${parashah?.url}`} className="button small blue">
                        <InterfaceText>Read the Portion</InterfaceText>
                    </a>
                </div>
                <div className="browse-all-parashot-prompt">
                    <a href='/topics/category/torah-portions'><InterfaceText>Browse all Parshayot</InterfaceText></a>
                </div>
            </TopicLandingCalendar>
        </div>
    );
};