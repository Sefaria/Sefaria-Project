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
    const checkForRegisteringAvailableFilters = (availableFilters) => {
        const newDocCounts = getDocCounts(availableFilters);
        const currDocCounts = getDocCounts(searchState.availableFilters);
        if (!newDocCounts.compare(currDocCounts)) {
            availableFilters = availableFilters.sort((a, b) => b.docCount - a.docCount || a.title.localeCompare(b.title));
            registerAvailableFilters('sheet', availableFilters, {}, [], ['collections', 'topics_en']);
        }
    }
    const updateDocCounts = (newAvailableFilters, appliedFilter) => {
        newAvailableFilters.forEach((newFilter, i) => {
            if (newFilter.aggKey === appliedFilter) {
                newAvailableFilters[i].docCount++;
            }
        })
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
            newAvailableFilters = updateNewAvailableFilters(newAvailableFilters, sheets);
            checkForRegisteringAvailableFilters(newAvailableFilters);
        }
        return sheets;
    }
    const updateNewAvailableFilters = (newAvailableFilters, sheets) => {
        ['collections', 'topics_en'].forEach(type => {
              sheets.forEach(sheet => {
                const slugs = getSheetSlugs(type, sheet);
                slugs.forEach(slug => {
                    updateDocCounts(newAvailableFilters, slug);
                })
              })
            })
        return newAvailableFilters.filter(availableFilter => availableFilter.docCount > 0);
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
    const handleSheetsLoad = (sheets) => {
      const searchState = Sefaria.sheets.sheetsWithRefSearchState(sheets);
      setSheets(prepSheetsForDisplay(sheets));
      updateSearchState(searchState, 'sheet');
      setOrigAvailableFilters(searchState.availableFilters);
      setLoading(false);
      setTotalResults(new SearchTotal({value: sheets.length}));
    }
    const getSheetsByRefCallback = (sheets) => {
        // filters out duplicate sheets by sheet ID number and filters so that we don't show sheets as connections to themselves
        return sheets.filter((sheet, index, self) =>
                          index === self.findIndex((s) => (
                            s.id === sheet.id)
                        ))
    }
    useEffect(() => {
      // 'collections' won't be present if the related API set _sheetsByRef,
      // but 'collections' will be present if the sheets_by_ref_api has run
      // if the field is not present, we need to call the sheets_by_ref_api
      const currentSheetsByRef = Sefaria.sheets._sheetsByRef[srefs];
      const collectionsInCache = !!currentSheetsByRef && currentSheetsByRef.every(sheet => 'collections' in sheet);
      if (!collectionsInCache) {
          delete Sefaria.sheets._sheetsByRef[srefs];
          Sefaria.sheets.getSheetsByRef(srefs, getSheetsByRefCallback).then(sheets => {
              handleSheetsLoad(sheets);
          })
      }
      else {
          handleSheetsLoad(Sefaria.sheets._sheetsByRef[srefs]);
      }
    }, []);

    origAvailableFilters.forEach(availableFilter => {
        const selected = searchState.appliedFilters.includes(availableFilter.aggKey);
        if (selected && selected !== Boolean(availableFilter.selected)) {
            availableFilter.setSelected(true);
        }
        else if (selected !== Boolean(availableFilter.selected)) {
            availableFilter.setUnselected(true);
        }
    })
    let sortedSheets = [...sheets];
    sortedSheets = applyFilters(sortedSheets);
    sortedSheets = applySortOption(sortedSheets);
    sortedSheets = normalizeSheetsMetaData(sortedSheets);
    if (loading) {
        return <div>Loading...</div>;
    }

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