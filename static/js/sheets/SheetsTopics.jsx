import React, {useEffect, useState} from "react";
import Sefaria from "../sefaria/sefaria";
import {Card} from "../shared/Card";
const SheetsTopicsTOC = ({handleClick}) => {
    const categoryListings = Sefaria.topic_toc.map(cat => {
        return <Card cardTitleHref={`/topics/category/${cat.slug}`}
                    cardTitle={cat}
                    cardText={cat.categoryDescription}
                    oncardTitleClick={(e) => handleClick(e, cat.slug, cat.en, cat.he)}/>;
    });
    return (
    <div className="sheetsTopicTOC">
        <SheetsWrapper title="Browse by Topic">{categoryListings}</SheetsWrapper>
    </div>
  );
}

const SheetsWrapper = ({title, children}) => {
    return <div className="sheetsWrapper">
                <div className="sheetsFont">{title}</div>
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
    return <div className="sheetsTopicsCalendar">
                <SheetsWrapper title="Parashat HaShavua"><SheetsParashah handleClick={handleClick}/></SheetsWrapper>
                <SheetsWrapper title="Upcoming Holiday"><SheetsHoliday handleClick={handleClick}/></SheetsWrapper>
          </div>
}

export { SheetsTopicsCalendar, SheetsTopicsTOC }