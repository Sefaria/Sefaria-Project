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
        <TOCCardsWrapper title="Browse by Topic">{categoryListings}</TOCCardsWrapper>
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
  const [holiday, setHoliday] = useState({});
  useEffect(() => {
    Sefaria.getUpcomingDay('holiday').then(setHoliday);
  }, []);
  if (Object.keys(holiday).length === 0) {
    return <div className="navBlock">Loading...</div>
  }
  return <TopicTOCCard topic={holiday} setTopic={handleClick} showDescription={true}/>;
}

const SheetsTopicsCalendar = ({handleClick}) => {
    return <div className="sheetsTopicsCalendar table">
                <TOCCardsWrapper title="This Week's Torah Portion"><SheetsParashah handleClick={handleClick}/></TOCCardsWrapper>
                <TOCCardsWrapper title="Upcoming Holiday"><SheetsHoliday handleClick={handleClick}/></TOCCardsWrapper>
          </div>
}

export { SheetsTopicsCalendar, SheetsTopicsTOC }
