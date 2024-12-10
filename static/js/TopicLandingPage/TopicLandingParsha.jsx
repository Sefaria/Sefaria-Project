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
    const learnMorePrompt = (
      <a href={parashahTopicLink}>
        {`Learn More on Parashat ${parashahTitle?.en}>`}
      </a>
    );
    const readPortionButton = (
        <a href={parashahRefLink} className="button small blue">
            <InterfaceText text={{en: 'Read the Portion'}}/>
        </a>
    )

    return (
        <div className="topic-landing-parasha">
        <TopicLandingCalendar
            header={{en: "This Week’s Torah Portion"}}
            title={parashahTitle}
            description={parashahDesc}
            link={parashahTopicLink}
        >
            <div className="learn-more-prompt">
                {learnMorePrompt}
            </div>
            <div className="parashah-link">
            <ParashahLink />
            </div>
            <div className="read-portion-button">
                {readPortionButton}
            </div>
            <div className="browse-all-parashot-prompt">
                <a href='/category/torah-portions'><InterfaceText text={{en: "Browse all Parshayot"}}/></a>
            </div>
        </TopicLandingCalendar>
        </div>
    );
};