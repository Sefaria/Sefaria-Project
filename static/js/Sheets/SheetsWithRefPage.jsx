import SearchPage from "../SearchPage";
import SheetsWithRefList from "./SheetsWithRefList";
import Sefaria from "../sefaria/sefaria";
const SheetsWithRefPage = ({srefs, connectedSheet}) => {
  let sheets = Sefaria.sheets.sheetsTotal(srefs);
  sheets = Sefaria.sheets.sortSheetsByInterfaceLang(sheets);
  sheets = Sefaria.sheets.filterSheetsForDisplay(sheets, connectedSheet);
  const searchState = Sefaria.sheets.sheetsWithRefSearchState(sheets);
    const onSearchResultClick = () => {alert('resultClick')}
    const updateSearchFilter = () => {alert('filter')}
    const updateSearchOptionField = () => {alert("field")}
    const updateSearchOptionSort = () => {alert("sort")}
    const registerAvailableFilters = () => {alert("register")}
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