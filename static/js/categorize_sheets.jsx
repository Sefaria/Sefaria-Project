import "core-js/stable";
import "regenerator-runtime/runtime";
import React  from 'react';
import ReactDOM  from 'react-dom';
import ReactTags from 'react-tag-autocomplete'
import DjangoCSRF  from './lib/django-csrf';
import Sefaria  from './sefaria/sefaria';

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
      skipIds: [],
      doesNotContain: props.doesNotContain
    };
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
      this.setState({ tags, previousTags: tags })
    }
  }

  onTagAddition(tag) {
    // DIAGNOSTIC LOGGING: Track what tag object ReactTags creates
    console.log('[SLUGLESS_TOPIC_TRACKER] categorize_sheets.jsx onTagAddition(): Tag added by user:', tag);
    if (!tag.slug) {
      console.error('[SLUGLESS_TOPIC_TRACKER] categorize_sheets.jsx onTagAddition(): NEW TAG WITHOUT SLUG!', tag);
      console.error('[SLUGLESS_TOPIC_TRACKER] categorize_sheets.jsx: This is likely a user-created tag via allowNew=true');
    }

    const tags = [].concat(this.state.tags, tag);
    this.setState({ tags, previousTags: tags, noTags: false });
  }

  updateSuggestedTags(input) {
    if (input == "") return;
    Sefaria.getName(input, 0)
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

    // DIAGNOSTIC LOGGING: Track what topics are being sent from categorization
    console.log('[SLUGLESS_TOPIC_TRACKER] categorize_sheets.jsx saveAndNext(): Sending topics to API:', topics);
    topics.forEach((topic, idx) => {
      if (!topic.slug) {
        console.error(`[SLUGLESS_TOPIC_TRACKER] categorize_sheets.jsx: Topic at index ${idx} has NO SLUG! Topic:`, topic);
        console.error('[SLUGLESS_TOPIC_TRACKER] categorize_sheets.jsx: Original tag from ReactTags:', this.state.tags[idx]);
      }
    });

    const currentCategories = this.state.categories;
    const keys = Object.keys(currentCategories);
    const categoriesToSend = keys.filter(x => currentCategories[x])
    this.putSheetAndUpdateNext({
      sheetId: this.state.sheetId,
      tags: topics,
      noTags: this.state.noTags,
      categories: categoriesToSend,
      skipIds: this.state.skipIds
    });
  }

  skipAndNext() {
    this.setState({
      skipIds: [...this.state.skipIds, this.state.sheetId]
    }, () => {
      this.putSheetAndUpdateNext({
        skipIds: this.state.skipIds
      })
    })
  }

  putSheetAndUpdateNext(postJSON) {
    jQuery.ajax(
      {
        type: 'PUT',
        url: this.state.doesNotContain === "topics" ? "/api/sheets/next-untagged" : "/api/sheets/next-uncategorized",
        contentType: 'application/json',
        data: JSON.stringify(postJSON), // access in body
        success: function (data) {
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
      this.updateStateWithNewSheet.bind(this)
      );
  }

  updateStateWithNewSheet(sheet) {
    const topics = sheet.topics.map((topic, i) => ({
      id: i,
      name: topic["asTyped"],
      slug: topic["slug"],
    })
    )
    const categories = sheet.categories ? sheet.categories.reduce((a, x) => {
      return { ...a, [x]: true }
    }, {}) : {};
    this.setState({ tags: topics, previousTags: topics, categories: categories, noTags: sheet.noTags });
  }

  addCategory(e) {
    if (e.key === "Enter" || e.key === "Tab" || e.key === "," || e.type == "click") {
      const newCategoryElem = document.getElementById('newCategory')
      if (newCategoryElem !== "" && !this.state.allCategories.includes(newCategoryElem)) {
        this.setState({
          allCategories: [...this.state.allCategories, newCategoryElem.value]
        })
      }
      newCategoryElem.value = "";
    }
  }

  handleCategoryToggle(e) {
    const categories = this.state.categories;
    categories[e.target.name] = e.target.checked;
    this.setState({ categories: categories })
  }

  handleNoTagsChange(e) {
    const target = e.target;
    const value = target.checked;
    if (value === true) { // remove Tags
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

  toggleSheetSortingMechanism() {
    this.setState({ doesNotContain: this.getOpposite(this.state.doesNotContain) },
    () => {this.putSheetAndUpdateNext({
      skipIds: this.state.skipIds
    })})
  }

  getOpposite(keyword) {
    return keyword === "topics" ? "categories" : "topics"
  }

  render() {
 
    return (
      <div className="categorizer">
        <div id="edit-pane">
          <h3>Topics/Tags:</h3>
          
          <div className="publishBox">
            <ReactTags
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
          <div className="categorize-section">
            <input
              type="checkbox"
              name="noTags"
              key="noTags"
              checked={this.state.noTags || false}
              onChange={this.handleNoTagsChange.bind(this)}
            ></input>
            <label htmlFor="noTags">No Tags</label>
          </div>
          <div className="categorize-section">
            <fieldset>
              <h3> Categories:</h3>
              {
                this.state.allCategories.map((category, i) => (
                  <div key={i}>
                    <input
                      type="checkbox"
                      onChange={this.handleCategoryToggle.bind(this)}
                      key={i}
                      name={category}
                      checked={this.state.categories[category] || false}
                    ></input>
                    <label htmlFor={category}>{category}</label>
                  </div>
                ))
              }
            </fieldset>
            <input type="text" key="newCategory" id="newCategory" placeholder="New Category" onKeyUp={this.addCategory.bind(this)}></input><button onClick={this.addCategory.bind(this)}>Add</button>
          </div>
          <button id="save-and-next" onClick={this.saveAndNext.bind(this)}>Save and Next</button>
          <div className="left-pane-bottom">
            <h3>Settings/Admin:</h3>
            <h4>Latest sheets without: {this.state.doesNotContain}</h4>
            <div>
            <button onClick={this.toggleSheetSortingMechanism.bind(this)}>Switch to finding sheets without: {this.getOpposite(this.state.doesNotContain)}</button>
            </div>
            <div>
            <button onClick={this.skipAndNext.bind(this)}>Skip this sheet</button>
            </div>
            Sheet will not be saved!
          </div>
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

DjangoCSRF.init();


ReactDOM.render(
  React.createElement(SheetCategorizer, DJANGO_VARS.props),
  document.getElementById("content")
);