import {InterfaceText} from "../Misc";
import React, {useEffect, useState} from "react";
import Sefaria from "../sefaria/sefaria";
import {Card} from "./GenericComponents";
const getParashah = () => { return Sefaria.calendars.find(element => element.title && element.title.en === "Parashat Hashavua"); }
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
    const parashah = getParashah();
    const parashahTitle = parashah.displayValue;
    const parashahDesc = parashah.description;
    return <Card cardTitleHref={`/topics/${parashah.topic}`}
                    cardTitle={parashahTitle}
                    cardText={parashahDesc}/>;
}

const SheetsHoliday = () => {
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
    const parashah = getParashah(); // check
    return <div className="sheetsTopicsCalendar">
                {parashah?.topic && <SheetsWrapper title="Parashat HaShavua"><SheetsParashah handleClick={handleClick}/></SheetsWrapper>}
                <SheetsWrapper title="Upcoming Holiday"><SheetsHoliday handleClick={handleClick}/></SheetsWrapper>
          </div>
}

export { SheetsTopicsCalendar, SheetsTopicsTOC }