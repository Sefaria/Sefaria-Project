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

    const parashahTitle = parashah.displayValue;
    const parashahDesc = parashah.description;
    const parashahTopicLink = `topics/${parashah?.topic}`;
    const parashahRefLink = `/${parashah?.url}`;
    const learnMorePrompt = {en: `Learn More about ${parashahTitle?.en} ›`,
        he:`${Sefaria._("Learn More about")} ${parashahTitle?.he} ›`}


    return (
        <div className="topic-landing-parasha">
        <TopicLandingCalendar
            header={<InterfaceText>This Week’s Torah Portion</InterfaceText>}
            title={parashahTitle}
            description={parashahDesc}
            link={parashahTopicLink}
        >
            <div className="learn-more-prompt">
                <a href={parashahTopicLink}>
                    <InterfaceText text={learnMorePrompt}/>
                </a>
            </div>
            <div className="parashah-link">
            <ParashahLink />
            </div>
            <div className="read-portion-button">
                <a href={parashahRefLink} className="button small blue">
                    <InterfaceText>Read the Portion</InterfaceText>
                </a>
            </div>
            <div className="browse-all-parashot-prompt">
                <a href='/category/torah-portions'><InterfaceText>Browse all Parshayot</InterfaceText></a>
            </div>
        </TopicLandingCalendar>
        </div>
    );
};