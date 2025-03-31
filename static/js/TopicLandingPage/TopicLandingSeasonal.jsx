import React from 'react';
import {TopicLandingCalendar} from "./TopicLandingCalendar";
import {useState, useEffect} from "react";
import Sefaria from "../sefaria/sefaria";
import {InterfaceText} from "../Misc";

const createDisplayDateMessage = (displayDatePrefix, link, secondaryTopicTitleString, displayDateSuffix) => {
  return (
    <>
      {displayDatePrefix ?? ''}{' '}
      {secondaryTopicTitleString ? (
        <a
          href={link}
          data-anl-link_type="topic"
          data-anl-text={secondaryTopicTitleString}
          data-anl-event="navto_topic:click"
        >
          {secondaryTopicTitleString}
        </a>
      ) : ''}{' '}
      {displayDateSuffix ?? ''}
    </>
  );
};
const createTimeZoneAgnosticDate = (dateString)=>{
  if (!dateString) return null;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)); // Use noon UTC to avoid time shifts (most time zones are 12 hours off from UTC)
}

const useSeasonalTopic = () => {
  const [seasonal, setSeasonal] = useState(null);

  useEffect(() => {
    Sefaria.getSeasonalTopic().then(setSeasonal);
  }, []);

  if (!seasonal) return { isLoading: true };

  return {
    title: seasonal.topic?.primaryTitle,
    description: seasonal.topic?.description,
    link: `/topics/${seasonal.topic?.slug}`,
    displayStartDate: createTimeZoneAgnosticDate(seasonal.display_start_date),
    displayEndDate: createTimeZoneAgnosticDate(seasonal.display_end_date),
    displayDatePrefix: seasonal.display_date_prefix || '',
    displayDateSuffix: seasonal.display_date_suffix || '',
    secondaryTopicTitle: seasonal.secondary_topic?.primaryTitle || null,
    secondaryTopicSlug: seasonal.secondary_topic?.slug || null,
    isLoading: false,
  };
};

export const TopicLandingSeasonal = () => {

    const {
    title,
    description,
    link,
    displayStartDate,
    displayEndDate,
    displayDateSuffix,
    displayDatePrefix,
    secondaryTopicTitle,
    secondaryTopicSlug,
    isLoading,
  } = useSeasonalTopic();
    if (isLoading) return null;
  const displayDateMessageEn = createDisplayDateMessage(displayDatePrefix, link, secondaryTopicTitle?.en, displayDateSuffix);
  const displayDateMessageHe = createDisplayDateMessage(displayDatePrefix, link, secondaryTopicTitle?.he, displayDateSuffix);
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
  const learnMorePrompt = {en: `Learn more about ${title?.en} ›`,
      he:`${Sefaria._("Learn more about")} ${title?.he} ›`};
  const exploreCalendarPrompt = "Explore the Jewish Calendar";


    return (
        <div className='topic-landing-seasonal' data-anl-feature_name="Calendar">
            <TopicLandingCalendar
                header={<InterfaceText>On the Jewish Calendar</InterfaceText>}
                title={title}
                description={description}
                link={link}
            />
            <div className="learn-more-prompt">
                <a href={link}
                   data-anl-link_type="topic"
                   data-anl-text={learnMorePrompt.en}
                   data-anl-event="navto_topic:click"
                >
                    <InterfaceText text={learnMorePrompt}/>
                </a>
            </div>
            <div className="seasonal-bottom-section">
                <div className="display-date-message">
                    <InterfaceText text={{en: displayDateMessageEn, he: displayDateMessageHe}}/>
                </div>
                <div className='display-date'>
                    <InterfaceText text={{en: formattedDateEn, he: formattedDateHe}}/>
                </div>
                <div className="explore-calendar-prompt">
                    <a href='/topics/category/jewish-calendar2'
                       data-anl-link_type="category"
                       data-anl-text={exploreCalendarPrompt}
                       data-anl-event="navto_topic:click"
                    >
                        <InterfaceText>{exploreCalendarPrompt}</InterfaceText>
                    </a>
                </div>
            </div>
        </div>
    );
};