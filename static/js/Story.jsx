const React      = require('react');
const Sefaria    = require('./sefaria/sefaria');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
const {
  SaveButton,
  FollowButton,
    Link,
    TwoBox,
    BlockLink,
    SimpleLinkedBlock,
    SimpleBlock
}                                = require('./Misc');
import Component from 'react-class';


// This is a pseudo Component.  It uses `storyForms` to determine the component to render.
// It's important that it's capitalized, so that React treats it as a component.
function Story(story_props, indx, ...props) {
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
    const StoryForm = storyForms[story_props.storyForm];
    return <StoryForm
                storyForm={story_props.storyForm}
                data={story_props.data}
                timestamp={story_props.timestamp}
                is_shared={story_props.is_shared}
                key={story_props.timestamp + "-" + indx}
                {...props} />;
}

class FreeTextStory extends Component {
    render() {
      return (
          <StoryFrame cls="freeTextStory">
            <StoryTypeBlock en="New Content" he="תוכן חדש"/>
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <StoryBodyBlock en={this.props.data.en} he={this.props.data.he} dangerously={true}/>
          </StoryFrame>);
    }
}
FreeTextStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.object,
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

class NewIndexStory extends Component {

    render() {
      const title = this.props.data.index;
      const heTitle = Sefaria.hebrewTerm(title);
      const url = title && Sefaria.ref(title)?"/" + Sefaria.normRef(Sefaria.ref(title).book):"/" + Sefaria.normRef(title);

      return (
        <StoryFrame cls="newIndexStory" cardColor={Sefaria.palette.indexColor(title)}>
            <StoryTypeBlock en="New Text" he="טקסט חדש"/>
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <StoryTitleBlock en={title} he={heTitle} url={url} />
            <StoryBodyBlock en={this.props.data.en} he={this.props.data.he} dangerously={true}/>
            {this.props.data.ref?<StoryBodyBlock en={this.props.data.text.en} he={this.props.data.text.he} dangerously={true}/>:""}
            {this.props.data.ref?<ReadMoreLine dref={this.props.data.ref} toggleSignUpModal={this.props.toggleSignUpModal}/>:""}
        </StoryFrame>);
    }
}
NewIndexStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.object,
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

// Todo: merge the class above and below.  They're nearly identical.
class NewVersionStory extends Component {
    render() {
      const title = this.props.data.index;
      const heTitle = Sefaria.hebrewTerm(title);
      const url = title && Sefaria.ref(title)?"/" + Sefaria.normRef(Sefaria.ref(title).book):"/" + Sefaria.normRef(title);

      /*
         <div>
              <span className="int-en">New { this.props.data.language == "en"?"English":"Hebrew"} version of <a href={url}>{title}</a>: {this.props.data.version}</span>
              <span className="int-he">גרסה חדשה של <a href={url}>{heTitle}</a> ב{ this.props.data.language == "en"?"אנגלית":"עברית"} : {this.props.data.version}</span>
          </div>
      */
      return (
        <StoryFrame cls="newVersionStory" cardColor={Sefaria.palette.indexColor(title)}>
            <StoryTypeBlock en="New Version" he="גרסה חדשה" />
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <StoryTitleBlock en={title} he={heTitle} url={url} />
            <StoryBodyBlock en={this.props.data.en} he={this.props.data.he} dangerously={true}/>
            {this.props.data.ref?<StoryBodyBlock en={this.props.data.text.en} he={this.props.data.text.he} dangerously={true}/>:""}
            {this.props.data.ref?<ReadMoreLine dref={this.props.data.ref} toggleSignUpModal={this.props.toggleSignUpModal}/>:""}
        </StoryFrame>);
    }
}
NewVersionStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.object,
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

class AuthorStory extends Component {
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
        <StoryFrame cls="authorStory" cardColor={Sefaria.palette.indexColor(this.props.data.example_work)}>
            <StoryTypeBlock en="Author" he="מחבר" />
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <StoryTitleBlock en={this.props.data.author_names.en} he={this.props.data.author_names.he} url={url} />
            <StoryBodyBlock en={this.props.data.author_bios.en} he={this.props.data.author_bios.he}/>
            <ReadMoreLink url={url}/>
        </StoryFrame>);
    }
}
AuthorStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.object,
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

class UserSheetsStory extends Component {
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
      const positionBlock = (this.props.data.publisher_position) ?
            <SimpleBlock classes="systemText storySubTitle"
              en={this.props.data.publisher_position}
              he={this.props.data.publisher_position}/>:"";

