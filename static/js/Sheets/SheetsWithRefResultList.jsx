import {SearchTopMatter} from "../SearchResultList";
import React from "react";

const SheetsWithRefResultList = ({query, type, listItems, compare, searchState, onResultClick, updateAppliedOptionSort,
                                 registerAvailableFilters, updateTotalResults, openMobileFilters}) => {
    return <div>
                <SearchTopMatter type={type} compare={compare} updateAppliedOptionSort={updateAppliedOptionSort}
                         searchState={searchState} openMobileFilters={openMobileFilters}/>
                <div className="searchResultList">
                    {listItems}
                </div>
           </div>
}
