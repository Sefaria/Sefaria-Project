var input = "import ReactTags from 'react-tag-autocomplete'";
Babel.transform(input, { presets: [["env", { modules: "commonjs" }]] }).code;
class SheetCategorizer extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      sheetId: props.sheetId,
      tags: [],
      categories: [],
      adminType: props.adminType,
    };
    this.getNextSheet = this.getNextSheet.bind(this);
    this.saveAndNext = this.saveAndNext.bind(this);

    this.reactTags = React.createRef();
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

  getNextSheet() {
    this.setState({ sheetId: 123 });
  }

  saveAndNext() {
    const topics = this.state.tags.map(tag => ({
      asTyped: tag.name,
      slug: tag.slug,
    })
)
    this.putSheet({ 
      sheetId: this.state.sheetId,
      tags: topics });
  }

  putSheet(postJSON) {
    const requestOptions = {
      credentials: "same-origin",
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postJSON),
    };
    jQuery.ajax(
      {
        type: 'PUT',
        url: '/api/sheets/next-uncategorized',
        contentType: 'application/json',
        data: JSON.stringify(postJSON), // access in body
        success: function(data) {
          if (data.sheetId) {
            console.log("saved...");
            this.setState({ sheetId: data.sheetId });
          } else {
            console.log(data);
          }
        }.bind(this)
      });

    // fetch("/api/sheets/next-untagged", requestOptions)
    //   .then((res) => res.json)
    //   .then((data) => {
    //     if (data.sheetId) {
    //       console.log("saved...");
    //       this.setState({ sheetId: data.sheetId });
    //     } else {
    //       console.log(data);
    //     }
    //   });
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
        this.setState({ sheet: x, tags: topics});
        console.log("hi");
      }.bind(this)
    );
  }

  render() {
    return (
      <div className="categorizer">
        <div id="edit-pane">
          Left pane
          <window.ReactTags
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