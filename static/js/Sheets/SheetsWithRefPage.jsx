import SearchPage from "../SearchPage";
import Sefaria from "../sefaria/sefaria";
import {useEffect, useState} from "react";
import {SearchTotal} from "../sefaria/searchTotal";
import SearchState from "../sefaria/searchState";
const SheetsWithRefPage = ({srefs, searchState, updateSearchState, updateAppliedFilter,
                           updateAppliedOptionField, updateAppliedOptionSort, onResultClick,
                           registerAvailableFilters}) => {
    const [sheets, setSheets] = useState([]);
    const [loading, setLoading] = useState(true);

    const [origAvailableFilters, setOrigAvailableFilters] = useState([]);
    // storing original available filters is crucial so that we have access to the full list of filters.
    // by contrast, in the searchState, the available filters length changes based on filtering.
    // by having access to the original available filters list, if the searchState's applied filters are turned off,
    // we can return the searchState's available filters to the original list.  Once origAvailableFilters are loaded,
    // they are never changed.

    const [refs, setRefs] = useState(srefs);
    const sortTypeArray = SearchState.metadataByType['sheet'].sortTypeArray.filter(sortType => sortType.type !== 'relevance');

    const cloneFilters = (availableFilters, resetDocCounts = true) => {
        // clone filters so that we can update the available filters docCounts
        // without modifying the original available filters (origAvailableFilters) docCounts
        // we don't want to modify the origAvailableFilters docCounts so that we have the accurate number when checking
        // in checkForRegisteringAvailableFilters
        return availableFilters.map(availableFilter => {
            let newAvailableFilter = availableFilter.clone();
            if (resetDocCounts) newAvailableFilter.docCount = 0;
            return newAvailableFilter;
        })
    }
    const getDocCounts = (availableFilters) => {
        return availableFilters.map(availableFilter => availableFilter.docCount).sort((a, b) => a - b);
    }
    const checkForRegisteringAvailableFilters = (availableFilters) => {
        const newDocCounts = getDocCounts(availableFilters);
        const currDocCounts = getDocCounts(searchState.availableFilters);
        if (!newDocCounts.compare(currDocCounts)) { // if previously the appliedFilters were different,
                                                    // then the doccounts will be different, so register
            availableFilters = availableFilters.sort((a, b) => b.docCount - a.docCount || a.title.localeCompare(b.title));
            registerAvailableFilters('sheet', availableFilters, {}, [], ['collections', 'topics_en']);
        }
    }

    const getSheetSlugs = (type, sheet) => {
        const items = type === 'topics_en' ? sheet.topics : sheet.collections;
        return items.map(x => x.slug);
    }
    const applyFiltersToSheets = (sheets) => {
        searchState.appliedFilters.forEach((appliedFilter, i) => {
            const type = searchState.appliedFilterAggTypes[i];
            sheets = sheets.filter(sheet => {
                const slugs = getSheetSlugs(type, sheet);
                return slugs.includes(appliedFilter);
            });
        });
        return sheets;
    }

    const applyFilters = (sheets) => {
        if (searchState.appliedFilters.length === 0) {
            checkForRegisteringAvailableFilters(origAvailableFilters);
        }
        else {
            let newAvailableFilters = cloneFilters(origAvailableFilters);
            sheets = applyFiltersToSheets(sheets);
            newAvailableFilters = updateFilterDocCounts(newAvailableFilters, sheets);
            newAvailableFilters = removeEmptyFilters(newAvailableFilters);
            newAvailableFilters = updateFilterSelectedValues(newAvailableFilters);
            checkForRegisteringAvailableFilters(newAvailableFilters);
        }
        return sheets;
    }
    const updateFilterSelectedValues = (availableFilters) => {
        availableFilters.forEach((availableFilter) => {
            const selected = searchState.appliedFilters.includes(availableFilter.aggKey);
            if (selected !== Boolean(availableFilter.selected)) {
                if (selected) {
                    availableFilter.setSelected(true);
                } else {
                    availableFilter.setUnselected(true);
                }
            }
        })
        return availableFilters;
    }
    const removeEmptyFilters = (availableFilters) => {
        return availableFilters.filter(availableFilter => availableFilter.docCount > 0);
    }
    const updateFilterDocCounts = (availableFilters, sheets) => {
      ['collections', 'topics_en'].forEach(type => {
          let allSlugs = {};
          sheets.forEach(sheet => {
            let slugs = getSheetSlugs(type, sheet);
            slugs = [...new Set(slugs)];  // don't double count slugs since there are duplicates
            slugs.forEach(slug => {
                if (!(slug in allSlugs)) {
                  allSlugs[slug] = 0;
                }
                allSlugs[slug] += 1;
            })
          })
          availableFilters.forEach((filter, i) => {
            if (filter.aggKey in allSlugs && filter.aggType === type) {
                availableFilters[i].docCount = allSlugs[filter.aggKey];
            }
        })
        })
        return availableFilters;
    }
    const applySortOption = (sheets) => {
        switch(searchState.sortType) {
            case 'views':
                sheets = sheets.sort((a, b) => b.views - a.views);
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
                            })
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
                        snippet: sheet.summary || "",
                    }
        })
    }
    const handleSheetsLoad = (sheets) => {
      searchState.availableFilters = Sefaria.sheets.sheetsWithRefFilterNodes(sheets);
      searchState.sortType = "views";
      setSheets(sheets);
      updateSearchState(searchState, 'sheet');
      setOrigAvailableFilters(searchState.availableFilters);
      setLoading(false);
    }
    const makeSheetsUnique = (sheets) => {
        // if a sheet ID occurs in multiple sheet items, only keep the first sheet found so that there are not duplicates
        return sheets.filter((sheet, index, self) =>
                          index === self.findIndex((s) => (
                            s.id === sheet.id)
                        ))
    }

    useEffect(() => {
      Sefaria.sheets.getSheetsByRef(refs, makeSheetsUnique).then(sheets => {handleSheetsLoad(sheets);})
    }, [refs]);

    let sortedSheets = [...sheets];
    sortedSheets = applyFilters(sortedSheets);
    sortedSheets = applySortOption(sortedSheets);
    sortedSheets = prepSheetsForDisplay(sortedSheets);
    sortedSheets = normalizeSheetsMetaData(sortedSheets);
    return <SearchPage
          key={"sheetsPage"}
          isQueryRunning={loading}
          sortTypeArray={sortTypeArray}
          searchTopMsg="Sheets With"
          hits={sortedSheets}
          query={refs}
          type={'sheet'}
          totalResults={new SearchTotal({value: sortedSheets.length})}
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