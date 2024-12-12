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
  const secondaryTopicTitle = seasonal.secondary_topic?.primaryTitle || null;
  const displayDateMessageEn = `${displayDatePrefix ?? ''} ${secondaryTopicTitle?.en ?? ''} ${displayDateSuffix ?? ''}`;
  const displayDateMessageHe = `${displayDatePrefix ?? ''} ${secondaryTopicTitle?.he ?? ''} ${displayDateSuffix ?? ''}`;
  const secondaryTopicSlug = seasonal.secondary_topic?.slug || null;


  return {
    title,
    description,
    link,
    displayStartDate,
    displayEndDate,
    displayDateMessageEn,
    displayDateMessageHe,
    secondaryTopicSlug,
    isLoading: false,
  };
};

export const TopicLandingSeasonal = () => {

    const {
    title,
    description,
    link,
    displayDateMessageEn,
    displayDateMessageHe,
    secondaryTopicSlug,
    displayStartDate,
    displayEndDate,
    isLoading,
  } = useSeasonalTopic();
    if (isLoading) return null;
      const enDateFormat = new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
  });
    const heDateFormat = new Intl.DateTimeFormat("he", {
    month: "long",
    day: "numeric",
  });

  const formattedDateEn = secondaryTopicSlug  && enDateFormat.formatRange(displayStartDate, displayEndDate);
  const formattedDateHe = secondaryTopicSlug && heDateFormat.formatRange(displayStartDate, displayEndDate);
  const learnMorePrompt = {en: `Learn More on ${title?.en}>`,
      he:`${Sefaria._("Learn More on")} ${title?.he}>`}


    return (
        <div className='topic-landing-seasonal'>
            <TopicLandingCalendar
                header={<InterfaceText>Upcoming Holiday</InterfaceText>}
                title={title}
                description={description}
                link={link}
            />
            <div className="learn-more-prompt">
                <a href={link}>
                    <InterfaceText text={learnMorePrompt}/>
                </a>
            </div>
            <div className="display-date-message">
                <a href={`/topics/${secondaryTopicSlug}`}><InterfaceText text={{en: displayDateMessageEn, he: displayDateMessageHe}}/></a>
            </div>
            <div className='display-date'>
                <InterfaceText text={{en: formattedDateEn, he:formattedDateHe}}/>
            </div>
        </div>
    );
};