const React      = require('react');
const ReactDOM   = require('react-dom');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
const Footer     = require('./Footer');
const {
  SaveButton,
  FollowButton
}                                = require('./Misc');
import Component from 'react-class';


  // This is a pseudo Component.  It uses "storyForm" to determine the component to render.
  // It's important that it's capitalized, so that React treats it as a component.

function Story(props) {
    const storyForms = {
        freeText:     FreeTextStory,
        newIndex:       NewIndexStory,
        newVersion:     NewVersionStory,
        publishSheet:   PublishSheetStory,
        author:         AuthorStory,
        textPassage:    TextPassageStory,
        topic:          TopicStory,
        topicList:      TopicListStory,
        sheetList:      SheetListStory,
        userSheets:     UserSheetsStory,
        groupSheetList: GroupSheetListStory
    };
    const StoryForm = storyForms[props.storyForm];
    return <StoryForm
                storyForm={props.storyForm}
                data={props.data}
                timestamp={props.timestamp}
                natural_time={props.natural_time}
                is_shared={props.is_shared}
                key={props.timestamp} />;
}

class HomeFeed extends Component {
  constructor(props) {
    super(props);

    this.state = {
      page: 0,
      loadedToEnd: false,
      loading: false,
      stories: [],
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
    $.getJSON("/api/stories?page=" + this.state.page, this.loadMoreStories);
    this.setState({loading: true});
  }
  loadMoreStories(data) {
    if (data.count < data.page_size) {
      this.setState({loadedToEnd: true});
    }
    this.setState({page: data.page + 1, loading: false, stories: this.state.stories.concat(data.stories)});
  }

  render() {
    const classes = {"readerNavMenu": 1};
    const classStr = classNames(classes);

    return (
      <div className={classStr}>
        <div className="content hasFooter">
          <div className="contentInner">
            <div className="storyFeed">
            {this.state.stories.map(s => Story(s))}
            </div>
          </div>
          <footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
            <Footer />
          </footer>
        </div>
      </div>);
  }
}
HomeFeed.propTypes = {
  interfaceLang:  PropTypes.string
};

class AbstractStory extends Component {
  heTitle(title) {
    return title && Sefaria.index(title)?Sefaria.index(title).heTitle:"";
  }
  url(title) {
    return title && Sefaria.ref(title)?"/" + Sefaria.normRef(Sefaria.ref(title).book):"/" + Sefaria.normRef(title);
  }
  indexColor(title) {
      return title && Sefaria.index(title) ?
      Sefaria.palette.categoryColor(Sefaria.index(title).categories[0]):
      Sefaria.palette.categoryColor("Other");
  }
  amendSheetObject(sheet) {
      sheet.history_object = {
          ref: "Sheet " + sheet.sheet_id,
          sheet_title: sheet.sheet_title,
          versions: {}
      };
      return sheet;
  }
  render() {}
}
AbstractStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  natural_time: PropTypes.object,
  is_shared:    PropTypes.bool,
  data:         PropTypes.object,
};

class FreeTextStory extends AbstractStory {
    render() {
      return (
          <StoryFrame cls="freeTextStory">
            <StoryTypeBlock en="New Content" he="תוכן חדש"/>
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <StoryBodyBlock en={this.props.data.en} he={this.props.data.he} dangerously={true}/>
          </StoryFrame>);
    }
}

class NewIndexStory extends AbstractStory {

    render() {
      const title = this.props.data.index;
      const heTitle = this.heTitle(title);
      const url = this.url(title);

      return (
        <StoryFrame cls="newIndexStory" cardColor={this.indexColor(title)}>
            <StoryTypeBlock en="New Text" he="טקסט חדש"/>
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <StoryTitleBlock en={title} he={heTitle} url={url} />
            <StoryBodyBlock en={this.props.data.en} he={this.props.data.he} dangerously={true}/>
            {this.props.data.ref?<StoryBodyBlock en={this.props.data.text.en} he={this.props.data.text.he} dangerously={true}/>:""}
            {this.props.data.ref?<ReadMoreLine dref={this.props.data.ref} toggleSignUpModal={this.props.toggleSignUpModal}/>:""}
        </StoryFrame>);
    }
}

