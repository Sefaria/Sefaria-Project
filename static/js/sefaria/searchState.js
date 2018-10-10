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
  }) {
    this.appliedFilters   = appliedFilters || [];
    this.availableFilters = availableFilters || [];
    this.filterRegistry   = filterRegistry || {};
    this.filtersValid     = filtersValid || false;
    this.orphanFilters    = orphanFilters || [];
    this.fieldExact       = fieldExact;
    this.fieldBroad       = fieldBroad;
    this.field            = field;
    this.sortType         = sortType;
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
    appliedFilters   = appliedFilters   || this.appliedFilters;
    availableFilters = availableFilters || this.availableFilters;
    filterRegistry   = filterRegistry   || this.filterRegistry;
    filtersValid     = filtersValid     || this.fitlersValid;
    orphanFilters    = orphanFilters    || this.orphanFilters;
    fieldExact       = fieldExact       || this.fieldExact;
    fieldBroad       = fieldBroad       || this.fieldBroad;
    field            = field            || this.field;
    sortType         = sortType         || this.sortType;
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
      if (this[field] !== other[field]) { return false; }
    }
    return true;
  }

  makeURL(startOfUrlParameters) {
    return (startOfUrlParameters ? "?" : "&") + ((!!this.appliedFilters && !!this.appliedFilters.length) ? "filters=" + this.appliedFilters.join("|") : "") +
      "&var=" + (this.field !== this.fieldExact ? "1" : "0") +
      "&sort=" + (this.sortType === "chronological" ? "c" : "r");
  }
}

//appliedSearchFilters
//searchField
//searchSortType
//availableFilters
//searchFiltersValid
//filterRegistry
//searchFieldExact
//searchFieldBroad
//orphanSearchFilters
