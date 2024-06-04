import {InterfaceText, ResponsiveNBox} from "../Misc";
import React from "react";
import Sefaria from "../sefaria/sefaria";
import {Box} from "./GenericComponents";
const SheetsTopicsTOC = ({setNavTopic}) => {
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
    <div className="readerNavCategories">
        <div className="sheetsFont">Browse by Topic</div>
      <ResponsiveNBox content={categoryListings} initialWidth={1000} />
    </div>
  );
}

const SheetsTopicsCalendar = () => {
    return "Calendar Placeholder"
}

const SheetsTopics = ({setNavTopic}) => {
    return <div><SheetsTopicsTOC setNavTopic={setNavTopic}/><SheetsTopicsCalendar/></div>
}

export default SheetsTopics;