import SearchPage from "../SearchPage";
import Sefaria from "../sefaria/sefaria";
import {useEffect, useState} from "react";
const SheetsWithRefPage = ({srefs, searchState, updateSearchState, updateAppliedFilter,
                           updateAppliedOptionField, updateAppliedOptionSort, onResultClick,
                           registerAvailableFilters}) => {
    const [sheets, setSheets] = useState([]);
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
        sheets = sheets.filter((sheet, index, self) =>
                          index === self.findIndex((s) => (
                            s.id === sheet.id)
                        ))
        return sheets;
    }
    const normalizeSheetsMetaData = () => {
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
      setLoading(false);
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
    return <SearchPage
          key={"sheetsPage"}
          searchTopMsg="Sheets With"
          hits={normalizeSheetsMetaData()}
          query={srefs}
          type={'sheet'}
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