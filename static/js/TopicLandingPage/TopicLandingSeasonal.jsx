import React from 'react';
import {TopicLandingCalendar} from "./TopicLandingCalendar";
import {useState, useEffect} from "react";
import Sefaria from "../sefaria/sefaria";
import {InterfaceText} from "../Misc";


export const TopicLandingSeasonal = () => {
    const [seasonal, setSeasonal] = useState(null);

    useEffect(() => {
        Sefaria.getSeasonalTopic().then(setSeasonal);
    }, []);
    const title = seasonal?.topic?.primaryTitle;
    const description = seasonal?.topic?.description;
    const link = `/topics/${seasonal?.topic?.slug}`;
    const learnMorePrompt = (
      <a href={link}>
        {`Learn More on ${title?.en}>`}
      </a>)
    const displayStartDate = seasonal ? new Date(seasonal.display_start_date): null;
    const displayEndDate = seasonal ? new Date(seasonal.display_end_date): null;
    const displayDatePrefix = seasonal ? seasonal.display_date_prefix: null;
    const displayDateSuffix = seasonal ? seasonal.display_date_suffix: null;
    const displayDateMessage = `${displayDatePrefix ?? ''} ${title?.en} ${displayDateSuffix ?? ''}`;

    const fmt = new Intl.DateTimeFormat("en", {
      month: "long",
      day: "numeric",
    });
    const formattedDate = seasonal? fmt.formatRange(displayStartDate, displayEndDate) : null;

    return ( seasonal &&
        <div className='topic-landing-seasonal'>
            <TopicLandingCalendar
                header={{en: "Upcoming Holiday"}}
                title={title}
                description={description}
                link={link}
            />
            <div className="learn-more-prompt">
                {learnMorePrompt}
            </div>
            <div className="display-date-message">
                <InterfaceText text={{en: displayDateMessage}}/>
            </div>
            <div className='display-date'>
                <InterfaceText text={{en: formattedDate}}/>
            </div>
        </div>
    );
};