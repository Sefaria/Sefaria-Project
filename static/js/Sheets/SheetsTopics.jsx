import {InterfaceText, ResponsiveNBox} from "../Misc";
import React, {useEffect, useState} from "react";
import Sefaria from "../sefaria/sefaria";
import {Card} from "./GenericComponents";

const getInterfaceLang = () => Sefaria.interfaceLang === "english" ? 'en' : 'he';

const SheetsTopicsTOC = ({handleClick}) => {
    const categoryListings = Sefaria.topic_toc.map(cat => {
        const cardTitleChildren = <InterfaceText text={cat}/>;
        const cardTextChildren = <InterfaceText text={cat.categoryDescription}/>
        return <Card cardTitleHref={`/topics/category/${cat.slug}`}
                    cardTitleChildren={cardTitleChildren}
                    cardTextChildren={cardTextChildren}
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
    const parashahTitle = <InterfaceText>{parashah.displayValue[getInterfaceLang()]}</InterfaceText>;
    const parashahDesc = <InterfaceText>{parashah.description[getInterfaceLang()]}</InterfaceText>;
    return <Card cardTitleHref={`/${parashah.url}`}
                    cardTitleChildren={parashahTitle}
                    cardTextChildren={parashahDesc}/>;
}

const SheetsHoliday = ({handleClick}) => {
    const [holidayTitle, setHolidayTitle] = useState("");
    const [holidayDesc, setHolidayDesc] = useState("");
    const [holidayURL, setHolidayURL] = useState("");
    const [holiday, setHoliday] = useState({});
    useEffect( () => {
        async function fetchData() {
            await Sefaria.getNextHoliday();
            const holiday = Sefaria._holidays['next'];
            setHolidayTitle(holiday.primaryTitle[getInterfaceLang()]);
            setHolidayURL(`/topics/${holiday.slug}`)
            setHolidayDesc(holiday.description[getInterfaceLang()]);
            setHoliday(holiday);
        }
        fetchData();
    }, []);
    if (holidayURL === "") {
        return <div className="navBlock">Loading...</div>
    }
    return <Card cardTitleHref={holidayURL}
                 cardTitleChildren={<InterfaceText>{holidayTitle}</InterfaceText>}
                 cardTextChildren={<InterfaceText>{holidayDesc}</InterfaceText>}
                 oncardTitleClick={(e) => handleClick(e, holiday.slug, holiday.en, holiday.he)}/>;
}
const SheetsTopicsCalendar = ({setNavTopic}) => {
    return <div className="sheetsTopicsCalendar">
                <SheetsWrapper title="Parashat HaShavua"><SheetsParashah setNavTopic={setNavTopic}/></SheetsWrapper>
                <SheetsWrapper title="Upcoming Holiday"><SheetsHoliday setNavTopic={setNavTopic}/></SheetsWrapper>
          </div>
}

export { SheetsTopicsCalendar, SheetsTopicsTOC }