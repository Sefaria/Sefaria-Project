import React, { useState, useEffect } from 'react';
const ReactDOM   = require('react-dom');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const PropTypes  = require('prop-types');
const Story      = require('./Story');

import Component from 'react-class';

// These are duplicated in trend.py needs to be more graceful
const traits = ["readsHebrew",
"toleratesEnglish",
"usesSheets",
"inDiaspora",
"inIsrael"];

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
    const $scrollable = $(ReactDOM.findDOMNode(this)).find(".content");
    const margin = 600;
    if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
      this.getMoreStories();
    }
  }
  getMoreStories() {
    $.getJSON("/api/stories?admin_feed=1&page=" + this.state.page, this.loadMoreStories);
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
        url: '/api/stories/' + id,
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
  handlePublish(type, content, timestamp) {
    this.setState({"submitting": true, "error": null});
    const payload = {
      storyForm: type,
      data: content
    };
    $.ajax({
      url: "/api/stories",
      dataType: 'json',
      type: 'POST',
      data: {json: JSON.stringify(payload)},
      success: function(data) {
        if (data.status == "ok") {
          payload.date = Date();
          const stories = this.state.stories.filter(u => (!u.draft) || u.timestamp != timestamp); // Get rid of draft.
          stories.unshift(payload);
          this.setState({submitting: false, stories: stories});
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
    return (
      <div className="homeFeedWrapper">
        <div className="content hasFooter">
          <div className="contentInner">
            <h1>
              <span className="int-en">Stories</span>
              <span className="int-he">עדכונים</span>
            </h1>

            <CreateStoryForm addStory={this.addStory}/>

            <div className="storyFeed">
            {this.state.stories.map((s,i) =>
                [
                    Story(s,i),
                    <StoryEditBar
                        onDelete={this.onDelete}
                        removeDraft={this.removeDraft}
                        handlePublish={this.handlePublish}
                        isDraft={s.draft}
                        key={s.timestamp + "-" + i + "-editor"}
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

function StoryEditBar(props) {
    const [isDeleting, setDeleting] = useState(false);

    function handlePublish() {
        props.handlePublish(props.story.storyForm, props.story.data, props.story.timestamp)
    }
    function onDelete() {
        if(props.isDraft) {
            props.removeDraft(props.story.timestamp);
        } else {
            setDeleting(true);
            props.onDelete(props.story._id);
        }
    }

    return (Sefaria.is_moderator?<div className="storyEditBar">
        {(props.isDraft)?<div className="story-action-button" onClick={handlePublish}>Publish</div>:""}
        {isDeleting?<div className="lds-ring"><div></div><div></div><div></div><div></div></div>:
                    <div className="story-action-button" onClick={onDelete}>Delete</div>}
        {props.story.mustHave && props.story.mustHave.map((trait,i) => <div className="storyEditorTag mustHave" key={i}>{trait}</div>)}
        {props.story.cantHave && props.story.cantHave.map((trait,i) => <div className="storyEditorTag cantHave" key={i}>{trait}</div>)}
    </div>:<div/>);

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
        "Free Text":        FreeTextStoryForm,
        "New Index":        NewIndexStoryForm,
        "New Version":      NewVersionStoryForm,
        "Text Passage":     TextPassageStoryForm,
        "Author":           AuthorStoryForm,
        "Topic Sources":    TopicSourcesStoryForm,
        "Topic Sheets":     TopicSheetsStoryForm,
        "Sheet List":       SheetListStoryForm,
        "User Sheets":      UserSheetsStoryForm,
        "Random Featured Sheets": FeaturedSheetsStoryForm,
        /*
        topicList:      TopicListStory,
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
              {Sefaria.is_moderator?<EditForm/>:""}
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


class FeaturedSheetsStoryForm extends Component {
    constructor(props) {
        super(props);
        this.state = {
            error: ''
        };
    }
    payload() {
        return {
          factory: "SheetListFactory",
          method: "generate_featured_story",
        };
    }
    isValid() {
        return true;
    }
    render() {
        return null;
    }
}


class SheetListStoryForm extends Component {
    constructor(props) {
        super(props);
        this.state = {
            error: ''
        };
        this.field_refs = {};
    }
    payload() {
        const ids_string = this.field_refs.ids.getValue();
        const ids = ids_string.split(/\s*,\s*/);
        return {
          factory: "SheetListFactory",
          method: "_generate_shared_story",
          sheet_ids: ids
        };
    }
    isValid() {
        if (!Object.values(this.field_refs).every(e => e.isValid())) {
            return false;
        }
        // Required Fields
        if (!["ids"].every(k => this.field_refs[k].getValue())) {
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
                <StoryFormTextField placeholder="id, id, id" ref={this.recordRef("ids")} />
            </div>);
    }
}



class UserSheetsStoryForm extends Component {
    constructor(props) {
        super(props);
        this.state = {
            error: ''
        };
        this.field_refs = {};
    }
    payload() {
        return {
          factory: "UserSheetsFactory",
          method: "_generate_shared_story",
          author_uid: this.field_refs.author_uid.getValue()
        };
    }
    isValid() {

        if (!Object.values(this.field_refs).every(e => e.isValid())) {
            return false;
        }
        // Required Fields
        if (!["author_uid"].every(k => this.field_refs[k].getValue())) {
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
                <StoryFormTextField placeholder="User ID" ref={this.recordRef("author_uid")} />
            </div>);
    }
}


class AuthorStoryForm extends Component {
    constructor(props) {
        super(props);
        this.state = {
            error: ''
        };
        this.field_refs = {};
    }
    payload() {
        return {
          factory: "AuthorStoryFactory",
          method: "_generate_shared_story",
          person: this.field_refs.person.getValue()
        };
    }
    isValid() {

        if (!Object.values(this.field_refs).every(e => e.isValid())) {
            return false;
        }
        // Required Fields
        if (!["person"].every(k => this.field_refs[k].getValue())) {
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
                <StoryFormTextField placeholder="Author Key" ref={this.recordRef("person")} />
            </div>);
    }
}


class TopicSourcesStoryForm extends Component {
    constructor(props) {
        super(props);
        this.state = {
            error: ''
        };
        this.field_refs = {};
    }
    payload() {
        return {
          factory: "TopicTextsStoryFactory",
          method: "_generate_shared_story",
          topic: this.field_refs.topic.getValue()
        };
    }
    isValid() {

        if (!Object.values(this.field_refs).every(e => e.isValid())) {
            return false;
        }
        // Required Fields
        if (!["topic"].every(k => this.field_refs[k].getValue())) {
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
                <StoryFormTextField placeholder="Topic" ref={this.recordRef("topic")} />
            </div>);
    }
}

class TopicSheetsStoryForm extends Component {
    constructor(props) {
        super(props);
        this.state = {
            error: ''
        };
        this.field_refs = {};
    }
    payload() {
        return {
          factory: "SheetListFactory",
          method: "generate_topic_story",
          topic: this.field_refs.topic.getValue()
        };
    }
    isValid() {

        if (!Object.values(this.field_refs).every(e => e.isValid())) {
            return false;
        }
        // Required Fields
        if (!["topic"].every(k => this.field_refs[k].getValue())) {
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
                <StoryFormTextField placeholder="Topic" ref={this.recordRef("topic")} />
            </div>);
    }
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
                <StoryFormTextareaField ref={this.recordRef("en")} placeholder="English"/>
                <StoryFormTextareaField ref={this.recordRef("he")} placeholder="Hebrew"/>
            </div>);
    }
}
FreeTextStoryForm.propTypes = {
    
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
                <StoryFormTextareaField ref={this.recordRef("en")} placeholder="English Description (optional)"/>
                <StoryFormTextareaField ref={this.recordRef("he")} placeholder="Hebrew Description (optional)"/>
                <StoryFormRefField ref={this.recordRef("ref")} />
            </div>);
    }
}
NewVersionStoryForm.propTypes = {
    
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
                <StoryFormTextareaField ref={this.recordRef("en")} placeholder="English Description (optional)"/>
                <StoryFormTextareaField ref={this.recordRef("he")} placeholder="Hebrew Description (optional)"/>
                <StoryFormRefField ref={this.recordRef("ref")} />
            </div>);
    }
}
NewIndexStoryForm.propTypes = {
    
};



/*          Fields              */



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

class StoryFormTextareaField extends Component {
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
            <input type="text" value={this.state.value} placeholder={this.props.placeholder} onChange={this.handleChange}/>
            <span className="error">{this.state.error}</span>
      </div>;
    }
}
StoryFormTextField.propTypes = {
    placeholder: PropTypes.string
};

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
