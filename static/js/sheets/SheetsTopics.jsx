import React, {useEffect, useState} from "react";
import Sefaria from "../sefaria/sefaria";
import {Card} from "../common/Card";
import {TopicTOCCard} from "../common/TopicTOCCard";

const SheetsTopicsTOC = ({handleClick}) => {
    const categoryListings = Sefaria.topic_toc.map(((cat, i) => {
        return <TopicTOCCard cardTitleHref={`/topics/category/${cat.slug}`}
                             topic={cat}
                             setTopic={(e) => handleClick(e, cat.slug, cat.primaryTitle.en, cat.primaryTitle.he)}/>;
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
        Sefaria.getUpcomingDay('parasha').then(setParashah);
    }, []);
    const parashahTitle = parashah.displayValue;
    const parashahDesc = parashah.description;
    return <Card    cardTitleHref={`/topics/${parashah.topic}`}
                    cardTitle={parashahTitle}
                    cardText={parashahDesc}
                    oncardTitleClick={(e) => handleClick(e, parashah.topic, parashahTitle.en, parashahTitle.he)}/>;
}

const SheetsHoliday = ({handleClick}) => {
    const [holiday, setHoliday] = useState({});
    useEffect( () => {
        Sefaria.getUpcomingDay('holiday').then(setHoliday);
    }, []);
    if (Object.keys(holiday).length === 0) {
        return <div className="navBlock">Loading...</div>
    }
    return <Card cardTitleHref={`/topics/${holiday.slug}`}
                 cardTitle={holiday.primaryTitle}
                 cardText={holiday.description}
                 oncardTitleClick={(e) => handleClick(e, holiday.slug, holiday.primaryTitle.en, holiday.primaryTitle.he)}/>;
}
const SheetsTopicsCalendar = ({handleClick}) => {
    return <div className="sheetsTopicsCalendar table">
                <TOCCardsWrapper title="This Week's Torah Portion"><SheetsParashah handleClick={handleClick}/></TOCCardsWrapper>
                <TOCCardsWrapper title="Upcoming Holiday"><SheetsHoliday handleClick={handleClick}/></TOCCardsWrapper>
          </div>
}

export { SheetsTopicsCalendar, SheetsTopicsTOC }