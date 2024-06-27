import {SearchTopMatter} from "../SearchResultList";
import React from "react";
import SearchSheetResult from "../SearchSheetResult";
const SheetsWithRefList = ({type, listItems, query, compare, searchState, onResultClick, updateAppliedOptionSort, openMobileFilters}) => {
    return <div>
                <SearchTopMatter type={type} compare={compare} updateAppliedOptionSort={updateAppliedOptionSort}
                         searchState={searchState} openMobileFilters={openMobileFilters}/>
                <div className="searchResultList">
                    {listItems.map(item => {
                            const metadata = {
                                sheetId: item.id,
                                title: item.title,
                                owner_name: item.ownerName,
                                owner_image: item.ownerImageUrl,
                                profile_url: item.ownerProfileUrl,
                                dateCreated: item.dateCreated
                            };
                            return <SearchSheetResult
                                metadata={metadata}
                                snippet={item?.summary || ""}
                                query={query}
                                key={item.id}
                                onResultClick={onResultClick}/>
                        }
                    )}
                </div>
           </div>
}

export default SheetsWithRefList;
