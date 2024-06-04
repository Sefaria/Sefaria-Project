import { ResponsiveNBox } from "../Misc";
import React from "react";
import { getTopicTOCListings } from "../TopicsPage";

const SheetsTopicsTOC = ({setNavTopic}) => {
    const categoryListings = getTopicTOCListings(setNavTopic);
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