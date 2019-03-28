const React      = require('react');
const Sefaria    = require('./sefaria/sefaria');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
const {
  SaveButton,
  FollowButton
}                                = require('./Misc');
import Component from 'react-class';


// This is a pseudo Component.  It uses `storyForms` to determine the component to render.
// It's important that it's capitalized, so that React treats it as a component.
function Story(props) {
    const storyForms = {
        freeText:       FreeTextStory,
        newIndex:       NewIndexStory,
        newVersion:     NewVersionStory,
        publishSheet:   PublishSheetStory,
        author:         AuthorStory,
        textPassage:    TextPassageStory,
        topicTexts:     TopicTextsStory,
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
                is_shared={props.is_shared}
                key={props.timestamp} />;
}

//todo: ix-nay on the heritance-iay
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
            <StoryTitleBlock en={this.props.data.publisher_name} he={this.props.data.publisher_name} url={this.props.data.publisher_url}>
                {positionBlock}
                <FollowButton large={true} uid={this.props.data.publisher_id} following={this.props.data.publisher_followed}/>
            </StoryTitleBlock>

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
            <StorySheetList sheets={this.props.data.sheets} />
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
            <StorySheetList sheets={this.props.data.sheets} />
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
      const lead = this.props.data.lead_title || {en: "Read", he: "קרא"};
      return (
        <StoryFrame cls="textPassageStory" cardColor={this.indexColor(this.props.data.index)}>
            <StoryTypeBlock en={lead.en} he={lead.he} />
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <StoryTitleBlock en={this.props.data.title.en} he={this.props.data.title.he} url={url}/>
            <StoryBodyBlock en={this.props.data.text.en} he={this.props.data.text.he} dangerously={true}/>
            <ReadMoreLine dref={this.props.data.ref} toggleSignUpModal={this.props.toggleSignUpModal}/>
        </StoryFrame>
      );
    }
}

class TopicTextsStory extends AbstractStory {
/*
    "topicTexts"
        "title"
            "en"
            "he"
        "refs"
        "texts" (derived)
            [{"ref", "en","he"}, ...]
 */
    render() {
        return (
            <StoryFrame cls="topicStory">
                <StoryTypeBlock en="Topic" he="" />
                <StoryTitleBlock en={this.props.data.title.en} he={this.props.data.title.he} url={url}/>
                <!-- See All link -->
                <!-- Source List -->
            </StoryFrame>
        );
    }
}


class TopicListStory extends AbstractStory {
/*
    topics
 */

}



/*          *
*   Pieces   *
*            *
*            *
 */

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
    cls:        PropTypes.string,   // Story type as class name
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
                  {this.props.children}
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
const StorySheetList = sheets => (
    <div className="storySheetList">
        {sheets.map((sheet, i) => <StorySheetListItem key={i} sheet={sheet} />)}
    </div>
);
const StorySheetListItem = sheet => (
    <div className="storySheetListItem">
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
    </div>);
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


module.exports = Story;
