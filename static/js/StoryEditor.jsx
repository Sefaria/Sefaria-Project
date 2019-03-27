const React      = require('react');
const ReactDOM   = require('react-dom');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
const Story      = require('./Story');

import Component from 'react-class';


class StoryEditor extends Component {
  constructor(props) {
    super(props);

    this.state = {
      page: 0,
      loadedToEnd: false,
      loading: false,
      stories: [],
      submitting: false,
      error: null
    };
  }
  componentDidMount() {
    $(ReactDOM.findDOMNode(this)).find(".content").bind("scroll", this.handleScroll);
    this.getMoreStories();
  }
  handleScroll() {
    if (this.state.loadedToEnd || this.state.loading) { return; }
    var $scrollable = $(ReactDOM.findDOMNode(this)).find(".content");
    var margin = 600;
    if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
      this.getMoreStories();
    }
  }
  getMoreStories() {
    $.getJSON("/api/stories?only_global=1&page=" + this.state.page, this.loadMoreStories);
    this.setState({loading: true});
  }
  loadMoreStories(data) {
    if (data.count < data.page_size) {
      this.setState({loadedToEnd: true});
    }
    this.setState({page: data.page + 1, loading: false, stories: this.state.stories.concat(data.stories)});
  }
  onDelete(id) {
    $.ajax({
        url: '/api/updates/' + id,
        type: 'DELETE',
        success: function(result) {
          if (result.status == "ok") {
              this.setState({stories: this.state.stories.filter(u => u._id != id)});
          }
        }.bind(this)
    });
  }
  removeDraft(timestamp) {
      this.setState({stories: this.state.stories.filter(u => (!u.draft) || u.timestamp != timestamp)});
  }
  addStory(data) {
        this.state.stories.unshift(data);
        this.setState({stories: this.state.stories});
  }
  handlePublish(type, content) {
    this.setState({"submitting": true, "error": null});
    const payload = {
      storyForm: type,
      data: content
    };
    $.ajax({
      url: "/api/updates",
      dataType: 'json',
      type: 'POST',
      data: {json: JSON.stringify(payload)},
      success: function(data) {
        if (data.status == "ok") {
          payload.date = Date();
          this.state.stories.unshift(payload);
          this.setState({submitting: false, stories: this.state.stories});
        } else {
          this.setState({"error": "Error - " + data.error});
        }
      }.bind(this),
      error: function(xhr, status, err) {
        this.setState({"error": "Error - " + err.toString()});
        console.error(this.props.url, status, err.toString());
      }.bind(this)
    });
  }
  render() {
    var classes = {notificationsPanel: 1, systemPanel: 1, readerNavMenu: 1, noHeader: 1 };
    var classStr = classNames(classes);

    return (
      <div className={classStr}>
        <div className="content hasFooter">
          <div className="contentInner">
            <h1>
              <span className="int-en">Stories</span>
              <span className="int-he">עדכונים</span>
            </h1>

            {Sefaria.is_moderator?<CreateStoryForm addStory={this.addStory}/>:""}

            <div className="storyFeed">
            {this.state.stories.map(s =>
                [
                    Story(s),
                    <StoryEditBar
                        onDelete={this.onDelete}
                        removeDraft={this.removeDraft}
                        handlePublish={this.handlePublish}
                        isDraft={s.draft}
                        key={s.timestamp + "e"}
                        story={s}/>
                ]).flat() }
            </div>
          </div>
        </div>
      </div>);
  }
}
StoryEditor.propTypes = {
  interfaceLang:  PropTypes.string
};

class StoryEditBar extends Component {
  constructor(props) {
    super(props);

    this.state = {
      deleting: false
    };
  }
    handlePublish() {
        this.props.handlePublish(this.props.story.storyForm, this.props.story.data)
    }
    onDelete() {
        if(this.props.isDraft) {
            this.props.removeDraft(this.props.story.timestamp);
        } else {
            this.setState({deleting: true});
            this.props.onDelete(this.props.story._id);
        }
    }
    render() {
        if (!Sefaria.is_moderator) {return}
        return (<div>
            {(this.props.isDraft)?<div className="story-action-button" onClick={this.handlePublish}>Publish</div>:""}
            {this.state.deleting?<div className="lds-ring"><div></div><div></div><div></div><div></div></div>:
            <div className="story-action-button" onClick={this.onDelete}>Delete</div>
            }
        </div>);
    }
}
StoryEditBar.propTypes = {
  interfaceLang:     PropTypes.string,
  onDelete:          PropTypes.func,
  handlePublish:     PropTypes.func,
  removeDraft:       PropTypes.func,
  isDraft:           PropTypes.bool,
  story:             PropTypes.object
};


class CreateStoryForm extends Component {
  constructor(props) {
    super(props);
    this.state = {
        typeName: 'New Index',
        data: {},
        error: ''
    };
  }
  componentWillReceiveProps(nextProps) {
    this.setState({"error": nextProps.error});
  }
  handleTypeNameChange(e) {
    this.setState({typeName: e.target.value, error: null});
  }

