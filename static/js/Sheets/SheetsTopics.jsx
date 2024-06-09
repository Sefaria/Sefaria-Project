import {InterfaceText} from "../Misc";
import React, {useEffect, useState} from "react";
import Sefaria from "../sefaria/sefaria";
import {Card} from "./GenericComponents";

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
    const parashah = Sefaria.calendars.find(element => element.title && element.title.en === "Parashat Hashavua");
    const parashahTitle = parashah.displayValue;
    const parashahDesc = parashah.description;
    return <Card cardTitleHref={`/${parashah.url}`}
                    cardTitle={parashahTitle}
                    cardText={parashahDesc}/>;
}

const SheetsHoliday = ({handleClick}) => {
    const [holidayTitle, setHolidayTitle] = useState({});
    const [holidayDesc, setHolidayDesc] = useState({});
    const [holidayURL, setHolidayURL] = useState("");
    const [holiday, setHoliday] = useState({});
    useEffect( () => {
        async function fetchData() {
            await Sefaria.getNextHoliday();
            const holiday = Sefaria._holidays['next'];
            setHolidayTitle(holiday.primaryTitle);
            setHolidayURL(`/topics/${holiday.slug}`)
            setHolidayDesc(holiday.description);
            setHoliday(holiday);
        }
        fetchData();
    }, []);
    if (holidayURL === "") {
        return <div className="navBlock">Loading...</div>
    }
    return <Card cardTitleHref={holidayURL}
                 cardTitle={holidayTitle}
                 cardText={holidayDesc}
                 oncardTitleClick={(e) => handleClick(e, holiday.slug, holiday.en, holiday.he)}/>;
}
const SheetsTopicsCalendar = ({setNavTopic}) => {
    return <div className="sheetsTopicsCalendar">
                <SheetsWrapper title="Parashat HaShavua"><SheetsParashah setNavTopic={setNavTopic}/></SheetsWrapper>
                <SheetsWrapper title="Upcoming Holiday"><SheetsHoliday setNavTopic={setNavTopic}/></SheetsWrapper>
          </div>
}

export { SheetsTopicsCalendar, SheetsTopicsTOC }