import SearchPage from "../SearchPage";
import SheetsWithRefList from "./SheetsWithRefList";
import Sefaria from "../sefaria/sefaria";
import {useEffect, useState} from "react";
const SheetsWithRefPage = ({srefs}) => {
    const [sheets, setSheets] = useState([]);
    const [searchState, setSearchState] = useState(null);
    const [loading, setLoading] = useState(true);
    const applyFilters = (sheets) => {
        searchState.appliedFilters.forEach((appliedFilter, i) => {
            const type = searchState.appliedFilterAggTypes[i];
            sheets = sheets.filter(sheet => {
                        const items = type === 'topics_en' ? sheet.topics : sheet.collections;
                        const slugs = items.map(x => x.slug);
                        return slugs.includes(appliedFilter);
                    });
            });
        return sheets;
    }
    const prepSheetsForDisplay = (sheets) => {
        sheets = applyFilters(sheets);
        sheets = sheets.sort((a, b) => {
                              // First place user's sheet
                              if (a.owner === Sefaria.uid && b.owner !== Sefaria.uid) {
                                return -1;
                              }
                              if (a.owner !== Sefaria.uid && b.owner === Sefaria.uid) {
                                return 1;
                              }
                              // Then sort by language / interface language
                              let aHe, bHe;
                              [aHe, bHe] = [a.title, b.title].map(Sefaria.hebrew.isHebrew);
                              if (aHe !== bHe) { return (bHe ? -1 : 1) * (Sefaria.interfaceLang === "hebrew" ? -1 : 1); }
                              // Then by number of views
                              return b.views - a.views;
                            })
        // filters out duplicate sheets by sheet ID number and filters so that we don't show sheets as connections to themselves
        return sheets.filter((sheet, index, self) =>
                          index === self.findIndex((s) => (
                            s.id === sheet.id)
                        ))
    }
    useEffect(() => {
      delete Sefaria.sheets._sheetsByRef[srefs];
      Sefaria.sheets.getSheetsByRef(srefs).then(sheets => {
          const searchState = Sefaria.sheets.sheetsWithRefSearchState(sheets);
          setSheets(sheets);
          setSearchState(searchState);
          setLoading(false);
      })
    }, []);
    const onSearchResultClick = (...args) => {
        args.forEach(arg => console.log(arg));
    }
    const updateSearchFilter = (type, searchState, filterNode) => {
        if (filterNode.isUnselected()) {
          filterNode.setSelected(true);
        } else {
          filterNode.setUnselected(true);
        }
        const update = Sefaria.search.getAppliedSearchFilters(searchState.availableFilters);
        setSearchState(searchState.update(update));
    }
    const updateSearchOptionField = (...args) => {
        args.forEach(arg => console.log(arg));
    }
    const updateSearchOptionSort = (...args) => {
        args.forEach(arg => console.log(arg));
    }
    const registerAvailableFilters = (...args) => {
       args.forEach(arg => console.log(arg));
    }
    if (loading) {
        return <div>Loading...</div>;
    }
    return <SearchPage
          key={"sheetsPage"}
          searchTopMsg="Sheets With"
          list={SheetsWithRefList}
          listItems={prepSheetsForDisplay(sheets)}
          query={srefs}
          type={'sheet'}
          compare={false}
          searchState={searchState}
          panelsOpen={1}
          onResultClick={onSearchResultClick}
          updateAppliedFilter={updateSearchFilter}
          updateAppliedOptionField={updateSearchOptionField}
          updateAppliedOptionSort={updateSearchOptionSort}
          registerAvailableFilters={registerAvailableFilters}/>
}
export default SheetsWithRefPage;