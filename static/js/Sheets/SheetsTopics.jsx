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
    const [holiday, setHoliday] = useState({});
    useEffect( () => {
        async function fetchData() {
            await Sefaria.getNextHoliday();
            const holiday = Sefaria._holidays['next'];
            setHoliday({...holiday});
        }
        fetchData();
    }, []);
    if (Object.keys(holiday).length === 0) {
        return <div className="navBlock">Loading...</div>
    }
    return <Card cardTitleHref={`/topics/${holiday.slug}`}
                 cardTitle={holiday.primaryTitle}
                 cardText={holiday.description}/>;
}
const SheetsTopicsCalendar = ({handleClick}) => {
    return <div className="sheetsTopicsCalendar">
                <SheetsWrapper title="Parashat HaShavua"><SheetsParashah handleClick={handleClick}/></SheetsWrapper>
                <SheetsWrapper title="Upcoming Holiday"><SheetsHoliday handleClick={handleClick}/></SheetsWrapper>
          </div>
}

export { SheetsTopicsCalendar, SheetsTopicsTOC }