      return (
        <StoryFrame cls="userSheetsStory">
            <StoryTypeBlock en="People" he="קהילה" />
            <StoryTitleBlock en={this.props.data.publisher_name} he={this.props.data.publisher_name} url={this.props.data.publisher_url}>
                {positionBlock}
                <FollowButton large={true} uid={this.props.data.publisher_id} following={this.props.data.publisher_followed}/>
            </StoryTitleBlock>

            <img className="mediumProfileImage" src={this.props.data.publisher_image} alt={this.props.data.publisher_name}/>
            <div className="storySheetList">
                {this.props.data.sheets.map((sheet, i) =>
                    <SimpleLinkedBlock key={i} en={sheet.sheet_title} he={sheet.sheet_title} url={"/sheets/" + sheet.sheet_id}
                                       classes="storySheetListItem" aclasses="contentText storySheetListItemTitle">

                        <SaveButton tooltip={true} toggleSignUpModal={this.props.toggleSignUpModal}
                            historyObject={{
                                ref: "Sheet " + sheet.sheet_id,
                                sheet_title: sheet.sheet_title,
                                versions: {}
                            }}/>
                    </SimpleLinkedBlock>
                )}
            </div>
        </StoryFrame>
      );
  }
}
UserSheetsStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.object,
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

class GroupSheetListStory extends Component {
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
      return (
        <StoryFrame cls="groupSheetListStory">
            <StoryTypeBlock en="Group" he="קבוצה" />
            <StoryTitleBlock en={this.props.data.title.en} he={this.props.data.title.he}/>
            <img className="mediumProfileImage" src={this.props.data.group_image} alt={this.props.data.title.en}/>
            <StorySheetList sheets={this.props.data.sheets} toggleSignupModal={this.props.toggleSignupModal}/>
        </StoryFrame>
      );
    }
}
GroupSheetListStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.object,
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

class SheetListStory extends Component {
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
      return (
        <StoryFrame cls="sheetListStory">
            <StoryTypeBlock en="Sheets" he="דפים" />
            <StoryTitleBlock en={this.props.data.title.en} he={this.props.data.title.he}/>
            <StorySheetList sheets={this.props.data.sheets} toggleSignupModal={this.props.toggleSignupModal}/>
        </StoryFrame>
      );
    }
}
SheetListStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.object,
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

class PublishSheetStory extends Component {
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
      const sheet = this.props.data;
      const historyObject = {ref: "Sheet " + sheet.sheet_id,
                  sheet_title: sheet.sheet_title,
                  versions: {}};
      const hasPosition = !!this.props.data.publisher_position;
      const positionBlock = hasPosition ? <SimpleBlock
              classes="systemText authorPosition"
              en={this.props.data.publisher_position}
              he={this.props.data.publisher_position}/>:"";

      return (

        <StoryFrame cls="sheetListStory">
            <StoryTypeBlock en="New Sheet" he="דף מקורות חדש" />
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <SaveLine historyObject={historyObject} toggleSignUpModal={this.props.toggleSignUpModal}>
                <StoryTitleBlock en={sheet.sheet_title} he={sheet.sheet_title} url={"/sheets/" + sheet.sheet_id}/>
            </SaveLine>
            {sheet.sheet_summary?<StoryBodyBlock en={sheet.sheet_summary} he={sheet.sheet_summary}/>:""}

            <div className="authorByLine">
                <div className="authorByLineImage">
                    <a href={this.props.data.publisher_url}>
                        <img className="smallProfileImage" src={this.props.data.publisher_image} alt={this.props.data.publisher_name}/>
                    </a>
                </div>

                <div className="authorByLineText">
                    <SimpleLinkedBlock classes="authorName" aclasses="systemText" url={this.props.data.publisher_url}
                        en={this.props.data.publisher_name} he={this.props.data.publisher_name}>
                        <FollowButton large={false} uid={this.props.data.publisher_id} following={this.props.data.publisher_followed}/>
                    </SimpleLinkedBlock>
                    {positionBlock}
                </div>
            </div>
        </StoryFrame>
      );
  }
}
PublishSheetStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.object,
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

class TextPassageStory extends Component {
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
      const lead = this.props.data.lead_title || {en: "Read More", he: "קרא עוד"};
      return (
        <StoryFrame cls="textPassageStory" cardColor={Sefaria.palette.indexColor(this.props.data.index)}>
            <StoryTypeBlock en={lead.en} he={lead.he} />
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <StoryTitleBlock en={this.props.data.title.en} he={this.props.data.title.he} url={url}/>
            <StoryBodyBlock en={this.props.data.text.en} he={this.props.data.text.he} dangerously={true}/>
            <ReadMoreLine dref={this.props.data.ref} toggleSignUpModal={this.props.toggleSignUpModal}/>
        </StoryFrame>
      );
    }
}
TextPassageStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.object,
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

class TopicTextsStory extends Component {
/*
    "topicTexts"
        "title"
            "en"
            "he"
        "refs"
        "texts" (derived)
            [{"ref", "heRef", "en","he"}, ...]
 */
    render() {
        return (
            <StoryFrame cls="topicTextsStory">
                <StoryTypeBlock en="Topic" he="" />
                <SeeAllLink url="/topics/"/>
                <StoryTitleBlock en={this.props.data.title.en} he={this.props.data.title.he} url={"/topics/" + this.props.data.title.en}/>
                <StoryTextList texts={this.props.data.texts} />
            </StoryFrame>
        );
    }
}
TopicTextsStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.object,
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};


