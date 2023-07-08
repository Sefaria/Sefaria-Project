class FilterNode {
  //FilterTree object - for category filters
  constructor({ title, heTitle, docCount, aggKey, aggType, children, parent, selected } = {}) {
      this.title = title;
      this.heTitle = heTitle;
      this.docCount = docCount;
      this.aggKey = aggKey;
      this.aggType = aggType;
      this.children = typeof children === 'undefined' ? [] :
        children.map(child => {
            if (child instanceof FilterNode) { return child; }
            return this.restoreFromSerialization(child);
        }
      );
      this.parent = typeof parent === 'undefined' ? null : parent;
      this.selected = (typeof selected === 'undefined') ? 0 : selected; //0 - not selected, 1 - selected, 2 - partially selected
  }

    /**
     * FilterNodes get serialized when stored in browser history
     * We need to recreate them and make sure they fit into the FilterNode tree
     * @param serializedFilterNode - plain JS object with the fields of a FilterNode
     * @returns {FilterNode}
     */
  restoreFromSerialization(serializedFilterNode) {
      const fullFilterNode = new FilterNode(serializedFilterNode);
      fullFilterNode.parent = this;
      return fullFilterNode;
  }
  sumDocs() {
      if (!this.hasChildren()) {
          return this.docCount;
      }
      this.docCount = this.children.reduce((sum, child) => sum + child.sumDocs(), 0);
      return this.docCount;
  }
  append(child) {
      this.children.push(child);
      child.parent = this;
  }
  hasChildren() {
      return (this.children.length > 0);
  }
  getLeafNodes(searchFilterText) {
      //Return ordered array of leaf (book) level filters
      if (!this.hasChildren()) {
          return [this];
      }
      var results = [];
      for (var i = 0; i < this.children.length; i++) {
          results = results.concat(this.children[i].getLeafNodes(searchFilterText));
      }
      if (searchFilterText && searchFilterText != "") {
          results = results.filter(x => x.title.match(new RegExp(`(?:^|.+\\s)${searchFilterText}.*`, "i")) || x.heTitle.match(new RegExp(`(?:^|.+\\s)${searchFilterText}.*`, "i")));
      }
      return results;
  }
  getId() {
      return this.aggKey.replace(new RegExp("[/',()]", 'g'),"-").replace(new RegExp(" ", 'g'),"_");
  }
  isSelected() {
      return (this.selected === 1);
  }
  isPartial() {
      return (this.selected === 2);
  }
  isUnselected() {
      return (this.selected === 0);
  }
  setSelected(propogateParent, noPropogateChild) {
      //default is to propogate children and not parents.
      //Calls from front end should use (true, false), or just (true)
      this.selected = 1;
      if (!(noPropogateChild)) {
          for (var i = 0; i < this.children.length; i++) {
              this.children[i].setSelected(false);
          }
      }
      if(propogateParent) {
          if(this.parent) this.parent._deriveState();
      }
  }
  setUnselected(propogateParent, noPropogateChild) {
      //default is to propogate children and not parents.
      //Calls from front end should use (true, false), or just (true)
      this.selected = 0;
      if (!(noPropogateChild)) {
          for (var i = 0; i < this.children.length; i++) {
              this.children[i].setUnselected(false);
          }
      }
      if(propogateParent) {
          if(this.parent) this.parent._deriveState();
      }

  }
  setPartial() {
      //Never propogate to children.  Always propogate to parents
      this.selected = 2;
      if(this.parent) this.parent._deriveState();
  }
  _deriveState() {
      //Always called from children, so we can assume at least one
      var potentialState = this.children[0].selected;
      if (potentialState === 2) {
          this.setPartial();
          return
      }
      for (var i = 1; i < this.children.length; i++) {
          if (this.children[i].selected !== potentialState) {
              this.setPartial();
              return
          }
      }
      //Don't use setters, so as to avoid looping back through children.
      if(potentialState === 1) {
          this.setSelected(true, true);
      } else {
          this.setUnselected(true, true);
      }
  }
  hasAppliedFilters() {
      return (this.getAppliedFilters().length > 0)
  }
  getAppliedFilters() {
      if (this.isUnselected()) {
          return [];
      }
      if (this.isSelected()) {
          return [this.aggKey];
      }
      var results = [];
      for (var i = 0; i < this.children.length; i++) {
          results = results.concat(this.children[i].getAppliedFilters());
      }
      return results;
  }
  getSelectedTitles(lang) {
      if (this.isUnselected()) {
          return [];
      }
      if (this.isSelected()) {
          let enTitle = !!this.title ? this.title : this.heTitle;
          let heTitle = !!this.heTitle ? this.heTitle : this.title;
          if (!enTitle) {
            if (this.aggType === 'collections') { enTitle = '(No Collection)'; }
            if (this.aggType === 'tags') { enTitle = '(No Tag)'; }
          }
          if (!heTitle) {
            if (this.aggType === 'collections') { heTitle = '(ללא אסופה)'; }
            if (this.aggType === 'tags') { heTitle = '(ללא תוית)'; }
          }
          return[(lang === "en")?enTitle:heTitle];
      }
      let results = [];
      for (let i = 0; i < this.children.length; i++) {
          results = results.concat(this.children[i].getSelectedTitles(lang));
      }
      return results;
  }

    /**
     * Returns a clone of this FilterNode
     * @param prepareForSerialization: bool, if true, sets `parent` field to null. This field is an issue when serializing FilterNode because it recursively refers to existing FilterNodes.
     * @returns {FilterNode}
     */
  clone(prepareForSerialization) {
      return this._clone(prepareForSerialization, null);
  }

    /**
     * Internal clone function to with recursive params
     * @param prepareForSerialization
     * @param clonedParent
     * @returns {FilterNode}
     * @private
     */
  _clone(prepareForSerialization, clonedParent) {
      const cloned = new FilterNode(this);
      cloned.children = cloned.children.map( c => c._clone(prepareForSerialization, cloned));
      cloned.parent = prepareForSerialization ? null : clonedParent;
      return cloned;
  }
}

export default FilterNode;