// Todo: merge the class above and below.  They're nearly identical.
class NewVersionStory extends AbstractStory {
    render() {
      const title = this.props.data.index;
      const heTitle = this.heTitle(title);
      const url = this.url(title);

      /*
         <div>
              <span className="int-en">New { this.props.data.language == "en"?"English":"Hebrew"} version of <a href={url}>{title}</a>: {this.props.data.version}</span>
              <span className="int-he">גרסה חדשה של <a href={url}>{heTitle}</a> ב{ this.props.data.language == "en"?"אנגלית":"עברית"} : {this.props.data.version}</span>
          </div>
      */
      return (
        <StoryFrame cls="newVersionStory" cardColor={this.indexColor(title)}>
            <StoryTypeBlock en="New Version" he="גרסה חדשה" />
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <StoryTitleBlock en={title} he={heTitle} url={url} />
            <StoryBodyBlock en={this.props.data.en} he={this.props.data.he} dangerously={true}/>
            {this.props.data.ref?<StoryBodyBlock en={this.props.data.text.en} he={this.props.data.text.he} dangerously={true}/>:""}
            {this.props.data.ref?<ReadMoreLine dref={this.props.data.ref} toggleSignUpModal={this.props.toggleSignUpModal}/>:""}
        </StoryFrame>);
    }
}

class AuthorStory extends AbstractStory {
    /*
       props.data: {
         "author_key"
         "example_work"
         "author_names": {
             "en"
             "he"
         }
         "author_bios": {
             "en"
             "he"
         }
       }
    */

    render() {
      const url = "/person/" + this.props.data.author_key;

        return (
        <StoryFrame cls="authorStory" cardColor={this.indexColor(this.props.data.example_work)}>
            <StoryTypeBlock en="Author" he="מחבר" />
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <StoryTitleBlock en={this.props.data.author_names.en} he={this.props.data.author_names.he} url={url} />
            <StoryBodyBlock en={this.props.data.author_bios.en} he={this.props.data.author_bios.he}/>

            <div className="bottomLine">
                <ReadMoreLink url={url}/>
            </div>
        </StoryFrame>);
    }
}

class UserSheetsStory extends AbstractStory {
    /* props.data: {
        "publisher_id"
        "publisher_name" (derived)
        "publisher_url" (derived)
        "publisher_image" (derived)
        "publisher_position" (derived)
        "publisher_followed" (derived)
        "sheet_ids"
        "sheets" (derived)
            [{"sheet_id"
              "sheet_title"
              "sheet_summary"}, {...}]
      }
    */
  render() {
      this.props.data.sheets.forEach(this.amendSheetObject);
      const positionBlock = (this.props.data.publisher_position) ?
           <div className="storySubTitle systemText">
                <span className="int-en">{this.props.data.publisher_position}</span>
                <span className="int-he">{this.props.data.publisher_position}</span>
            </div>
          :"";

      return (
        <StoryFrame cls="userSheetsStory">
            <StoryTypeBlock en="People" he="קהילה" />
            <div className="storyTitleBlock">
                <div className="storyTitle pageTitle">
                    <a href={this.props.data.publisher_url}>
                        <span className="int-en">{this.props.data.publisher_name}</span>
                        <span className="int-he">{this.props.data.publisher_name}</span>
                    </a>
                </div>
                {positionBlock}
                <FollowButton large={true} uid={this.props.data.publisher_id} following={this.props.data.publisher_followed}/>
            </div>
            <img className="mediumProfileImage" src={this.props.data.publisher_image} alt={this.props.data.publisher_name}/>
            <div className="storySheetList">
                {this.props.data.sheets.map((sheet, i) => <div className="storySheetListItem" key={i}>
                    <a className="contentText storySheetListItemTitle" href={"/sheets/" + sheet.sheet_id}>
                        <span className="int-en">{sheet.sheet_title}</span>
                        <span className="int-he">{sheet.sheet_title}</span>
                    </a>
                    <SaveButton
                        historyObject={sheet.history_object}
                        tooltip={true}
                        toggleSignUpModal={this.props.toggleSignUpModal}
                    />
                </div>)}
            </div>
        </StoryFrame>
      );
  }
}

class GroupSheetListStory extends AbstractStory {
/*
        "title" : {
            "he"
            "en"
        }
        "group_image"
        "group_url"
        "group_name"
        "sheet_ids"
        "sheets" (derived)
            [{"sheet_id"
              "sheet_title"
              "sheet_summary"},
              "publisher_id"
              "publisher_name" (derived)
              "publisher_url" (derived)
              "publisher_image" (derived)
              "publisher_position" (derived)
              "publisher_followed" (derived)
            },
            {...}]
 */
    render() {
      this.props.data.sheets.forEach(this.amendSheetObject);

      return (
        <StoryFrame cls="groupSheetListStory">
            <StoryTypeBlock en="Group" he="קבוצה" />
            <StoryTitleBlock en={this.props.data.title.en} he={this.props.data.title.he}/>

            <img className="mediumProfileImage" src={this.props.data.group_image} alt={this.props.data.title.en}/>

            <div className="storySheetList">
                {this.props.data.sheets.map((sheet, i) => <div className="storySheetListItem" key={i}>
                    <a href={sheet.publisher_url}>
                        <img className="smallProfileImage" src={sheet.publisher_image} alt={sheet.publisher_name}/>
                    </a>
                    <div className="authorText">
                        <div className="authorName">
                            <a className="systemText" href={sheet.publisher_url}>
                                <span className="int-en">{sheet.publisher_name}</span>
                                <span className="int-he">{sheet.publisher_name}</span>
                            </a>
                            <FollowButton large={false} uid={sheet.publisher_id} following={sheet.publisher_followed}/>
                        </div>
                        <a className="contentText storySheetListItemTitle" href={"/sheets/" + sheet.sheet_id}>
                            <span className="int-en">{sheet.sheet_title}</span>
                            <span className="int-he">{sheet.sheet_title}</span>
                        </a>
                    </div>
                    <SaveButton
                        historyObject={sheet.history_object}
                        tooltip={true}
                        toggleSignUpModal={this.props.toggleSignUpModal}
                    />
                </div>)}
            </div>
        </StoryFrame>
      );
    }


}

