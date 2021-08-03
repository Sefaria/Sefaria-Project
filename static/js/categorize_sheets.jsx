class SheetCategorizer extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      sheetId: props.sheetId,
      tags: [],
      categories: {},
      allCategories: props.allCategories,
      noTags: false,
      previousTags: [],
      adminType: props.adminType,
    };
    this.saveAndNext = this.saveAndNext.bind(this);
    this.reactTags = React.createRef();
  }

  componentDidMount() {
    this.getSheet();
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.sheetId !== prevState.sheetId) {
      this.getSheet();
    }
  }

  onTagDelete(i) {
    const tags = this.state.tags.slice(0);
    tags.splice(i, 1);
    if (tags.length === 0) {
      this.setState({ tags, previousTags: tags, noTags: true });
    }
    else {
      this.setState({tags, previousTags: tags})
    }
  }

  onTagAddition(tag) {
    const tags = [].concat(this.state.tags, tag);
    this.setState({ tags, previousTags: tags, noTags: false });
  }

  updateSuggestedTags(input) {
    if (input == "") return;
    Sefaria.getName(input, false, 0)
      .then((d) => {
        const topics = d.completion_objects
          .filter((obj) => obj.type === "Topic")
          .map((filteredObj, index) => ({
            id: index,
            name: filteredObj.title,
            slug: filteredObj.key,
          }));
        return topics;
      })
      .then((topics) => this.setState({ suggestions: topics }));
  }

  saveAndNext() {
    const topics = this.state.tags.map(tag => ({
      asTyped: tag.name,
      slug: tag.slug,
    }));
    const currentCategories = this.state.categories;
    const keys = Object.keys(currentCategories);
    const categoriesToSend = keys.filter(x => currentCategories[x])
    this.putSheetAndUpdateNext({ 
      sheetId: this.state.sheetId,
      tags: topics,
      noTags: this.state.noTags,
      categories: categoriesToSend
     });
  }

  putSheetAndUpdateNext(postJSON) {
    jQuery.ajax(
      {
        type: 'PUT',
        url: this.props.doesNotContain === "topics" ? "/api/sheets/next-untagged" : "/api/sheets/next-uncategorized",
        contentType: 'application/json',
        data: JSON.stringify(postJSON), // access in body
        success: function(data) {
          if (data.sheetId) {
            this.setState({ sheetId: data.sheetId, allCategories: data.allCategories });
          } else {
            console.log(data);
          }
        }.bind(this)
      });
  }

  getSheet() {
    Sefaria.sheets.loadSheetByID(
      this.state.sheetId,
      function (x) {
        const topics = x.topics.map((topic, i) => ({
          id: i,
          name: topic["asTyped"],
          slug: topic["slug"],
        })
      )
      const categories = x.categories ? x.categories.reduce((a, x) => {
        return {...a, [x]: true}
      }, {}) : {};
      this.setState({ tags: topics, previousTags: topics, categories: categories, noTags: x.noTags});
      }.bind(this)
    );
  }

  addCategory(e) {
    if(e.key === "Enter" || e.key === "Tab" || e.key === "," || e.type == "click") {
      const newCategoryElem = document.getElementById('newCategory')
      this.setState({
        allCategories: [...this.state.allCategories, newCategoryElem.value]
      })
      newCategoryElem.value = "";
    }
  }

  handleCategoryToggle(e) {
    const categories = this.state.categories;
    categories[e.target.name] = e.target.checked;
    this.setState({categories: categories})
  }

  handleNoTagsChange(e) {
    const target = e.target;
    const value = target.checked;
    if(value === true) { // remove Tags
      this.setState({
        noTags: value,
        tags: []
      });
    } else { 
      this.setState({
        noTags: value,
        tags: this.state.previousTags
      });
    }
  }

  render() {
    return (
      <div className="categorizer">
        <div id="edit-pane">
          <h3>Topics/Tags:</h3>
          <div class="categorize-section">
          <input
          type="checkbox"
          name="noTags"
          checked={this.state.noTags || false}
          onChange={this.handleNoTagsChange.bind(this)}
          ></input>
          <label htmlFor="noTags">No Tags</label>
          </div>
          <div class="publishBox">
          <reactTagGlobal.ReactTags
            ref={this.reactTags}
            allowNew={true}
            tags={this.state.tags}
            suggestions={this.state.suggestions}
            onDelete={this.onTagDelete.bind(this)}
            onAddition={this.onTagAddition.bind(this)}
            placeholderText={Sefaria._("Add a topic...")}
            delimiters={["Enter", "Tab", ","]}
            onInput={this.updateSuggestedTags.bind(this)}
          />
          </div>
        <div class="categorize-section">
          <fieldset>
           <h3> Categories:</h3>
        {
        this.state.allCategories.map(category => (
          <div>
          <input
          type="checkbox"
          onChange={this.handleCategoryToggle.bind(this)}
          key={category}
          name={category}
          checked={this.state.categories[category] || false}
          ></input>
          <label htmlFor={category}>{category}</label>
          </div>
        ))
      }
      </fieldset>
      <input type="text" id="newCategory" placeholder="New Category" onKeyUp={this.addCategory.bind(this)}></input><button onClick={this.addCategory.bind(this)}>Add</button>
      </div>
        <button onClick={this.saveAndNext}>Save and Next</button>
        </div>
        <div id="iframeContainer">
          <iframe
            className="sheet"
            src={"../sheets/" + this.state.sheetId}
          ></iframe>
        </div>
      </div>
    );
  }
}

Sefaria.unpackDataFromProps(DJANGO_VARS.props);

ReactDOM.render(
  React.createElement(SheetCategorizer, DJANGO_VARS.props),
  document.getElementById("content")
);