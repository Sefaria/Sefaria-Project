import {InterfaceText, ResponsiveNBox} from "../Misc";
import React from "react";
import Sefaria from "../sefaria/sefaria";


const SheetsTopicsTOC = ({setNavTopic}) => {
    const categoryListings = Sefaria.topic_toc.map(cat => {
        const openCat = e => {
            e.preventDefault();
            setNavTopic(cat.slug, {en: cat.en, he: cat.he})
        }
        return (
            <div className="navBlock">
                <a href={`/topics/category/${cat.slug}`} className="navBlockTitle" onClick={openCat}>
              <InterfaceText text={cat} />
            </a>
            <div className="navBlockDescription">
              <InterfaceText text={cat.categoryDescription} />
            </div>
          </div>
        );
    });
    return (
    <div className="readerNavCategories">
        <div id="sheetsFont">Browse by Topic</div>
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