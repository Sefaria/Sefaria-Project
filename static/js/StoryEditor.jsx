import React, { useState, useEffect, useContext, useRef} from 'react';
const ReactDOM   = require('react-dom');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
const Story      = require('./Story');
const { usePaginatedScroll } = require('./Hooks');

import Component from 'react-class';

// These are duplicated in trend.py needs to be more graceful
const traits = ["readsHebrew",
"toleratesEnglish",
"usesSheets",
"inDiaspora",
"inIsrael"];

const FormFunctions = React.createContext({addStory: null, setError: null});


function StoryEditor(props) {
  const [stories, setStories] = useState([]);
  const [error, setError] = useState(null);

  usePaginatedScroll(
      $(".homeFeedWrapper .content"),
      "/api/stories?admin_feed=1",
      data => setStories(prev => ([...prev, ...data.stories]))
  );

  const deleteStory = (id) => $.ajax({url: '/api/stories/' + id, type: 'DELETE',
    success: (result) => { if (result.status === "ok") { setStories(s => s.filter(u => u._id !== id)) }}
  });
  const removeDraft = (timestamp) => setStories(s => s.filter(u => (!u.draft) || u.timestamp !== timestamp));
  const addStory = (data) => setStories(s => [data, ...s]);
  const saveStory = (type, content, timestamp) => {
    setError(null);

    $.ajax({url: "/api/stories", dataType: 'json', type: 'POST',
      data: {json: JSON.stringify({storyForm: type, data: content})},
      success: (data) => {
        if (data.status === "ok") {
          removeDraft(timestamp);
          addStory(data.story);
        } else {
          setError(data.error);
        }
      },
      error: (xhr, status, err) => { setError(err.toString()); }
    });
  };

  return (<div className="homeFeedWrapper">
    <div className="content hasFooter">
      <div className="contentInner">
        <h1>
          <span className="int-en">Stories</span>
          <span className="int-he">עדכונים</span>
        </h1>

        <FormFunctions.Provider value={{addStory: addStory, setError: setError}}>
            <CreateStoryForm/>
        </FormFunctions.Provider>
        <span className="error">{error}</span>

        <div className="storyFeed">
        {stories.map((s,i) =>
            [
                Story(s,i, props),
                <StoryEditBar
                    deleteStory={deleteStory}
                    removeDraft={removeDraft}
                    handlePublish={saveStory}
                    isDraft={s.draft}
                    key={s.timestamp + "-" + i + "-editor"}
                    story={s}/>
            ]).flat() }
        </div>
      </div>
    </div>
  </div>);

}
StoryEditor.propTypes = {
  interfaceLang:  PropTypes.string
};

function StoryEditBar({story, isDraft, saveStory, deleteStory, removeDraft}) {
    const [isDeleting, setDeleting] = useState(false);

    function onPublish() {
        saveStory(story.storyForm, story.data, story.timestamp)
    }
    function onDelete() {
        if(isDraft) {
            removeDraft(story.timestamp);
        } else {
            setDeleting(true);
            deleteStory(story._id);
        }
    }

    return (Sefaria.is_moderator?<div className="storyEditBar">
        {(isDraft)?<div className="story-action-button" onClick={onPublish}>Publish</div>:""}
        {isDeleting?<div className="lds-ring"><div></div><div></div><div></div><div></div></div>:
                    <div className="story-action-button" onClick={onDelete}>Delete</div>}
        {story.mustHave && story.mustHave.map((trait,i) => <div className="storyEditorTag mustHave" key={i}>{trait}</div>)}
        {story.cantHave && story.cantHave.map((trait,i) => <div className="storyEditorTag cantHave" key={i}>{trait}</div>)}
    </div>:<div/>);
}
StoryEditBar.propTypes = {
  interfaceLang:     PropTypes.string,
  deleteStory:       PropTypes.func,
  saveStory:         PropTypes.func,
  removeDraft:       PropTypes.func,
  isDraft:           PropTypes.bool,
  story:             PropTypes.object
};

const CreateStoryForm = () => {
    const [typeName, setTypeName] = useState('New Index');

    const editForms = {
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

    const EditForm = editForms[typeName];

    return (
      <div className="globalUpdateForm">
          <div>
              <label>
                  Story Type:
                  <select value={typeName} onChange={e => setTypeName(e.target.value)}>
                      {Object.entries(editForms).map(e => <option value={e[0]} key={e[0]}>{e[0]}</option>)}
                  </select>
              </label>
          </div>
          {Sefaria.is_moderator?<EditForm/>:""}
      </div>
    );
};


function usePreviewButton({payload, isValid}) {
    const [isSubmitting, setSubmitting] = useState(false);
    const {addStory, setError} = useContext(FormFunctions);
    const handleReflect = () => {
        if (!isValid()) {
            setError("Incomplete");
            return;
        }
        setSubmitting(true);
        setError(null);
        const currentPayload = (payload instanceof Function) ? payload() : payload;
        $.ajax({
            url: "/api/story_reflector",
            dataType: 'json',
            type: 'POST',
            data: {json: JSON.stringify(currentPayload)},
            success: (data) => {
                if ("error" in data) { setError(data.error); }
                else {
                    data["draft"] = true;
                    addStory(data);
                    setSubmitting(false);
                }
            },
            error: (x, s, err) => setError(err.toString())
        });
    };
    if (isSubmitting) {
        return <div className="lds-ring"><div></div><div></div><div></div><div></div></div>;
    } else {
        return <input type="button" value="Preview" onClick={handleReflect}/>
    }
}


const FeaturedSheetsStoryForm = () => {
    const previewButton = usePreviewButton({
        payload: {
          factory: "SheetListFactory",
          method: "generate_featured_story"
        },
        isValid: () => true,
    });
    return <div>{previewButton}</div>;
};

    /* From old is_valid()
            if (!Object.values(this.field_refs).every(e => e.isValid())) {
            return false;
        }
        // Required Fields
        if (!["ids"].every(k => this.field_refs[k].getValue())) {
            return false;
        }
        return true;
     */

const SheetListStoryForm = () => {
    const idsEl = useRef(null);
    const previewButton =  usePreviewButton({
        payload: () => ({
          factory: "SheetListFactory",
          method: "_generate_shared_story",
          sheet_ids: idsEl.current ? idsEl.current.getValue().split(/\s*,\s*/) : null
        }),
        isValid: () => (idsEl.current.isValid() && idsEl.current.getValue()),
    });

    return <div>
        <StoryFormTextField placeholder="id, id, id" ref={idsEl} />
        {previewButton}
    </div>;
};

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

const NewIndexStoryForm = () => {
    const refs = {
        index:  useRef(null),
        en:     useRef(null),
        he:     useRef(null),
        ref:    useRef(null),
    };
    const previewButton =  usePreviewButton({
        payload: () => {
            const d = Object.keys(refs).reduce((obj, k) => {
                    const v = refs[k].current.getValue();
                    if (v) { obj[k] = v; }
                    return obj;
                }, {});
            return {
                storyForm: 'newIndex',
                data: d
                }
            },
        isValid: () => (refs.index.current.isValid() && refs.index.current.getValue()),
    });

    return <div>
        <StoryFormIndexField ref={refs.index}/>
        <StoryFormTextareaField ref={refs.en} placeholder="English Description (optional)"/>
        <StoryFormTextareaField ref={refs.he} placeholder="Hebrew Description (optional)"/>
        <StoryFormRefField ref={refs.ref} />
        {previewButton}
    </div>;
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
