import SearchPage from "../SearchPage";
import Sefaria from "../sefaria/sefaria";
import {useEffect, useState} from "react";
import {SearchTotal} from "../sefaria/searchTotal";
import {Children as availableFilters} from "../lib/react";
const SheetsWithRefPage = ({srefs, searchState, updateSearchState, updateAppliedFilter,
                           updateAppliedOptionField, updateAppliedOptionSort, onResultClick,
                           registerAvailableFilters}) => {
    const [sheets, setSheets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalResults, setTotalResults] = useState(new SearchTotal());
    const [origAvailableFilters, setOrigAvailableFilters] = useState([]);
    const cloneFilters = (availableFilters, resetDocCounts = true) => {
        return availableFilters.map(availableFilter => {
            let newAvailableFilter = availableFilter.clone();
            if (resetDocCounts) newAvailableFilter.docCount = 0;
            return newAvailableFilter;
        })
    }
    const getDocCounts = (availableFilters) => {
        return availableFilters.map(availableFilter => availableFilter.docCount).sort((a, b) => a - b);
    }
    const updateAvailableFilters = (availableFilters) => {
        const newDocCounts = getDocCounts(availableFilters);
        const currDocCounts = getDocCounts(searchState.availableFilters);
        if (!newDocCounts.compare(currDocCounts)) {
            searchState.availableFilters = availableFilters;
            updateSearchState(searchState, 'sheet');
        }
    }
    const updateDocCounts = (newAvailableFilters, appliedFilter) => {
        newAvailableFilters.forEach((newFilter, i) => {
            if (newFilter.aggKey === appliedFilter) {
                newAvailableFilters[i].docCount++;
            }
        })
    }
    const applyFilters = (sheets) => {
        if (searchState.appliedFilters.length === 0) {
            updateAvailableFilters(origAvailableFilters);
        }
        else {
            let newAvailableFilters = cloneFilters(origAvailableFilters);
            searchState.appliedFilters.forEach((appliedFilter, i) => {
                const type = searchState.appliedFilterAggTypes[i];
                sheets = sheets.filter(sheet => {
                    const items = type === 'topics_en' ? sheet.topics : sheet.collections;
                    const slugs = items.map(x => x.slug);
                    const slugFound = slugs.includes(appliedFilter);
                    if (slugFound) {
                        slugs.forEach(slug => {
                            updateDocCounts(newAvailableFilters, slug);
                        })
                    }
                    return slugFound;
                });
            });
            newAvailableFilters = newAvailableFilters.filter(availableFilter => availableFilter.docCount > 0);
            updateAvailableFilters(newAvailableFilters);
        }
        return sheets;
    }
    const applySortOption = (sheets) => {
        switch(searchState.sortType) {
            case 'views':
                sheets = sheets.sort((a, b) => b.views - a.views);
            break;
            case 'relevance':
            break;
            case 'dateCreated':
                sheets = sheets.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));
            break;
        }
        return sheets;
    }
    const prepSheetsForDisplay = (sheets) => {
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
        sheets = sheets.filter((sheet, index, self) =>
                          index === self.findIndex((s) => (
                            s.id === sheet.id)
                        ))
        return sheets;
    }
    const normalizeSheetsMetaData = (sheets) => {
        return sheets.map(sheet => {
            return {
                        sheetId: sheet.id,
                        title: sheet.title,
                        owner_name: sheet.ownerName,
                        owner_image: sheet.ownerImageUrl,
                        profile_url: sheet.ownerProfileUrl,
                        dateCreated: sheet.dateCreated,
                        _id: sheet.id,
                        snippet: sheet?.summary || ""
                    }
        })
    }
    const applyFiltersAndSortOptions = () => {
        let sortedSheets = sheets;
        sortedSheets = applyFilters(sortedSheets);
        return applySortOption(sortedSheets);
    }
    const handleSheetsLoad = (sheets) => {
      const searchState = Sefaria.sheets.sheetsWithRefSearchState(sheets);
      setSheets(prepSheetsForDisplay(sheets));
      updateSearchState(searchState, 'sheet');
      setOrigAvailableFilters(searchState.availableFilters);
      setLoading(false);
      setTotalResults(new SearchTotal({value: sheets.length}));
    }
    useEffect(() => {
      // 'collections' won't be present if the related API set _sheetsByRef,
      // but 'collections' will be present if the sheets_by_ref_api has run
      // if the field is not present, we need to call the sheets_by_ref_api
      const currentSheetsByRef = Sefaria.sheets._sheetsByRef[srefs];
      const collectionsInCache = !!currentSheetsByRef && currentSheetsByRef.every(sheet => 'collections' in sheet);
      if (!collectionsInCache) {
          delete Sefaria.sheets._sheetsByRef[srefs];
          Sefaria.sheets.getSheetsByRef(srefs).then(sheets => {
              handleSheetsLoad(sheets);
          })
      }
      else {
          handleSheetsLoad(Sefaria.sheets._sheetsByRef[srefs]);
      }
    }, []);
    if (loading) {
        return <div>Loading...</div>;
    }
    let sortedSheets = applyFiltersAndSortOptions();
    sortedSheets = normalizeSheetsMetaData(sortedSheets);
    return <SearchPage
          key={"sheetsPage"}
          searchTopMsg="Sheets With"
          hits={sortedSheets}
          query={srefs}
          type={'sheet'}
          totalResults={totalResults}
          compare={false}
          searchState={searchState}
          panelsOpen={1}
          onResultClick={onResultClick}
          updateAppliedFilter={updateAppliedFilter}
          updateAppliedOptionField={updateAppliedOptionField}
          updateAppliedOptionSort={updateAppliedOptionSort}
          registerAvailableFilters={registerAvailableFilters}/>
}
export default SheetsWithRefPage;