  editForms() {
    return {
        "Free Text":       FreeTextStoryForm,
        "New Index":       NewIndexStoryForm,
        "New Version":     NewVersionStoryForm,
        "Text Passage":    TextPassageStoryForm,

        /*
        publishSheet:   PublishSheetStory,
        author:         AuthorStory,
        topic:          TopicStory,
        topicList:      TopicListStory,
        sheetList:      SheetListStory,
        userSheets:     UserSheetsStory,
        groupSheetList: GroupSheetListStory
        */
    };
  }

  render() {
      const EditForm = withButton(this.editForms()[this.state.typeName], this.props.addStory);

      return (
          <div className="globalUpdateForm">
              <div>
                  <label>
                      Story Type:
                      <select value={this.state.typeName} onChange={this.handleTypeNameChange}>
                          {Object.entries(this.editForms()).map(e => <option value={e[0]} key={e[0]}>{e[0]}</option>)}
                      </select>
                  </label>
              </div>
              <EditForm/>
          </div>
      );
  }
}
CreateStoryForm.propTypes = {
  addStory:         PropTypes.func
};


function withButton(WrappedFormComponent, addStory) {
  // ...and returns another component...
  return class extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            submitting: false,
            error: null,
        };
        this.formRef = React.createRef();
        this.handleReflect = this.handleReflect.bind(this);
    }
    handleReflect() {
        if (!this.formRef.current.isValid()) {
            this.setState({"error": "Incomplete"});
            return;
        }
        this.setState({"submitting": true, "error": null});
        $.ajax({
            url: "/api/story_reflector",
            dataType: 'json',
            type: 'POST',
            data: {json: JSON.stringify(this.formRef.current.payload())},
            success: function (data) {
                if ("error" in data) {
                  this.setState({"error": "Error - " + data.error});
                } else {
                    data["draft"] = true;
                    addStory(data);
                    this.setState({submitting: false});
                }
            }.bind(this),
            error: function (xhr, status, err) {
                this.setState({"error": "Error - " + err.toString()});
                console.error(this.props.url, status, err.toString());
            }.bind(this)
        });
    }
    render() {
      // ... and renders the wrapped component with the fresh data!
      // Notice that we pass through any additional props
      const disabled = (this.state.submitting ||
          (this.formRef.current && (!this.formRef.current.isValid())));

      return <div>
        <WrappedFormComponent ref={this.formRef} {...this.props} />
        <input type="button" value="Preview" disabled={disabled} onClick={this.handleReflect}/>
        <span className="error">{this.state.error}</span>
      </div>;
    }
  };
}


class TextPassageStoryForm extends Component {
    constructor(props) {
        super(props);
        this.state = {
            type: 'textPassage',
            error: ''
        };
        this.field_refs = {};
    }
    payload() {
        const d = { ref: this.field_refs.ref.getValue() };
        return {
          storyForm: this.state.type,
          data: d
        };
    }
    isValid() {

        if (!Object.values(this.field_refs).every(e => e.isValid())) {
            return false;
        }
        // Required Fields
        if (!["ref"].every(k => this.field_refs[k].getValue())) {
            return false;
        }
        return true;
    }
    recordRef(field) {
        return ref => this.field_refs[field] = ref;
    }
    render() {
        return (
            <div>
                <StoryFormRefField ref={this.recordRef("ref")} />
            </div>);
    }
}
TextPassageStoryForm.propTypes = {
    setPayload: PropTypes.func
};

class FreeTextStoryForm extends Component {
    constructor(props) {
        super(props);
        this.state = {
            type: 'freeText',
            error: ''
        };
        this.field_refs = {};
    }
    payload() {
        const d = {
            en: this.field_refs.en.getValue(),
            he: this.field_refs.he.getValue(),
        };
        return {
          storyForm: this.state.type,
          data: d
        };
    }
    isValid() {
        if (!Object.values(this.field_refs).every(e => e.isValid())) {
            return false;
        }
        // Required Fields
        if (!["en","he"].every(k => this.field_refs[k].getValue())) {
            return false;
        }
        return true;
    }
    recordRef(field) {
        return ref => this.field_refs[field] = ref;
    }
    render() {
        return (
            <div>
                <StoryFormTextField ref={this.recordRef("en")} placeholder="English"/>
                <StoryFormTextField ref={this.recordRef("he")} placeholder="Hebrew"/>
            </div>);
    }
}
FreeTextStoryForm.propTypes = {
    setPayload: PropTypes.func
};

class NewVersionStoryForm extends Component {
    constructor(props) {
        super(props);
        this.state = {
            type: 'newVersion',
            error: ''
        };
        this.field_refs = {};
    }
    payload() {
        const d = { index: this.field_refs.index.getValue() };
        Object.assign(d, this.field_refs.version.getValue());
        ["ref","en","he"].forEach(p => {if (!!this.field_refs[p].getValue()) {d[p] = this.field_refs[p].getValue()}});
        return {
          storyForm: this.state.type,
          data: d
        };
    }
    isValid() {
        if (!Object.values(this.field_refs).every(e => e.isValid())) {
            return false;
        }
        // Required Fields
        if (!["index"].every(k => this.field_refs[k].getValue())) {
            return false;
        }
        return true;
    }
    recordRef(field) {
        return ref => this.field_refs[field] = ref;
    }
    render() {
        return (
            <div>
                <StoryFormIndexField ref={this.recordRef("index")}/>
                <StoryFormVersionFields ref={this.recordRef("version")}/>
                <StoryFormTextField ref={this.recordRef("en")} placeholder="English Description (optional)"/>
                <StoryFormTextField ref={this.recordRef("he")} placeholder="Hebrew Description (optional)"/>
                <StoryFormRefField ref={this.recordRef("ref")} />
            </div>);
    }
}
NewVersionStoryForm.propTypes = {
    setPayload: PropTypes.func
};

