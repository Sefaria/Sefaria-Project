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
      newContent:   NewContentStory,
      newIndex:     NewIndexStory,
      newVersion:   NewVersionStory,
      publishSheet: PublishSheetStory,
      author:       AuthorStory,
      textPassage:  TextPassageStory,
      topic:        TopicStory,
      topicList:    TopicListStory,
      sheetList:    SheetListStory,
      userSheets:   UserSheetsStory,
      groupSheetList: GroupSheetListStory
    };
    const StoryForm = storyForms[props.storyForm];
    return <StoryForm
                storyForm={props.storyForm}
                data={props.data}
                timestamp={props.timestamp}
                natural_time={props.natural_time}
                is_global={props.is_global}
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


class StoryEditor extends Component {
  constructor(props) {
    super(props);

    this.state = {
      page: 0,
      loadedToEnd: false,
      loading: false,
      stories: [],
      submitting: false,
      submitCount: 0,
      error: null
    };
  }
  componentDidMount() {
    $(ReactDOM.findDOMNode(this)).find(".content").bind("scroll", this.handleScroll);
    this.getMoreNotifications();
  }
  handleScroll() {
    if (this.state.loadedToEnd || this.state.loading) { return; }
    var $scrollable = $(ReactDOM.findDOMNode(this)).find(".content");
    var margin = 600;
    if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
      this.getMoreNotifications();
    }
  }
  getMoreNotifications() {
    $.getJSON("/api/stories?only_global=1&page=" + this.state.page, this.loadMoreNotifications);
    this.setState({loading: true});
  }
  loadMoreNotifications(data) {
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
  handleSubmit(type, content) {
    this.setState({"submitting": true, "error": null});
    var payload = {
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
          this.setState({submitting: false, stories: this.state.stories, submitCount: this.state.submitCount + 1});
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

            {Sefaria.is_moderator?<NewStoryForm handleSubmit={this.handleSubmit} key={this.state.submitCount} error={this.state.error}/>:""}

            <div className="notificationsList">
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
StoryEditor.propTypes = {
  interfaceLang:  PropTypes.string
};

/*
{this.state.updates.map(u =>
    <SingleUpdate
        type={u.type}
        content={u.content}
        date={u.date}
        key={u._id}
        id={u._id}
        onDelete={this.onDelete}
        submitting={this.state.submitting}
    />
)} */

class NewStoryForm extends Component {
  constructor(props) {
    super(props);
    this.state = {type: 'index', index: '', language: 'en', version: '', en: '', he: '', error: ''};
  }
  componentWillReceiveProps(nextProps) {
    this.setState({"error": nextProps.error});
  }
  handleEnChange(e) {
    this.setState({en: e.target.value, error: null});
  }
  handleHeChange(e) {
    this.setState({he: e.target.value, error: null});
  }
  handleTypeChange(e) {
    this.setState({type: e.target.value, error: null});
  }
  handleIndexChange(e) {
    this.setState({index: e.target.value, error: null});
  }
  handleVersionChange(e) {
    this.setState({version: e.target.value, error: null});
  }
  handleLanguageChange(e) {
    this.setState({language: e.target.value, error: null});
  }
  handleSubmit(e) {
    e.preventDefault();
    var content = {
      "en": this.state.en.trim(),
      "he": this.state.he.trim()
    };
    if (this.state.type == "newContent") {
      if (!this.state.en || !this.state.he) {
        this.setState({"error": "Both Hebrew and English are required"});
        return;
      }
    } else {
      if (!this.state.index) {
        this.setState({"error": "Index is required"});
        return;
      }
      content["index"] = this.state.index.trim();
    }
    if (this.state.type == "newVersion") {
      if (!this.state.version || !this.state.language) {
        this.setState({"error": "Version is required"});
        return;
      }
      content["version"] = this.state.version.trim();
      content["language"] = this.state.language.trim();
    }
    this.props.handleSubmit(this.state.type, content);

  }
  render() {
    return (
      <form className="globalUpdateForm" onSubmit={this.handleSubmit}>
        <div>
          <input type="radio" name="type" value="newIndex" onChange={this.handleTypeChange} checked={this.state.type=="newIndex"}/>Index&nbsp;&nbsp;
          <input type="radio" name="type" value="newVersion" onChange={this.handleTypeChange} checked={this.state.type=="newVersion"}/>Version&nbsp;&nbsp;
          <input type="radio" name="type" value="newContent" onChange={this.handleTypeChange} checked={this.state.type=="newContent"}/>General&nbsp;&nbsp;
        </div>
        <div>
          {(this.state.type != "newContent")?<input type="text" placeholder="Index Title" onChange={this.handleIndexChange} />:""}
          {(this.state.type == "newVersion")?<input type="text" placeholder="Version Title" onChange={this.handleVersionChange}/>:""}
          {(this.state.type == "newVersion")?<select type="text" placeholder="Version Language" onChange={this.handleLanguageChange}>
            <option value="en">English</option>
            <option value="he">Hebrew</option>
          </select>:""}
        </div>
        <div>
          <textarea
            placeholder="English Description (optional for Index and Version)"
            onChange={this.handleEnChange}
            rows="3"
            cols="80"
          />
        </div>
        <div>
          <textarea
            placeholder="Hebrew Description (optional for Index and Version)"
            onChange={this.handleHeChange}
            rows="3"
            cols="80"
          />
        </div>
        <input type="submit" value="Submit" disabled={this.props.submitting}/>
        <span className="error">{this.state.error}</span>
      </form>
    );
  }
}
NewStoryForm.propTypes = {
  error:               PropTypes.string,
  handleSubmit:        PropTypes.func
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
  naturalTimeBlock() {
      if (!this.props.timestamp) return "";
      return (
        <div className="timeBlock smallText">
          <span className="int-en">{ Sefaria.util.naturalTime(this.props.timestamp) } ago</span>
          <span className="int-he">&rlm;לפני { Sefaria.util.naturalTime(this.props.timestamp) }</span>
        </div>);
  }
  amendSheetObject(sheet) {
      sheet.history_object = {
          ref: "Sheet " + sheet.sheet_id,
          sheet_title: sheet.sheet_title,
          versions: {}
      };
      return sheet;
  }
  readMoreLink(url) {
      return (
        <div className="learnMoreLink smallText">
            <a href={url}>
                <span className="int-en">Read More ›</span>
                <span className="int-he">קרא עוד ›</span>
            </a>
        </div>
      );
  }
  storyTypeBlock(en, he) {
      return (
        <div className="storyTypeBlock sectionTitleText">
            <span className="int-en">{en}</span>
            <span className="int-he">{he}</span>
        </div>
      );
  }
  storyTitleBlock(en, he, url) {
      if (url)  {
          return (
                <div className="storyTitleBlock">
                    <div className="storyTitle pageTitle">
                        <a href={url}>
                            <span className="int-en">{en}</span>
                            <span className="int-he">{he}</span>
                        </a>
                    </div>
                </div>
          );
      } else {
          return (
                <div className="storyTitleBlock">
                    <div className="storyTitle pageTitle">
                        <span className="int-en">{en}</span>
                        <span className="int-he">{he}</span>
                    </div>
                </div>
          );
      }
  }
  storyBodyBlock(en, he, dangerously) {
      if (dangerously) {
        return (
            <div className="storyBody contentText">
              <span className="int-en" dangerouslySetInnerHTML={ {__html: en } } />
              <span className="int-he" dangerouslySetInnerHTML={ {__html: he } } />
            </div>
        );
      } else {
          return (
            <div className="storyBody contentText">
              <span className="int-en">{en}</span>
              <span className="int-he">{he}</span>
            </div>
          );
      }
  }
  render() {}
}
AbstractStory.propTypes = {
  storyForm: PropTypes.string,
  timestamp: PropTypes.number,
  natural_time: PropTypes.object,
  is_global: PropTypes.bool,
  data:      PropTypes.object,
};

class NewContentStory extends AbstractStory {
    render() {
      const cardStyle = {"borderColor": "#18345D"};

      return (
        <div className="story" style={cardStyle}>
            {this.storyTypeBlock("New Content", "תוכן חדש")}
            {this.naturalTimeBlock()}
            {this.storyBodyBlock(this.props.data.en, this.props.data.he, true)}
        </div>);
    }
}

class NewIndexStory extends AbstractStory {
    render() {
      const title = this.props.data.index;
      const heTitle = this.heTitle(title);
      const url = this.url(title);
      const cardStyle = {"borderColor": this.indexColor(title)};

      return (
        <div className="story" style={cardStyle}>
            {this.storyTypeBlock("New Text", "טקסט חדש")}
            {this.naturalTimeBlock()}
            {this.storyTitleBlock(title, heTitle, url)}
            {this.storyBodyBlock(this.props.data.en, this.props.data.he, true)}
        </div>);
    }
}

// Todo: merge the class above and below.  They're nearly identical.
class NewVersionStory extends AbstractStory {
    render() {
      const title = this.props.data.index;
      const heTitle = this.heTitle(title);
      const url = this.url(title);
      const cardStyle = {"borderColor": this.indexColor(title)};

      /*
         <div>
              <span className="int-en">New { this.props.data.language == "en"?"English":"Hebrew"} version of <a href={url}>{title}</a>: {this.props.data.version}</span>
              <span className="int-he">גרסה חדשה של <a href={url}>{heTitle}</a> ב{ this.props.data.language == "en"?"אנגלית":"עברית"} : {this.props.data.version}</span>
          </div>
      */
      return (
        <div className="story" style={cardStyle}>
            {this.storyTypeBlock("New Version", "גרסה חדשה")}
            {this.naturalTimeBlock()}
            {this.storyTitleBlock(title, heTitle, url)}
            {this.storyBodyBlock(this.props.data.en, this.props.data.he, true)}
        </div>);
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
      const cardStyle = {"borderColor": this.indexColor(this.props.data.example_work)};
      const url = "/person/" + this.props.data.author_key;

        return (
        <div className="story" style={cardStyle}>
            {this.storyTypeBlock("Author", "מחבר")}
            {this.naturalTimeBlock()}
            {this.storyTitleBlock(this.props.data.author_names.en, this.props.data.author_names.he, url)}
            {this.storyBodyBlock(this.props.data.author_bios.en, this.props.data.author_bios.he)}

            <div className="bottomLine">
                {this.readMoreLink(url)}
            </div>
        </div>);
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
      const cardStyle = {"borderColor": "#18345D"};

      this.props.data.sheets.forEach(this.amendSheetObject);
      const positionBlock = (this.props.data.publisher_position) ?
           <div className="storySubTitle systemText">
                <span className="int-en">{this.props.data.publisher_position}</span>
                <span className="int-he">{this.props.data.publisher_position}</span>
            </div>
          :"";
      return (
        <div className="story" style={cardStyle}>
            {this.storyTypeBlock("People", "קהילה")}
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

        </div>
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
      const cardStyle = {"borderColor": "#18345D"};
      this.props.data.sheets.forEach(this.amendSheetObject);

      return (
        <div className="story" style={cardStyle}>
            {this.storyTypeBlock("Group", "קבוצה")}
            {this.storyTitleBlock(this.props.data.title.en, this.props.data.title.he)}
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
        </div>
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
      const cardStyle = {"borderColor": "#18345D"};
      this.props.data.sheets.forEach(this.amendSheetObject);

      return (
        <div className="story" style={cardStyle}>
            {this.storyTypeBlock("Sheets", "דפים")}
            {this.storyTitleBlock(this.props.data.title.en, this.props.data.title.he)}

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
        </div>
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
      const cardStyle = {"borderColor": "#18345D"};
      const sheet = this.amendSheetObject(this.props.data);  // Bit messy.
      const hasPosition = !!this.props.data.publisher_position;
      const positionBlock = hasPosition ?
            <div className="systemText authorPosition">
                <span className="int-en">{this.props.data.publisher_position}</span>
                <span className="int-he">{this.props.data.publisher_position}</span>
            </div>
          :"";

      return (
        <div className="story" style={cardStyle}>
            {this.storyTypeBlock("New Sheet", "דף מקורות חדש")}
            {this.naturalTimeBlock()}
            <div className="storyTitleBlock">
                <div className="storyTitle pageTitle">
                    <a href={"/sheets/" + sheet.sheet_id}>
                        <span className="int-en">{sheet.sheet_title}</span>
                        <span className="int-he">{sheet.sheet_title}</span>
                    </a>
                </div>
                <SaveButton
                    historyObject={sheet.history_object}
                    tooltip={true}
                    toggleSignUpModal={this.props.toggleSignUpModal}
                />
            </div>
            {sheet.sheet_summary?this.storyBodyBlock(sheet.sheet_summary, sheet.sheet_summary):""}

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
        </div>
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
      const cardStyle = {"borderColor": this.indexColor(this.props.data.index)};
      const historyObject = {
          ref: this.props.data.ref,
          versions: {} };
      const url = "/" + Sefaria.normRef(this.props.data.ref);

      return (
        <div className="story" style={cardStyle}>
            {this.storyTypeBlock(this.props.data.lead_titles.en, this.props.data.lead_titles.he)}
            {this.naturalTimeBlock()}
            {this.storyTitleBlock(this.props.data.titles.en, this.props.data.titles.he, url)}
            {this.storyBodyBlock(this.props.data.text.en + " ", this.props.data.text.he + " ", true)}

            <div className="bottomLine">
                {this.readMoreLink(url)}
                <SaveButton
                    historyObject={historyObject}
                    tooltip={true}
                    toggleSignUpModal={this.props.toggleSignUpModal}
                />
            </div>
        </div>
      );
    }
}

class TopicStory extends AbstractStory {

}


class TopicListStory extends AbstractStory {

}



module.exports.HomeFeed = HomeFeed;
module.exports.StoryEditor = StoryEditor;
