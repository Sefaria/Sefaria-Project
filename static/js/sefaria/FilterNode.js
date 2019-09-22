class FilterNode {
  //FilterTree object - for category filters
  constructor({ title, heTitle, docCount, aggKey, aggType, children, parent, selected } = {}) {
      this.title = title;
      this.heTitle = heTitle;
      this.docCount = docCount;
      this.aggKey = aggKey;
      this.aggType = aggType;
      this.children = typeof children === 'undefined' ? [] :
        children.map(c => {
          const ret = c instanceof FilterNode ? c : new FilterNode(c);
          ret.parent = this;
          return ret;
        }
      );
      this.parent = typeof parent === 'undefined' ? null : parent;
      this.selected = (typeof selected === 'undefined') ? 0 : selected; //0 - not selected, 1 - selected, 2 - partially selected
  }
  append(child) {
      this.children.push(child);
      child.parent = this;
  }
  hasChildren() {
      return (this.children.length > 0);
  }
  getLeafNodes() {
      //Return ordered array of leaf (book) level filters
      if (!this.hasChildren()) {
          return [this];
      }
      var results = [];
      for (var i = 0; i < this.children.length; i++) {
          results = results.concat(this.children[i].getLeafNodes());
      }
      return results;
  }
  getId() {
      return this.aggKey.replace(new RegExp("[/',()]", 'g'),"-").replace(new RegExp(" ", 'g'),"_");
  }
  isSelected() {
      return (this.selected == 1);
  }
  isPartial() {
      return (this.selected == 2);
  }
  isUnselected() {
      return (this.selected == 0);
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
      if (potentialState == 2) {
          this.setPartial();
          return
      }
      for (var i = 1; i < this.children.length; i++) {
          if (this.children[i].selected != potentialState) {
              this.setPartial();
              return
          }
      }
      //Don't use setters, so as to avoid looping back through children.
      if(potentialState == 1) {
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
            if (this.aggType === 'group') { enTitle = '(No Group)'; }
            if (this.aggType === 'tags') { enTitle = '(No Tag)'; }
          }
          if (!heTitle) {
            if (this.aggType === 'group') { heTitle = '(ללא קבוצה)'; }
            if (this.aggType === 'tags') { heTitle = '(ללא תוית)'; }
          }
          return[(lang == "en")?enTitle:heTitle];
      }
      var results = [];
      for (var i = 0; i < this.children.length; i++) {
          results = results.concat(this.children[i].getSelectedTitles(lang));
      }
      return results;
  }
  clone() {
    const cloned = new FilterNode({ ...this });
    const children = this.children.map( c => {
      const cloned_child = c.clone();
      cloned_child.parent = cloned;
      return cloned_child;
    });
    cloned.children = children;
    return cloned;
  }
}

export default FilterNode;