class TopicListStory extends Component {
/*
    "topicList"
        topics: [{en, he}, ...]
 */
    render() {
        return (
            <StoryFrame cls="topicListStory">
                <StoryTypeBlock en="Topics" he="נושאים"/>
                <SeeAllLink url="/topics/"/>
                <StoryTitleBlock en="Trending Recently" he="פופולרי"/>
                <TwoBox content={this.props.data.topics.map(topic =>
                    <BlockLink
                        title={topic.en}
                        heTitle={topic.he}
                        target={"/topics/" + topic.en}
                        interfaceLink={true}/>
                )}/>
            </StoryFrame>
        )
    }
}
TopicListStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.object,
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};


 /****************************
*           Pieces            *
*                             *
*                             *
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

const NaturalTimeBlock = ({timestamp}) => <SimpleBlock
        classes = "topTailBlock smallText"
        en = {Sefaria.util.naturalTime(timestamp) + " ago"}
        he = {"&rlm;לפני " + Sefaria.util.naturalTime(timestamp)}
    />;

const SeeAllLink = ({url}) => <SimpleLinkedBlock classes="topTailBlock smallText" url={url} en="See All" he="ראה הכל"/>;

const StoryTypeBlock = ({en, he}) => <SimpleBlock en={en} he={he} classes="storyTypeBlock sectionTitleText"/>;

class StoryTitleBlock extends Component {
    render() {
        if (this.props.url) {
            return <div className="storyTitleBlock">
                <SimpleLinkedBlock classes="storyTitle pageTitle" url={this.props.url} he={this.props.he} en={this.props.en}/>
                {this.props.children}
            </div>;
        } else {
            return <div className="storyTitleBlock">
                <SimpleBlock en={this.props.en} he={this.props.he} classes="storyTitle pageTitle"/>
            </div>;
        }
    };
}


const StoryBodyBlock = ({en, he, dangerously}) => {
      if (dangerously) {
        return (<div className="storyBody contentText">
              <span className="int-en" dangerouslySetInnerHTML={ {__html: en } } />
              <span className="int-he" dangerouslySetInnerHTML={ {__html: he } } />
            </div>);
      } else {
          return <SimpleBlock classes="storyBody contentText" en={en} he={he}/>;
      }
};

const StoryTextList = ({texts, toggleSignupModal}) => (
    <div className="storyTextList">
        {texts.map((text,i) => <StoryTextListItem text={text} key={i} toggleSignupModal={toggleSignupModal} />)}
    </div>
);
const StoryTextListItem = ({text, toggleSignupModal}) => (
    <div className="storyTextListItem">
        <StoryBodyBlock en={text.en} he={text.he} dangerously={true} />
        <SaveLine dref={text.ref} toggleSignUpModal={toggleSignupModal}>
            <SimpleLinkedBlock url={"/" + Sefaria.normRef(text.ref)} en={text.ref} he={text.heRef} classes="contentText citationLine"/>
        </SaveLine>
    </div>
);
const StorySheetList = ({sheets, toggleSignUpModal}) => (
    <div className="storySheetList">
        {sheets.map((sheet, i) => <StorySheetListItem sheet={sheet} key={i} toggleSignUpModal={toggleSignUpModal}/>)}
    </div>
);

const StorySheetListItem = ({sheet, toggleSignUpModal}) => (
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
            historyObject={{
                ref: "Sheet " + sheet.sheet_id,
                sheet_title: sheet.sheet_title,
                versions: {}
            }}
            tooltip={true}
            toggleSignUpModal={toggleSignUpModal}
        />
    </div>);

class SaveLine extends Component {
    render() {
      const historyObject = this.props.historyObject || {
          ref: this.props.dref,
          versions: this.props.versions || {}
      };

        return (
            <div className="saveLine">
                <div className="beforeSave">
                    {this.props.children}
                </div>
                <SaveButton
                    historyObject={historyObject}
                    tooltip={true}
                    toggleSignUpModal={this.props.toggleSignUpModal}
                />
            </div>);
    }
}
SaveLine.propTypes = {
  historyObject:        PropTypes.object,   // One or
  dref:                 PropTypes.string,   // the other
  toggleSignUpModal:    PropTypes.func,
  versions:             PropTypes.object
};

const ReadMoreLine = (props) => (
    <SaveLine {...props}>
        <ReadMoreLink url={"/" + Sefaria.normRef(props.dref)}/>
    </SaveLine>
);
ReadMoreLine.propTypes = {
  dref:                  PropTypes.string,
  toggleSignUpModal:    PropTypes.func,
  versions:             PropTypes.object
};

const ReadMoreLink = ({url}) => <SimpleLinkedBlock classes="learnMoreLink smallText" url={url} en="Read More ›" he="קרא עוד ›"/>;


module.exports = Story;
