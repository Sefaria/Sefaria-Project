import { ResponsiveNBox } from "./Misc";
import React from "react";
import { getTopicTOCListings } from "./TopicsPage";

const SheetsTopicsTOC = () => {
    const openCat = () => {alert("Open")}
    const categoryListings = getTopicTOCListings(openCat);
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

const SheetsTopics = () => {
    return <div><SheetsTopicsTOC/><SheetsTopicsCalendar/></div>
}

export default SheetsTopics;