class SheetListStory extends AbstractStory {
/*

        "title" : {
            "he"
            "en"
        }
        "sheet_ids"
        "sheets" (derived)
            [{"sheet_id"
              "sheet_title"
              "sheet_summary"},
              "publisher_id"
              "publisher_name" (derived)
              "publisher_url" (derived)
              "publisher_image" (derived)
              "publisher_position" (derived)
              "publisher_followed" (derived)
            },
            {...}]
 */
    render() {
      this.props.data.sheets.forEach(this.amendSheetObject);

      return (
        <StoryFrame cls="sheetListStory">
            <StoryTypeBlock en="Sheets" he="דפים" />
            <StoryTitleBlock en={this.props.data.title.en} he={this.props.data.title.he}/>


            <div className="storySheetList">
                {this.props.data.sheets.map((sheet, i) => <div className="storySheetListItem" key={i}>
                    <a href={sheet.publisher_url}>
                        <img className="smallProfileImage" src={sheet.publisher_image} alt={sheet.publisher_name}/>
                    </a>
                    <div className="authorText">
                        <div className="authorName">
                            <a className="systemText" href={sheet.publisher_url}>
                                <span className="int-en">{sheet.publisher_name}</span>
                                <span className="int-he">{sheet.publisher_name}</span>
                            </a>
                            <FollowButton large={false} uid={sheet.publisher_id} following={sheet.publisher_followed}/>
                        </div>
                        <a className="contentText storySheetListItemTitle" href={"/sheets/" + sheet.sheet_id}>
                            <span className="int-en">{sheet.sheet_title}</span>
                            <span className="int-he">{sheet.sheet_title}</span>
                        </a>
                    </div>
                    <SaveButton
                        historyObject={sheet.history_object}
                        tooltip={true}
                        toggleSignUpModal={this.props.toggleSignUpModal}
                    />
                </div>)}
            </div>
        </StoryFrame>
      );
    }
}

class PublishSheetStory extends AbstractStory {
  /* props.data: {
      publisher_id
      publisher_name
      publisher_url
      publisher_image
      publisher_position
      publisher_followed (derived)
      sheet_id
      sheet_title
      sheet_summary
    }
   */

  render() {
      const sheet = this.amendSheetObject(this.props.data);  // Bit messy.
      const hasPosition = !!this.props.data.publisher_position;
      const positionBlock = hasPosition ?
            <div className="systemText authorPosition">
                <span className="int-en">{this.props.data.publisher_position}</span>
                <span className="int-he">{this.props.data.publisher_position}</span>
            </div>
          :"";

      return (

        <StoryFrame cls="sheetListStory">
            <StoryTypeBlock en="New Sheet" he="דף מקורות חדש" />
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <StoryTitleBlock en={sheet.sheet_title} he={sheet.sheet_title} url={"/sheets/" + sheet.sheet_id}/>

            <SaveButton
                historyObject={sheet.history_object}
                tooltip={true}
                toggleSignUpModal={this.props.toggleSignUpModal}
            />
            {sheet.sheet_summary?<StoryBodyBlock en={sheet.sheet_summary} he={sheet.sheet_summary}/>:""}

            <div className="bottomLine">
                <div className="storyByLine">
                    <a href={this.props.data.publisher_url}>
                        <img className="smallProfileImage" src={this.props.data.publisher_image} alt={this.props.data.publisher_name}/>
                    </a>
                    <div className="authorText">
                        <div className="authorName">
                            <a className="systemText" href={this.props.data.publisher_url}>
                                <span className="int-en">by {this.props.data.publisher_name}</span>
                                <span className="int-he">{this.props.data.publisher_name}מאת </span>
                            </a>
                            <FollowButton large={false} uid={this.props.data.publisher_id} following={this.props.data.publisher_followed}/>
                        </div>
                        {positionBlock}
                    </div>
                </div>
            </div>
        </StoryFrame>
      );
  }
}

