import React, {useEffect, useState} from "react";
import Sefaria from "../sefaria/sefaria";
import {TopicTOCCard} from "../common/TopicTOCCard";

const SheetsTopicsTOC = ({handleClick}) => {
    const categoryListings = Sefaria.topic_toc.map(((cat, i) => {
        return <TopicTOCCard topic={cat}
                             setNavTopic={handleClick}/>;
    }));
    return (
      <div className="sheetsTopicTOC">
        <TOCCardsWrapper title={Sefaria._("sheets_home_page_topics_toc.browse_topic_categories")}>{categoryListings}</TOCCardsWrapper>
      </div>
    );
}

const TOCCardsWrapper = ({title, children}) => {
    return <div className="TOCCardsWrapper table">
                <div className="sheetsHomepageSectionTitle">{title}</div>
                {children}
           </div>
}

const SheetsParashah = ({handleClick}) => {
    const [parashah, setParashah] = useState({});
    useEffect(() => {
        Sefaria.getUpcomingDay('parasha').then((data) => {
          data.primaryTitle = data.displayValue;
          data.slug = data.topic;
          setParashah(data);
        });
    }, []);
    if (Object.keys(parashah).length === 0) {
      return <div className="navBlock">Loading...</div>
    }
    return <TopicTOCCard topic={parashah} setTopic={handleClick} showDescription={true}/>;
}

const SheetsHoliday = ({handleClick}) => {
  const [holiday, setHoliday] = useState(null);
  useEffect(() => {
    Sefaria.getUpcomingDay('holiday').then(data => {setHoliday(data?.topic || null)});
  }, []);
  if (Object.keys(holiday || {}).length === 0) {
    return <div className="navBlock">Loading...</div>
  }
  return <TopicTOCCard topic={holiday} setTopic={handleClick} showDescription={true}/>;
}

const SheetsTopicsCalendar = ({handleClick}) => {
    return (
      <div className="sheetsTopicsCalendar table">
                  <TOCCardsWrapper title={Sefaria._("common.this_week_s_torah_portion")}><SheetsParashah handleClick={handleClick}/></TOCCardsWrapper>
                  <TOCCardsWrapper title={Sefaria._("common.on_the_jewish_calendar")}><SheetsHoliday handleClick={handleClick}/></TOCCardsWrapper>
            </div>
    );
}

export { SheetsTopicsCalendar, SheetsTopicsTOC }
