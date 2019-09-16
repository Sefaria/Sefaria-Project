import React, { useState, useEffect, useContext, useRef} from 'react';
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const PropTypes  = require('prop-types');
const { Story }      = require('./Story');
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
  const scrollable_element = useRef();

  usePaginatedScroll(
      scrollable_element,
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
    <div className="content hasFooter" ref={scrollable_element}>
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
                    saveStory={saveStory}
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
  interfaceLang:  PropTypes.string,
  toggleSignUpModal: PropTypes.func
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
          <div className="storyTypeSelector">
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
        return <input className="previewButton" type="button" value="Preview" onClick={handleReflect}/>
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
    const refs = {
        ids:     useRef(null),
        lead_en:     useRef(null),
        lead_he:     useRef(null),
        title_en:     useRef(null),
        title_he:     useRef(null)
    };
    const previewButton =  usePreviewButton({
        payload: () => ({
          factory: "SheetListFactory",
          method: "_generate_shared_story",
          lead: {
            en:  refs.lead_en.current.getValue(),
            he:  refs.lead_he.current.getValue()
          },
          title: {
            en: refs.title_en.current.getValue(),
            he: refs.title_he.current.getValue()
          },
          sheet_ids: refs.ids.current.getValue().split(/\s*,\s*/)
        }),
        isValid: () => refs.ids.current.isValid() && refs.title_en.current.isValid() && refs.title_he.current.isValid(),
    });

    return <div>
        <StoryFormTextField label="Lead (en) (optional)" ref={refs.lead_en} />
        <StoryFormTextField label="Lead (he) (optional)" ref={refs.lead_he} />
        <StoryFormTextField label="Title (en)" ref={refs.title_en} />
        <StoryFormTextField label="Title (he)" ref={refs.title_he} />
        <StoryFormTextField label="List of IDs" placeholder="id, id, id" ref={refs.ids} />
        {previewButton}
    </div>;
};

const UserSheetsStoryForm = () => {
    const refs = {
        author_uid:     useRef(null),
    };
    const previewButton =  usePreviewButton({
        payload: () => ({
          factory: "UserSheetsFactory",
          method: "_generate_shared_story",
          author_uid: refs.author_uid.current.getValue()
        }),
        isValid: () => refs.author_uid.current.isValid()
    });

    return <div>
        <StoryFormTextField label="User ID" ref={refs.author_uid} />
        {previewButton}
    </div>;
};

const AuthorStoryForm = () => {
    const refs = {
        person:     useRef(null),
    };
    const previewButton =  usePreviewButton({
        payload: () => ({
          factory: "AuthorStoryFactory",
          method: "_generate_shared_story",
          person: refs.person.current.getValue()
        }),
        isValid: () => refs.person.current.isValid()
    });

    return <div>
        <StoryFormTextField label="Author Key" ref={refs.person} />
        {previewButton}
    </div>;
};

const TopicSourcesStoryForm = () => {
    const refs = {
        topic:     useRef(null),
    };
    const previewButton =  usePreviewButton({
        payload: () => ({
          factory: "TopicTextsStoryFactory",
          method: "_generate_shared_story",
          topic: refs.topic.current.getValue()
        }),
        isValid: () => refs.topic.current.isValid()
    });

    return <div>
        <StoryFormTextField label="Topic" ref={refs.topic} />
        {previewButton}
    </div>;
};

const TopicSheetsStoryForm = () => {
    const refs = {
        topic:     useRef(null),
    };
    const previewButton =  usePreviewButton({
        payload: () => ({
          factory: "SheetListFactory",
          method: "generate_topic_story",
          topic: refs.topic.current.getValue()
        }),
        isValid: () => refs.topic.current.isValid()
    });

    return <div>
        <StoryFormTextField label="Topic" ref={refs.topic} />
        {previewButton}
    </div>;
};

const TextPassageStoryForm = () => {
    const refs = {
        ref:     useRef(null),
        lead_en:     useRef(null),
        lead_he:     useRef(null),
        title_en:     useRef(null),
        title_he:     useRef(null)
    };
    const previewButton =  usePreviewButton({
        payload: () => ({
            storyForm: 'textPassage',
            data: {
                lead: {
                    en:  refs.lead_en.current.getValue(),
                    he:  refs.lead_he.current.getValue()
                },
                title: {
                    en: refs.title_en.current.getValue(),
                    he: refs.title_he.current.getValue()
                },
                ref: refs.ref.current.getValue(),
            }
        }),
        isValid: () => refs.ref.current.isValid() && refs.title_en.current.isValid() && refs.title_he.current.isValid()
    });

    return <div>
        <StoryFormTextField label="Lead (en) (optional)" ref={refs.lead_en} />
        <StoryFormTextField label="Lead (he) (optional)" ref={refs.lead_he} />
        <StoryFormTextField label="Title (en)" ref={refs.title_en} />
        <StoryFormTextField label="Title (he)" ref={refs.title_he} />
        <StoryFormRefField label="Ref" ref={refs.ref} />

        {previewButton}
    </div>;
};