class TextPassageStory extends AbstractStory {
    /*
       props.data: {
         "ref"
         "index"
         "language"   # oneOf(english, hebrew, bilingual) - optional - forces display language
         "lead_title" : {
            "he"
            "en"
         }
         "title" : {
            "he"
            "en"
         }
         "text" : {
            "he"
            "en"
         }
       }
    */

    render() {
      const url = "/" + Sefaria.normRef(this.props.data.ref);

      return (
        <StoryFrame cls="textPassageStory" cardColor={this.indexColor(this.props.data.index)}>
            <StoryTypeBlock en={this.props.data.lead_title.en} he={this.props.data.lead_title.he} />
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <StoryTitleBlock en={this.props.data.title.en} he={this.props.data.title.he} url={url}/>
            <StoryBodyBlock en={this.props.data.text.en} he={this.props.data.text.he} dangerously={true}/>
            <ReadMoreLine dref={this.props.data.ref} toggleSignUpModal={this.props.toggleSignUpModal}/>
        </StoryFrame>
      );
    }
}

class TopicStory extends AbstractStory {

}


class TopicListStory extends AbstractStory {

}

class StoryFrame extends Component {

    render() {
      const classes = {story: 1};
      classes[this.props.cls] = 1;
      const cnames = classNames(classes);

      const cardStyle = {"borderColor": this.props.cardColor || "#18345D"};

      return <div className={cnames} style={cardStyle}>
            {this.props.children}
        </div>;
    }
}
StoryFrame.propTypes = {
    cls:        PropTypes.string,
    cardColor:  PropTypes.string
};

const NaturalTimeBlock = ({timestamp}) => (<div className="timeBlock smallText">
          <span className="int-en">{ Sefaria.util.naturalTime(timestamp) } ago</span>
          <span className="int-he">&rlm;לפני { Sefaria.util.naturalTime(timestamp) }</span>
        </div>);

const ReadMoreLink = ({url}) => (<div className="learnMoreLink smallText">
            <a href={url}>
                <span className="int-en">Read More ›</span>
                <span className="int-he">קרא עוד ›</span>
            </a>
        </div>);


const StoryTypeBlock = ({en, he}) => (<div className="storyTypeBlock sectionTitleText">
            <span className="int-en">{en}</span>
            <span className="int-he">{he}</span>
        </div>);

const StoryTitleBlock = ({en, he, url}) => {
    if (url) {
          return <div className="storyTitleBlock">
                    <div className="storyTitle pageTitle">
                        <a href={url}>
                            <span className="int-en">{en}</span>
                            <span className="int-he">{he}</span>
                        </a>
                    </div>
                </div>;
      } else {
          return <div className="storyTitleBlock">
                    <div className="storyTitle pageTitle">
                        <span className="int-en">{en}</span>
                        <span className="int-he">{he}</span>
                    </div>
                </div>;
      }};

const StoryBodyBlock = ({en, he, dangerously}) => {
      if (dangerously) {
        return (<div className="storyBody contentText">
              <span className="int-en" dangerouslySetInnerHTML={ {__html: en } } />
              <span className="int-he" dangerouslySetInnerHTML={ {__html: he } } />
            </div>);
      } else {
          return (<div className="storyBody contentText">
              <span className="int-en">{en}</span>
              <span className="int-he">{he}</span>
            </div>);
      }
};
class ReadMoreLine extends Component {
    render() {
      const historyObject = {
          dref: this.props.ref,
          versions: {} };
      const url = "/" + Sefaria.normRef(this.props.dref);

        return (
            <div className="bottomLine">
                <ReadMoreLink url={url}/>
                <SaveButton
                    historyObject={historyObject}
                    tooltip={true}
                    toggleSignUpModal={this.props.toggleSignUpModal}
                />
            </div>);
    }
}
ReadMoreLine.propTypes = {
  ref:                  PropTypes.string,
  toggleSignUpModal:    PropTypes.func,
  versions:             PropTypes.object
};


/*                      *
 *                      *
 *    Story Editing     *
 *                      *
 */

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
        "New Index":       NewIndexStoryForm,
        "New Version":     NewVersionStoryForm,

        /*
        freeText:     FreeTextStory,
        publishSheet:   PublishSheetStory,
        author:         AuthorStory,
        textPassage:    TextPassageStory,
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
    handleReflect(type, content) {
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
        if (Sefaria.index(this.state.value)) {
            this.setState({error: ''});
        } else {
            this.setState({error: "Not an Index"});
        }
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

module.exports.HomeFeed = HomeFeed;
module.exports.StoryEditor = StoryEditor;
