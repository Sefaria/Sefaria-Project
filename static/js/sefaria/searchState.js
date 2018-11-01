class SearchState {
  constructor({
    type,
    appliedFilters,
    appliedFilterAggTypes,
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
    this.appliedFilterAggTypes = appliedFilterAggTypes || [];
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
      appliedFilterAggTypes: Sefaria.util.clone(this.appliedFilterAggTypes),
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
    appliedFilterAggTypes,
    availableFilters,
    filterRegistry,
    filtersValid,
    orphanFilters,
    fieldExact,
    fieldBroad,
    field,
    sortType,
    updateFilterCountsInPlace,
  }) {
    type             = typeof type             === 'undefined' ? this.type             : type;
    appliedFilters   = typeof appliedFilters   === 'undefined' ? this.appliedFilters   : appliedFilters;
    appliedFilterAggTypes = typeof appliedFilterAggTypes === 'undefined' ? this.appliedFilterAggTypes : appliedFilterAggTypes;
    filtersValid     = typeof filtersValid     === 'undefined' ? this.filtersValid     : filtersValid;
    orphanFilters    = typeof orphanFilters    === 'undefined' ? this.orphanFilters    : orphanFilters;
    fieldExact       = typeof fieldExact       === 'undefined' ? this.fieldExact       : fieldExact;
    fieldBroad       = typeof fieldBroad       === 'undefined' ? this.fieldBroad       : fieldBroad;
    field            = typeof field            === 'undefined' ? this.field            : field;
    sortType         = typeof sortType         === 'undefined' ? this.sortType         : sortType;
    const tempAvailableFilters = availableFilters;
    const tempFilterRegistry   = typeof filterRegistry   === 'undefined' ? this.filterRegistry   : filterRegistry;
    if (updateFilterCountsInPlace && this.filtersValid) {
      if (typeof tempAvailableFilters !== 'undefined') {
        // set all counts to zero by default
        for (let filter of this.availableFilters) { filter.docCount = 0; }
        for (let filter of tempAvailableFilters) {
          const currFilter = this.availableFilters.find( f => f.aggType === filter.aggType && f.aggKey === filter.aggKey);
          if (!!currFilter) {
            currFilter.docCount = filter.docCount;
          }
        }
        availableFilters = this.availableFilters;
        filterRegistry = this.filterRegistry;
      }
    } else {
      availableFilters = typeof tempAvailableFilters === 'undefined' ? this.availableFilters : tempAvailableFilters;
      filterRegistry = tempFilterRegistry;
    }
    return new SearchState({
      type,
      appliedFilters,
      appliedFilterAggTypes,
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
    if (!(other instanceof SearchState)) { return false; }
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
    const aggTypes = SearchState.metadataByType[this.type].aggregation_field_array;
    const url = aggTypes.reduce( (accum, aggType) => {
        const aggTypeFilters = aggTypes.length > 1 ? Sefaria.util.zip(this.appliedFilters, this.appliedFilterAggTypes).filter( f => f[1] === aggType).map( x => x[0]) : this.appliedFilters;
        return accum + (aggTypeFilters.length > 0 ? `&${prefix}${aggType}Filters=${aggTypeFilters.map( f => encodeURIComponent(f)).join('|')}` : '');
      }, '') +
      `&${prefix}var=` + (this.field !== this.fieldExact ? '1' : '0') +
      `&${prefix}sort=${this.sortType}`;
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
    build_and_apply_filters: 'buildAndApplyTextFilters',  // func name from Search.js
    make_filter_query: 'makeTextFilterQuery',  // func name from Search.js
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
        direction: 'asc',
      }
    ],
  },
  sheet: {
    fieldExact: null,
    fieldBroad: null,
    field: 'content',
    aggregation_field_array: ['group', 'tags'],
    build_and_apply_filters: 'buildAndApplySheetFilters',  // func name from Search.js
    make_filter_query: 'makeSheetFilterQuery',  // func name from Search.js
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
        direction: 'desc',
      },
      {
        type: 'views',
        name: 'Views',
        fieldArray: ['views'],
        sort_method: 'sort',
        direction: 'desc',
      },
    ],
  },
};

module.exports = SearchState;
