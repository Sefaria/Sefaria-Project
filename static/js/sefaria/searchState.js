import Util from './util';
import FilterNode from './FilterNode';

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
    this.type                  = type;  // always required
    this.appliedFilters        = appliedFilters   || [];
    this.appliedFilterAggTypes = appliedFilterAggTypes || [];
    this.availableFilters      = typeof availableFilters === 'undefined' ? [] : availableFilters.map(f => f instanceof FilterNode ? f : new FilterNode(f));
    this.filterRegistry        = typeof filterRegistry !== "undefined" ? filterRegistry : this._recreateRegistry(this.availableFilters);
    this.filtersValid          = filtersValid       || false;
    this.orphanFilters         = orphanFilters      || [];
    this.fieldExact            = fieldExact         || SearchState.metadataByType[type].fieldExact;
    this.fieldBroad            = fieldBroad         || SearchState.metadataByType[type].fieldBroad;
    this.field                 = field              || SearchState.metadataByType[type].field;
    this.sortType              = sortType           || SearchState.metadataByType[type].sortType;
  }

  _recreateRegistry(filters, registry = {}) {
    for (let f of filters) {
      registry[f.aggKey] = f;
      registry = this._recreateRegistry(f.children, registry);
    }
    return registry;
  }

  clone(prepareForSerialization) {
    const clonedAvailableFilters = Util.clone(this.availableFilters, prepareForSerialization);
    return new SearchState({
      appliedFilters:   Util.clone(this.appliedFilters, prepareForSerialization),
      appliedFilterAggTypes: Util.clone(this.appliedFilterAggTypes, prepareForSerialization),
      availableFilters:   clonedAvailableFilters,
      filtersValid:       this.filtersValid,
      orphanFilters:      this.orphanFilters,
      type:               this.type,
      fieldExact:         this.fieldExact,
      fieldBroad:         this.fieldBroad,
      field:              this.field,
      sortType:           this.sortType,
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
    aggregationsToUpdate,
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
    if (!!aggregationsToUpdate && this.filtersValid) {
      if (typeof tempAvailableFilters !== 'undefined') {
        availableFilters = this.availableFilters.filter( f => aggregationsToUpdate.indexOf(f.aggType) === -1).concat(availableFilters);
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
    // prefix: string prepended to every parameter. meant to distinguish between different types
    //         of searchState URL parameters (e.g. sheet and text)
    //         oneOf({'t': 'text', 's': sheet, 'c': collection, 'u': user})
    const aggTypes = SearchState.metadataByType[this.type].aggregation_field_array;
    const aggTypesSuffixes = SearchState.metadataByType[this.type].aggregation_field_lang_suffix_array;
    const aggTypesWithSuffixes = []
    Sefaria.util // 
      .zip(aggTypes, aggTypesSuffixes)
      .map(([agg, suffixMap]) => {
        if (suffixMap) {
          Object.values(suffixMap).map(suffix => {aggTypesWithSuffixes.push(agg+suffix)});
        } else {
          aggTypesWithSuffixes.push(agg);
        }
      });

    const url = aggTypesWithSuffixes.reduce( (accum, aggType) => {  
        const aggTypeFilters = aggTypes.length > 1 ? 
          Util.zip(this.appliedFilters, this.appliedFilterAggTypes)
          .filter( f => f[1] === aggType)
          .map( x => x[0]) 
          : this.appliedFilters;
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
    aggregation_field_lang_suffix_array: [null],
    build_and_apply_filters: 'buildAndApplyTextFilters',  // func name from Search.js
    sortType: 'relevance',
    sortTypeArray: [  // this array defines the sort options available for each search type
      {
        type: 'relevance',
        name: 'Relevance',
        heName: 'འབྲེལ་ཡོད་ཀྱི་དོན་དང་།',
        fieldArray: ['pagesheetrank'],
        sort_method: 'score',  // if sort_method == 'score', it will combine the standard elasticsearch score with `field`
        score_missing: 0.04,  // this default value comes from the equation used to calculate pagesheetrank. see search.py where this field is created
      },
      {
        type: 'chronological',
        name: 'Chronological',
        heName: 'དུས་ཀྱི་རིམ་པ།',
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
    aggregation_field_array: ['collections', 'topics'],
    aggregation_field_lang_suffix_array: [null, {'english': '_en', 'hebrew': '_he'}],
    build_and_apply_filters: 'buildAndApplySheetFilters',  // func name from Search.js
    sortType: 'relevance',
    sortTypeArray: [
      {
        type: 'relevance',
        name: 'Relevance',
        heName: 'འབྲེལ་ཡོད་ཀྱི་དོན་དང་།',
        fieldArray: [],
        sort_method: 'score',
      },
      {
        type: 'dateCreated',
        name: 'Date Created',
        heName: 'བཟོས་པའི་དུས།',
        fieldArray: ['dateCreated'],
        sort_method: 'sort',
        direction: 'desc',
      },
      {
        type: 'views',
        name: 'Views',
        heName: 'བལྟས་པ།',
        fieldArray: ['views'],
        sort_method: 'sort',
        direction: 'desc',
      },
    ],
  },
};

export default SearchState;
