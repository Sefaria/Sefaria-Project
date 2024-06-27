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
    const onSearchResultClick = (props) => {console.log(props)}
    const updateSearchFilter = (props) => {console.log(props)}
    const updateSearchOptionField = (props) => {console.log(props)}
    const updateSearchOptionSort = (props) => {console.log(props)}
    const registerAvailableFilters = (props) => {console.log(props)}
    if (loading) {
        return <div>Loading...</div>;
    }
    return <SearchPage
          key={"sheetsPage"}
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