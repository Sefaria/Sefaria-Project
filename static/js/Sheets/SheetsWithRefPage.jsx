import SearchPage from "../SearchPage";
import SheetsWithRefList from "./SheetsWithRefList";
import Sefaria from "../sefaria/sefaria";
import {useEffect, useState} from "react";
const SheetsWithRefPage = ({srefs, connectedSheet}) => {
    const [sheets, setSheets] = useState([]);
    const [searchState, setSearchState] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
      delete Sefaria.sheets._sheetsByRef[srefs];
      Sefaria.sheets.getSheetsByRef(srefs).then(sheets => {
          sheets = Sefaria.sheets.sortSheetsByInterfaceLang(sheets);
          sheets = Sefaria.sheets.filterSheetsForDisplay(sheets, connectedSheet);
          const searchState = Sefaria.sheets.sheetsWithRefSearchState(sheets);
          setSheets(sheets);
          setSearchState(searchState);
          setLoading(false);
      })
    }, []);
    const onSearchResultClick = (...args) => {
        args.forEach(arg => console.log(arg));
    }
    const updateSearchFilter = (...args) => {
        args.forEach(arg => console.log(arg));
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
          listItems={sheets}
          query={srefs[0]}
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