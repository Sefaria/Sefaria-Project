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
    this.type             = type;  // always required
    this.appliedFilters   = appliedFilters   || [];
    this.availableFilters = availableFilters || [];
    this.filterRegistry   = filterRegistry   || {};
    this.filtersValid     = filtersValid     || false;
    this.orphanFilters    = orphanFilters    || [];
    this.fieldExact       = fieldExact       || SearchState.metadataByType[type].fieldExact;
    this.fieldBroad       = fieldBroad       || SearchState.metadataByType[type].fieldBroad;
    this.field            = field            || SearchState.metadataByType[type].field;
    this.sortType         = sortType         || SearchState.metadataByType[type].sortType;
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

SearchState.metadataByType = {
  text: {
    fieldExact: 'exact',
    fieldBroad: 'naive_lemmatizer',
    field: 'naive_lemmatizer',
    aggregation_field_array: ['path'],
    sortType: 'relevance',
    sortTypeArray: [  // this array defines the sort options available for each search type
      {
        type: 'relevance',
        name: 'Relevance',
        heName: 'רלוונטיות',
        field: 'pagesheetrank',
        sort_method: 'score',  // if sort_method == 'score', it will combine the standard elasticsearch score with `field`
        score_missing: 0.04,  // this default value comes from the equation used to calculate pagesheetrank. see search.py where this field is created
      },
      {
        type: 'chronological',
        name: 'Chronological',
        heName: 'כרונולוגי',
        fieldArray: ['comp_date', 'order'],  // if sort_method == 'sort', then we need to define fieldArray, which is a list of fields we want to sort on
        sort_method: 'sort',
      }
    ],
  },
  sheet: {
    fieldExact: null,
    fieldBroad: null,
    field: 'content',
    aggregation_field_array: ['group.keyword', 'tags.keyword'],
    sortType: 'relevance',
    sortTypeArray: [
      {
        type: 'relevance',
        name: 'Relevance',
        field: null,
        sort_method: 'score',
      },
      {
        type: 'dateCreated',
        name: 'Date Created',
        fieldArray: ['dateCreated'],
        sort_method: 'sort',
      },
      {
        type: 'dateModified',
        name: 'Date Modified',
        fieldArray: ['dateModified'],
        sort_method: 'sort',
      },
      {
        type: 'views',
        name: 'Views',
        fieldArray: ['views'],
        sort_method: 'sort',
      },
    ],
  },
};

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