const FreeTextStoryForm = () => {
    const refs = {
        en:     useRef(null),
        he:     useRef(null),
    };
    const previewButton =  usePreviewButton({
        payload: () => {
            const d = Object.keys(refs).reduce((obj, k) => {
                    const v = refs[k].current.getValue();
                    if (v) { obj[k] = v; }
                    return obj;
                }, {});
            return {
                storyForm: 'freeText',
                data: d
                }
            },
        isValid: () => (refs.en.current.isValid() && refs.he.current.isValid())
    });

    return <div>
        <StoryFormTextareaField ref={refs.en} label="English"/>
        <StoryFormTextareaField ref={refs.he} label="Hebrew"/>
        {previewButton}
    </div>;
};

const NewVersionStoryForm = () => {
    const refs = {
        index:  useRef(null),
        version: useRef(null),
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
                storyForm: 'newVersion',
                data: d
                }
            },
        isValid: () => (refs.index.current.isValid() && refs.version.current.isValid()),
    });

    return <div>
        <StoryFormIndexField ref={refs.index}/>
        <StoryFormVersionFields ref={refs.version}/>
        <StoryFormTextareaField ref={refs.en} label="English Description (optional)"/>
        <StoryFormTextareaField ref={refs.he} label="Hebrew Description (optional)"/>
        <StoryFormRefField ref={refs.ref} label="Ref (optional)" />
        {previewButton}
    </div>;
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
        isValid: () => refs.index.current.isValid()
    });

    return <div>
        <StoryFormIndexField ref={refs.index} />
        <StoryFormTextareaField ref={refs.en} label="English Description (optional)" />
        <StoryFormTextareaField ref={refs.he} label="Hebrew Description (optional)" />
        <StoryFormRefField ref={refs.ref} label="Ref (optional)" />
        {previewButton}
    </div>;
};


/********************************/
/*          Fields              */
/********************************/


class StoryFormIndexField extends Component {
    constructor(props) {
        super(props);
        this.state = {value: '', error: ''};
    }
    getValue() {
        return this.state.value.trim();
    }
    isValid() {
        return (this.state.value && (!this.state.error));
    }
    handleChange(e) {
        const value = e.target.value;
        const error = (Sefaria.index(value)) ? '' : "Not an Index";
        this.setState({value: value, error: error});
    }
    render() {
      return <div>
        <label>Index
            <input type="text" onChange={this.handleChange} />
        </label>
        <span className="error">{this.state.error}</span>
      </div>;
  }
}

class StoryFormVersionFields extends Component {
    constructor(props) {
        super(props);
        this.state = {value: '', error: '', language: "en"};
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
        // Validate
    }
    handleVersionChange(e) {
        this.setState({version: e.target.value});
        //todo: See if this is a valid version
    }
    render() {
      return <div>
        <label>Version Language
            <select type="text" value={this.state.language} onChange={this.handleLanguageChange}>
                <option value="en">English</option>
                <option value="he">Hebrew</option>
            </select>
        </label>
        <label>Version Title
            <input type="text" value={this.state.version} onChange={this.handleVersionChange}/>
        </label>
        <span className="error">{this.state.error}</span>
      </div>
    }
}

class StoryFormTextareaField extends Component {
    constructor(props) {
        super(props);
        this.state = {value: '', error: ''};
    }
    getValue() {
        return this.state.value.trim();
    }
    isValid() {
      return (this.state.value && (!this.state.error));
    }
    handleChange(e) {
        this.setState({value: e.target.value});
        // Validate
    }
    render() {
      return <div>
          <label>{this.props.label}
            <textarea
                placeholder={this.props.placeholder}
                value={this.state.value}
                onChange={this.handleChange}
                rows="3"
                cols="80" />
          </label>
        <span className="error">{this.state.error}</span>
      </div>;
    }
}
StoryFormTextareaField.propTypes = {
    placeholder:    PropTypes.string,
    label:          PropTypes.string,
};

class StoryFormTextField extends Component {
    constructor(props) {
        super(props);
        this.state = {value: '', error: ''};
    }
    getValue() {
        return this.state.value.trim();
    }
    isValid() {
      return (this.state.value && (!this.state.error));
    }
    handleChange(e) {
        this.setState({value: e.target.value});
        // Validate
    }
    render() {
      return <div>
            <label>{this.props.label}
                <input type="text" value={this.state.value} placeholder={this.props.placeholder} onChange={this.handleChange}/>
            </label>
            <span className="error">{this.state.error}</span>
      </div>;
    }
}
StoryFormTextField.propTypes = {
    placeholder:    PropTypes.string,
    label:          PropTypes.string,
};

class StoryFormRefField extends Component {
    constructor(props) {
        super(props);
        this.state = {value: '', error: ''};
    }

    getValue() {
        return this.state.value.trim();
    }

    isValid() {
      return (this.state.value && (!this.state.error));
    }

    handleChange(e) {
        const value = e.target.value;
        const error = (Sefaria.isRef(value)) ? '' : "Not a Ref";
        this.setState({value: value, error: error});
    }

    render() {
        return <div>
            <label>{this.props.label}
                <input type="text" value={this.state.value} onChange={this.handleChange}/>
            </label>
            <span className="error">{this.state.error}</span>
        </div>;
    }
}
StoryFormRefField.propTypes = {
    label: PropTypes.string,
};


class StoryFormUserField extends Component {

}
class StoryFormAuthorField extends Component {

}
class StoryFormSheetfield extends  Component {

}

module.exports = StoryEditor;
