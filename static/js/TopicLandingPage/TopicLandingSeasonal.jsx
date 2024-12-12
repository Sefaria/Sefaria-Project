import React from 'react';
import {TopicLandingCalendar} from "./TopicLandingCalendar";
import {useState, useEffect} from "react";
import Sefaria from "../sefaria/sefaria";
import {InterfaceText} from "../Misc";

const useSeasonalTopic = () => {
  const [seasonal, setSeasonal] = useState(null);

  useEffect(() => {
    Sefaria.getSeasonalTopic().then(setSeasonal);
  }, []);

  if (!seasonal) return { isLoading: true };

  const title = seasonal.topic?.primaryTitle;
  const description = seasonal.topic?.description;
  const link = `/topics/${seasonal.topic?.slug}`;

  const displayStartDate = new Date(seasonal.display_start_date);
  const displayEndDate = new Date(seasonal.display_end_date);
  const displayDatePrefix = seasonal.display_date_prefix || '';
  const displayDateSuffix = seasonal.display_date_suffix || '';
  const displayDateMessage = `${displayDatePrefix} ${title?.en} ${displayDateSuffix}`;
  const secondaryTopicSlug = seasonal.secondary_topic?.slug || null;


  return {
    title,
    description,
    link,
    displayStartDate,
    displayEndDate,
    displayDateMessage,
    secondaryTopicSlug,
    isLoading: false,
  };
};

export const TopicLandingSeasonal = () => {

    const {
    title,
    description,
    link,
    displayDateMessage,
    secondaryTopicSlug,
    displayStartDate,
    displayEndDate,
    isLoading,
  } = useSeasonalTopic();
    if (isLoading) return null;
      const fmt = new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
  });

  const formattedDate = fmt.formatRange(displayStartDate, displayEndDate);
  const learnMorePrompt = `Learn More on ${title?.en}>`;


    return (
        <div className='topic-landing-seasonal'>
            <TopicLandingCalendar
                header={{en: "Upcoming Holiday"}}
                title={title}
                description={description}
                link={link}
            />
            <div className="learn-more-prompt">
                <a href={link}>
                    {learnMorePrompt}
                </a>
            </div>
            <div className="display-date-message">
                <a href={`/topics/${secondaryTopicSlug}`}><InterfaceText text={{en: displayDateMessage}}/></a>
            </div>
            <div className='display-date'>
                <InterfaceText text={{en: formattedDate}}/>
            </div>
        </div>
    );
};