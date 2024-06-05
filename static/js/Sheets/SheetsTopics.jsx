import {InterfaceText, ResponsiveNBox} from "../Misc";
import React from "react";
import Sefaria from "../sefaria/sefaria";
import {Box} from "./GenericComponents";
const SheetsTopicsTOC = ({setNavTopic, initialWidth}) => {
    const categoryListings = Sefaria.topic_toc.map(cat => {
        const openCat = e => {
            e.preventDefault();
            setNavTopic(cat.slug, {en: cat.en, he: cat.he})
        }
        const boxTitleChildren = <InterfaceText text={cat}/>;
        const boxTextChildren = <InterfaceText text={cat.categoryDescription}/>
        return <Box boxTitleHref={`/topics/category/${cat.slug}`}
                    boxTitleChildren={boxTitleChildren}
                    boxTextChildren={boxTextChildren}
                    onBoxTitleClick={openCat}/>;
    });
    return (
    <div className="sheetsTopicTOC">
        <SheetsWrapper title="Browse by Topic"><ResponsiveNBox content={categoryListings} initialWidth={initialWidth} /></SheetsWrapper>
    </div>
  );
}

const SheetsWrapper = ({title, children}) => {
    return <div>
                <div className="sheetsFont">{title}</div>
                {children}
           </div>
}

const SheetsParashah = () => {
    return <div>A</div>
}

const SheetsHoliday = () => {
    return <div>A</div>
}
const SheetsTopicsCalendar = () => {
    return <div className="sheetsTopicsCalendar">
                <SheetsWrapper title="Parashat HaShavua"><SheetsParashah/></SheetsWrapper>
                <SheetsWrapper title="Upcoming Holiday"><SheetsHoliday/></SheetsWrapper>
          </div>
}

export { SheetsTopicsCalendar, SheetsTopicsTOC }