class NewIndexStoryForm extends Component {
    constructor(props) {
        super(props);
        this.state = {
            type: 'newIndex',
            error: ''
        };
        this.field_refs = {};
    }
    payload() {
        const d = { index: this.field_refs.index.getValue() };
        ["ref","en","he"].forEach(p => {if (!!this.field_refs[p].getValue()) {d[p] = this.field_refs[p].getValue()}});
        return {
          storyForm: this.state.type,
          data: d
        };
    }
    isValid() {
/*
        if (!Object.values(this.field_refs).every(e => e.isValid())) {
            return false;
        }
        // Required Fields
        if (!["index"].every(k => this.field_refs[k].getValue())) {
            return false;
        } */
        return true;
    }
    recordRef(field) {
        return ref => this.field_refs[field] = ref;
    }
    render() {
        return (
            <div>
                <StoryFormIndexField ref={this.recordRef("index")}/>
                <StoryFormTextField ref={this.recordRef("en")} placeholder="English Description (optional)"/>
                <StoryFormTextField ref={this.recordRef("he")} placeholder="Hebrew Description (optional)"/>
                <StoryFormRefField ref={this.recordRef("ref")} />
            </div>);
    }
}
NewIndexStoryForm.propTypes = {
    setPayload: PropTypes.func
};

class StoryFormIndexField extends Component {
  constructor(props) {
    super(props);
    this.state = {
        value: '',
        error: ''
    };
  }
    getValue() {
        return this.state.value.trim();
    }
    isValid() {
        return (this.state.value && (!this.state.error));
    }
    handleChange(e) {
        this.setState({value: e.target.value});
        this.validate();
    }
    validate() {
      /*
        if (Sefaria.index(this.state.value)) {
            this.setState({error: ''});
        } else {
            this.setState({error: "Not an Index"});
        }
        */
    }
    render() {
      return <div>
        <input type="text" placeholder="Index Title" onChange={this.handleChange} />
        <span className="error">{this.state.error}</span>
      </div>;
  }
}

class StoryFormVersionFields extends Component {
  constructor(props) {
    super(props);
    this.state = {
        language: "en",
        version: '',
        error: ''
    };
  }
    getValue() {
        return {
            language: this.state.language,
            version: this.state.versionTitle
        }
    }
    isValid() {
      return (this.state.language && this.state.version && (!this.state.error));
    }
    handleLanguageChange(e) {
        this.setState({language: e.target.value});
        this.validate();
    }
    handleVersionChange(e) {
        this.setState({version: e.target.value});
        this.validate();
    }
    validate() {
        //todo: See if this is a valid version
    }
    render() {
      return <div>
        <select type="text" value={this.state.language} placeholder="Version Language" onChange={this.handleLanguageChange}>
            <option value="en">English</option>
            <option value="he">Hebrew</option>
          </select>
        <input type="text" value={this.state.version} placeholder="Version Title" onChange={this.handleVersionChange}/>
        <span className="error">{this.state.error}</span>
      </div>
    }
}

class StoryFormTextField extends Component {
  constructor(props) {
    super(props);
    this.state = {
        value: '',
        error: ''
    };
  }
    getValue() {
        return this.state.value.trim();
    }
    isValid() {
      return (this.state.value && (!this.state.error));
    }
    handleChange(e) {
        this.setState({value: e.target.value});
        this.validate();
    }
    validate() {

    }
    render() {
      return <div>
        <textarea
            placeholder={this.props.placeholder}
            value={this.state.value}
            onChange={this.handleChange}
            rows="3"
            cols="80" />
        <span className="error">{this.state.error}</span>
      </div>;
    }
}

class StoryFormRefField extends Component {
    constructor(props) {
        super(props);
        this.state = {
            value: '',
            error: ''
        };
    }

    getValue() {
        return this.state.value.trim();
    }

    isValid() {
      return (this.state.value && (!this.state.error));
    }

    handleChange(e) {
        this.setState({value: e.target.value});
        this.validate();
    }
    validate() {
        if (Sefaria.isRef(this.state.value)) {
            this.setState({error: ''});
        } else {
            this.setState({error: "Not a Ref"});
        }
    }

    render() {
        return <div>
            <input type="text" value={this.state.value} placeholder="Ref" onChange={this.handleChange}/>
            <span className="error">{this.state.error}</span>
        </div>;
    }
}

class StoryFormUserField extends Component {

}
class StoryFormAuthorField extends Component {

}
class StoryFormSheetfield extends  Component {

}

module.exports = StoryEditor;
