class SearchState {
  constructor({
    appliedFilters,
    availableFilters,
    filterRegistry,
    filtersValid,
    orphanFilters,
    fieldExact,
    fieldBroad,
    field,
    sortType,
  } = {}) {
    this.appliedFilters   = appliedFilters   || [];
    this.availableFilters = availableFilters || [];
    this.filterRegistry   = filterRegistry   || {};
    this.filtersValid     = filtersValid     || false;
    this.orphanFilters    = orphanFilters    || [];
    this.fieldExact       = fieldExact       || "exact";
    this.fieldBroad       = fieldBroad       || "naive_lemmatizer";
    this.field            = field            || "naive_lemmatizer";
    this.sortType         = sortType         || "relevance";
  }

  clone() {
    return new SearchState({
      appliedFilters:   this.appliedFilters,
      availableFilters: this.availableFilters,
      filterRegistry:   this.filterRegistry,
      filtersValid:     this.filtersValid,
      orphanFilters:    this.orphanFilters,
      fieldExact:       this.fieldExact,
      fieldBroad:       this.fieldBroad,
      field:            this.field,
      sortType:         this.sortType,
    });
  }

  update({
    appliedFilters,
    availableFilters,
    filterRegistry,
    filtersValid,
    orphanFilters,
    fieldExact,
    fieldBroad,
    field,
    sortType,
  }) {
    appliedFilters   = typeof appliedFilters   === 'undefined' ? this.appliedFilters   : appliedFilters;
    availableFilters = typeof availableFilters === 'undefined' ? this.availableFilters : availableFilters;
    filterRegistry   = typeof filterRegistry   === 'undefined' ? this.filterRegistry   : filterRegistry;
    filtersValid     = typeof filtersValid     === 'undefined' ? this.filtersValid     : filtersValid;
    orphanFilters    = typeof orphanFilters    === 'undefined' ? this.orphanFilters    : orphanFilters;
    fieldExact       = typeof fieldExact       === 'undefined' ? this.fieldExact       : fieldExact;
    fieldBroad       = typeof fieldBroad       === 'undefined' ? this.fieldBroad       : fieldBroad;
    field            = typeof field            === 'undefined' ? this.field            : field;
    sortType         = typeof sortType         === 'undefined' ? this.sortType         : sortType;
    return new SearchState({
      appliedFilters,
      availableFilters,
      filterRegistry,
      filtersValid,
      orphanFilters,
      fieldExact,
      fieldBroad,
      field,
      sortType,
    });
  }

  isEqual({
    other,
    fields,
  }) {
    for (let field of fields) {
      const thisField = this[field];
      const otherField = other[field];
      if (thisField instanceof Array) {
        if (!(otherField instanceof Array)) { return false; }
        if (thisField.length !== otherField.length) { return false; }
        if (!thisField.every((v, i) => v === otherField[i])) { return false; }
      } else {
        if (thisField !== otherField) { return false; }
      }
    }
    return true;
  }

  makeURL(startOfUrlParameters) {
    return (startOfUrlParameters ? "?" : "&") + ((!!this.appliedFilters && !!this.appliedFilters.length) ? "filters=" + this.appliedFilters.join("|") : "") +
      "&var=" + (this.field !== this.fieldExact ? "1" : "0") +
      "&sort=" + (this.sortType === "chronological" ? "c" : "r");
  }
}

module.exports = SearchState;
/*ReaderApp
appliedSearchFilters
searchField
searchSortType
availableFilters
searchFiltersValid
filterRegistry
searchFieldExact
searchFieldBroad
orphanSearchFilters

ReaderPanel
appliedSearchFilters xxx
availableFilters xxx
searchFiltersValid xxx
searchFieldExact xxx
searchFieldBroad xxx
searchField xxx
searchSortType xxx

SearchPage xxx
appliedFilters
availableFilters
filtersValid
exactField
broadField
field
sortType

SearchResultList
appliedFilters
availableFilters
filtersValid
exactField
broadField
field
sortType

SearchFilters
appliedFilters
availableFilters
exactField
broadField
optionField
sortType

SearchFilterPanel
availableFilters xxx

//getAppliedSearchFilters() xxx
//updateAvailableFiltersInPanel() xxx
//updateAvailableFiltersInHeader() xxx
//updateQueryInPanel()
//updateQueryInHeader()
//updateSearchFilterInPanel()
//updateSearchFilterInHeader()
//updateSearchOptionFieldInPanel()
//updateSearchOptionFieldInHeader()
//updateSearchOptionSortInPanel()
//updateSearchOptionSortInHeader()


SOMEWHERE ITS NOT RESPECTING URL PARAMETERS!!!! for sort type at least
*/
