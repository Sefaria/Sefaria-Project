var input = "import ReactTags from 'react-tag-autocomplete'";
Babel.transform(input, { presets: [["env", { modules: "commonjs" }]] }).code;
class SheetCategorizer extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      sheetId: props.sheetId,
      tags: [],
      categories: {},
      allCategories: props.allCategories,
      noTags: false,
      adminType: props.adminType,
    };
    this.saveAndNext = this.saveAndNext.bind(this);

    this.reactTags = React.createRef();
    // this.categorizeSelections = React.createRef();
  }

  onTagDelete(i) {
    const tags = this.state.tags.slice(0);
    tags.splice(i, 1);
    this.setState({ tags });
  }

  onTagAddition(tag) {
    const tags = [].concat(this.state.tags, tag);
    this.setState({ tags });
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
  
  componentDidMount() {
    this.getSheet();
  }

  componentDidUpdate(prevProps, prevState) {
    // Typical usage (don't forget to compare props):
    console.log("componentDidUpdate");
    if (this.state.sheetId !== prevState.sheetId) {
      console.log("componentDidUpdate different state");
      this.getSheet();
    }
  }

  componentWillUnmount() {}

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
            console.log("saved...");
            this.setState({ sheetId: data.sheetId, allCategories: data.allCategories });
          } else {
            console.log(data);
          }
        }.bind(this)
      });
  }

  getSheet() {
    /* Load sheet when sheetId changes */
    Sefaria.sheets.loadSheetByID(
      this.state.sheetId,
      function (x) {
        console.log(x);
        const topics = x.topics.map((topic, i) => ({
          id: i,
          name: topic["asTyped"],
          slug: topic["slug"],
        })
      )
      const categories = x.categories ? x.categories.reduce((a, x) => {
        return {...z, [x]: true}
      }, {}) : {};
      this.setState({ tags: topics, categories: categories, noTags: x.noTags});
        console.log("hi");
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
    console.log(this)
  }

  handleInputChange(e) {
    const target = e.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const name = target.name;

    this.setState({
      [name]: value
    });
  }

  render() {
    return (
      <div className="categorizer">
        <div id="edit-pane">
          Left pane
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
          <div>
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
      <input type="text" id="newCategory" placeholder="New Category" onKeyUp={this.addCategory.bind(this)}></input><button onClick={this.addCategory.bind(this)}>Add</button>
      </div>
          <input
          type="checkbox"
          name="noTags"
          checked={this.state.noTags || false}
          onChange={this.handleInputChange.bind(this)}
          ></input>
          <label htmlFor="noTags">No Tags</label>
          <button onClick={this.saveAndNext}>Next Sheet</button>
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