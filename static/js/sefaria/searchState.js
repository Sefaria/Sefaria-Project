class SearchState {
  constructor({
    type,
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
    this.defaultsByType = {
      text: {
        fieldExact: 'exact',
        fieldBroad: 'naive_lemmatizer',
        field:      'naive_lemmatizer',
        sortType:   'relevance',
      },
      sheet: {
        fieldExact: null,
        fieldBroad: null,
        field: 'content',
        sortType: 'chronological',
      },
    };
    this.type             = type;  // always required
    this.appliedFilters   = appliedFilters   || [];
    this.availableFilters = availableFilters || [];
    this.filterRegistry   = filterRegistry   || {};
    this.filtersValid     = filtersValid     || false;
    this.orphanFilters    = orphanFilters    || [];
    this.fieldExact       = fieldExact       || this.defaultsByType[type].fieldExact;
    this.fieldBroad       = fieldBroad       || this.defaultsByType[type].fieldBroad;
    this.field            = field            || this.defaultsByType[type].field;
    this.sortType         = sortType         || this.defaultsByType[type].sortType;
  }

  clone(trimFilters) {
    return new SearchState({
      appliedFilters:   Sefaria.util.clone(this.appliedFilters),
      availableFilters: trimFilters ? [] : Sefaria.util.clone(this.availableFilters),
      filterRegistry:   trimFilters ? {} : Sefaria.util.clone(this.filterRegistry),
      filtersValid:     trimFilters ? false : this.filtersValid,
      orphanFilters:    Sefaria.util.clone(this.orphanFilters),
      type:             this.type,
      fieldExact:       this.fieldExact,
      fieldBroad:       this.fieldBroad,
      field:            this.field,
      sortType:         this.sortType,
    });
  }

  update({
    type,
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
    type             = typeof type             === 'undefined' ? this.type             : type;
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
      type,
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

  makeURL({ prefix, isStart }) {
    // prefix: string prepended to every parameter. meant to distinguish between different type of searchState URL parameters (e.g. sheet and text)
    //         oneOf({'t': 'text', 's': sheet, 'g': group, 'u': user})
    const url = ((!!this.appliedFilters && !!this.appliedFilters.length) ? `&${prefix}filters=` + this.appliedFilters.join('|') : '') +
      `&${prefix}var=` + (this.field !== this.fieldExact ? '1' : '0') +
      `&${prefix}sort=` + (this.sortType === 'chronological' ? 'c' : 'r');
    if (isStart) {
      url.replace(/&/, '?');
    }
    return url;
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


Things to test
cloning esp. with filters
*/
