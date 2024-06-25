import {SearchTopMatter} from "../SearchResultList";
import React from "react";
import SheetResult from "./SheetResult";

const SheetsWithRefList = ({type, listItems, query, compare, searchState, onResultClick, updateAppliedOptionSort, openMobileFilters}) => {
    return <div>
                <SearchTopMatter type={type} compare={compare} updateAppliedOptionSort={updateAppliedOptionSort}
                         searchState={searchState} openMobileFilters={openMobileFilters}/>
                <div className="searchResultList">
                    {listItems.map(item =>
                        // <SearchSheetResult
                        //   data={item}
                        //   query={query}
                        //   key={item.id}
                        //   onResultClick={onResultClick} />
                        <SheetResult href={item.sheetUrl} clean_title={item.title} handleSheetClick={onResultClick}
                        snippetMarkup={{}} profile_url={item.ownerProfileUrl} owner_name={item.ownerName} owner_image={item.ownerImageUrl}/>
                    )}
                </div>
           </div>
}

export default SheetsWithRefList;
