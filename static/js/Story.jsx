const React      = require('react');
const Sefaria    = require('./sefaria/sefaria');
const PropTypes  = require('prop-types');
const {
    TwoBox,
    BlockLink,
    SaveButton,
    SimpleInterfaceBlock,
    SimpleContentBlock,
    FollowButton,
    SimpleLinkedBlock,
}                = require('./Misc');

import Component from 'react-class';


const sheetPropType = PropTypes.shape({
            publisher_id: PropTypes.number,
            publisher_name: PropTypes.string,
            publisher_url:  PropTypes.string,
            publisher_image:PropTypes.string,
            publisher_position: PropTypes.string,
            publisher_followed: PropTypes.bool,
            sheet_id: PropTypes.number,
            sheet_title: PropTypes.string,
            sheet_summary: PropTypes.string,
      });

const textPropType = PropTypes.shape({
          "ref": PropTypes.string.isRequired,
          "heRef": PropTypes.string.isRequired,
          "en": PropTypes.string.isRequired,
          "he": PropTypes.string.isRequired,
      });

const bilingualPropType = PropTypes.shape({
          en: PropTypes.string.isRequired,
          he: PropTypes.string.isRequired,
      });

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
        multiText:      MultiTextStory,
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
            <StoryBodyBlock en={this.props.data.en} he={this.props.data.he}/>
          </StoryFrame>);
    }
}
FreeTextStory.propTypes = {
  storyForm:    PropTypes.string.isRequired,
  timestamp:    PropTypes.number.isRequired,
  is_shared:    PropTypes.bool,
  data:         bilingualPropType.isRequired,
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
            <StoryBodyBlock en={this.props.data.en} he={this.props.data.he}/>
            {this.props.data.ref?<StoryBodyBlock en={this.props.data.text.en} he={this.props.data.text.he}/>:""}
            {this.props.data.ref?<ReadMoreLine dref={this.props.data.ref} toggleSignUpModal={this.props.toggleSignUpModal}/>:""}
        </StoryFrame>);
    }
}
NewIndexStory.propTypes = {
  storyForm:    PropTypes.string.isRequired,
  timestamp:    PropTypes.number.isRequired,
  is_shared:    PropTypes.bool,
  data:         PropTypes.shape({
      en: PropTypes.string,
      he: PropTypes.string,
      index: PropTypes.string.isRequired,
      ref: PropTypes.string,
      text: bilingualPropType,
  }),
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

// Todo: merge the class above and below.  They're nearly identical.
class NewVersionStory extends Component {
    render() {
      const title = this.props.data.index;
      const heTitle = Sefaria.hebrewTerm(title);
      const url = title && Sefaria.ref(title)?"/" + Sefaria.normRef(Sefaria.ref(title).book):"/" + Sefaria.normRef(title);

      return (
        <StoryFrame cls="newVersionStory" cardColor={Sefaria.palette.indexColor(title)}>
            <StoryTypeBlock en="New Version" he="גרסה חדשה" />
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <StoryTitleBlock en={title} he={heTitle} url={url} />
            <StoryBodyBlock en={this.props.data.en} he={this.props.data.he}/>
            {this.props.data.ref?<StoryBodyBlock en={this.props.data.text.en} he={this.props.data.text.he}/>:""}
            {this.props.data.ref?<ReadMoreLine dref={this.props.data.ref} toggleSignUpModal={this.props.toggleSignUpModal}/>:""}
        </StoryFrame>);
    }
}
NewVersionStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.shape({
      en: PropTypes.string,
      he: PropTypes.string,
      index: PropTypes.string.isRequired,
      ref: PropTypes.string,
      text: bilingualPropType,
  }),
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

class AuthorStory extends Component {
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
  data:         PropTypes.shape({
      author_key: PropTypes.string.isRequired,
      example_work: PropTypes.string.isRequired,
      author_names: bilingualPropType.isRequired,
      author_bios: bilingualPropType.isRequired,
  }),
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

class UserSheetsStory extends Component {
  render() {
      const positionBlock = (this.props.data.publisher_position) ?
            <SimpleInterfaceBlock classes="systemText storySubTitle"
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
                {this.props.data.sheets.map(sheet =>
                    <div className="storySheetListItem" key={sheet.sheet_id}>
                        <SaveLine toggleSignUpModal={this.props.toggleSignupModal} historyObject={{ref: "Sheet " + sheet.sheet_id,
                                sheet_title: sheet.sheet_title, versions: {} }}>
                            <SimpleLinkedBlock en={sheet.sheet_title} he={sheet.sheet_title} url={"/sheets/" + sheet.sheet_id} aclasses="contentText"/>
                        </SaveLine>
                    </div>
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
  data:         PropTypes.shape({
    publisher_id: PropTypes.number,
    publisher_name: PropTypes.string,
    publisher_url:  PropTypes.string,
    publisher_image:PropTypes.string,
    publisher_position: PropTypes.string,
    publisher_followed: PropTypes.bool,
    sheets: PropTypes.arrayOf(PropTypes.shape({
        sheet_id: PropTypes.number,
        sheet_title: PropTypes.string,
        sheet_summary: PropTypes.string,
    })).isRequired
  }),
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

class GroupSheetListStory extends Component {

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
  data:         PropTypes.shape({
    title: bilingualPropType.isRequired,
    group_image: PropTypes.string,
    group_url:  PropTypes.string,
    group_name: PropTypes.string,
    sheets: PropTypes.arrayOf(sheetPropType).isRequired
  }),
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

class SheetListStory extends Component {
    render() {
      const lead = this.props.data.lead || {en: "Sheets", he: "דפים"};

      return (
        <StoryFrame cls="sheetListStory">
            <StoryTypeBlock en={lead.en} he={lead.he}/>
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
  data:         PropTypes.shape({
      title: bilingualPropType.isRequired,
      lead: bilingualPropType.isRequired,
      sheets: PropTypes.arrayOf(sheetPropType).isRequired
  }),
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};


class PublishSheetStory extends Component {
  render() {
      return (
        <StoryFrame cls="publishSheetStory">
            <StoryTypeBlock en="New Sheet" he="דף מקורות חדש" />
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <SheetBlock sheet={this.props.data} toggleSignUpModal={this.props.toggleSignUpModal}/>
        </StoryFrame>
      );
  }
}
PublishSheetStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         sheetPropType.isRequired,
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

//todo: This might be a sheet!!
class TextPassageStory extends Component {
    /*
       props.data: {
         "ref"
         "index"
         "language"   # oneOf(english, hebrew, bilingual) - optional - forces display language
         "lead" : {
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
      const lead = this.props.data.lead || {en: "Read More", he: "קרא עוד"};
      return (
        <StoryFrame cls="textPassageStory" cardColor={Sefaria.palette.indexColor(this.props.data.index)}>
            <StoryTypeBlock en={lead.en} he={lead.he} />
            <NaturalTimeBlock timestamp={this.props.timestamp}/>
            <StoryTitleBlock en={this.props.data.title.en} he={this.props.data.title.he} url={url}/>
            <StoryBodyBlock en={this.props.data.text.en} he={this.props.data.text.he}/>
            <ReadMoreLine dref={this.props.data.ref} toggleSignUpModal={this.props.toggleSignUpModal}/>
        </StoryFrame>
      );
    }
}
TextPassageStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.shape({
      title: bilingualPropType.isRequired,
      lead: bilingualPropType.isRequired,
      text: bilingualPropType.isRequired,
      ref: PropTypes.string,
      index: PropTypes.string,
      language: PropTypes.string
  }),
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

class TopicTextsStory extends Component {
    render() {
        return (
            <StoryFrame cls="topicTextsStory">
                <StoryTypeBlock en="Topic" he="" />
                <SeeAllLink url="/topics"/>
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
  data:         PropTypes.shape({
      title: bilingualPropType.isRequired,
      texts: PropTypes.arrayOf(textPropType)
  }),
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

class MultiTextStory extends Component {
    render() {
        return (
            <StoryFrame cls="multiTextStory">
                <StoryTypeBlock en={this.props.data.lead.en} he={this.props.data.lead.he}/>
                <StoryTitleBlock en={this.props.data.title.en} he={this.props.data.title.he}/>
                <StoryTextList texts={this.props.data.texts} />
            </StoryFrame>
        )
    }

}
MultiTextStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.shape({
      title: bilingualPropType.isRequired,
      lead: bilingualPropType.isRequired,
      texts: PropTypes.arrayOf(textPropType)
  }),
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};

class TopicListStory extends Component {
    render() {
        return (
            <StoryFrame cls="topicListStory">
                <StoryTypeBlock en={this.props.data.lead.en} he={this.props.data.lead.he}/>
                <SeeAllLink url="/topics"/>
                <StoryTitleBlock en={this.props.data.title.en} he={this.props.data.title.he}/>
                <TwoBox content={this.props.data.topics.map(topic =>
                    <BlockLink title={topic.en} heTitle={topic.he} target={"/topics/" + topic.en} interfaceLink={true}/>
                )}/>
            </StoryFrame>
        )
    }
}
TopicListStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.shape({
      title: bilingualPropType.isRequired,
      lead: bilingualPropType.isRequired,
      topics: PropTypes.arrayOf(bilingualPropType)
  }),
  interfaceLang:      PropTypes.string,
  toggleSignupModal:  PropTypes.func
};


 /****************************
*                             *
*           Pieces            *
*                             *
 *****************************/

const StoryFrame = ({cls, cardColor, children}) =>
     <div className={'story ' + cls} style={{"borderColor": cardColor || "#18345D"}}>
        {children}
     </div>;
StoryFrame.propTypes = {
    cls:        PropTypes.string,   // Story type as class name
    cardColor:  PropTypes.string
};

const NaturalTimeBlock = ({timestamp}) => <SimpleInterfaceBlock
        classes = "topTailBlock smallText"
        en = {Sefaria.util.naturalTime(timestamp) + " ago"}
        he = {"לפני " + Sefaria.util.naturalTime(timestamp)}
    />;

const SeeAllLink = ({url}) => <SimpleLinkedBlock classes="topTailBlock smallText" url={url} en="See All" he="ראה הכל"/>;

const StoryTypeBlock = ({en, he}) => <SimpleInterfaceBlock en={en} he={he} classes="storyTypeBlock sectionTitleText"/>;

const StoryTitleBlock = ({url, he, en, children}) => {
        const SBlock = url ? SimpleLinkedBlock : SimpleInterfaceBlock;
        return <div className="storyTitleBlock">
            <SBlock classes="storyTitle pageTitle" url={url} he={he} en={en}/>
            {children}
        </div>;
};

const StoryBodyBlock = ({en, he}) => <SimpleContentBlock classes="storyBody contentText" en={en} he={he}/>;

const StoryTextList = ({texts, toggleSignupModal}) => (
    <div className="storyTextList">
        {texts.map((text,i) => <StoryTextListItem text={text} key={i} toggleSignupModal={toggleSignupModal} />)}
    </div>
);
const StoryTextListItem = ({text, toggleSignupModal}) => (
    <div className="storyTextListItem">
        <StoryBodyBlock en={text.en} he={text.he}/>
        <SaveLine dref={text.ref} toggleSignUpModal={toggleSignupModal}>
            <SimpleLinkedBlock url={"/" + Sefaria.normRef(text.ref)} en={text.ref} he={text.heRef} classes="contentText citationLine"/>
        </SaveLine>
    </div>
);
StoryTextListItem.propTypes = {text: textPropType.isRequired};

const StorySheetList = ({sheets, toggleSignUpModal}) => (
    <div className="storySheetList">
        {sheets.map((sheet, i) => <SheetBlock sheet={sheet} key={i} toggleSignUpModal={toggleSignUpModal}/>)}
    </div>
);


const SheetBlock = ({sheet,  toggleSignUpModal}) => {
      const historyObject = {ref: "Sheet " + sheet.sheet_id,
                  sheet_title: sheet.sheet_title,
                  versions: {}};
      const hasPosition = !!sheet.publisher_position;
      const positionBlock = hasPosition ? <SimpleInterfaceBlock
              classes="systemText authorPosition"
              en={sheet.publisher_position}
              he={sheet.publisher_position}/>:"";

      return (<div className="storySheetListItem">
        <SaveLine historyObject={historyObject} toggleSignUpModal={toggleSignUpModal}>
            <StoryTitleBlock en={sheet.sheet_title} he={sheet.sheet_title} url={"/sheets/" + sheet.sheet_id}/>
        </SaveLine>
        {sheet.sheet_summary?<StoryBodyBlock en={sheet.sheet_summary} he={sheet.sheet_summary}/>:""}

        <div className="authorByLine">
            <div className="authorByLineImage">
                <a href={sheet.publisher_url}>
                    <img className="smallProfileImage" src={sheet.publisher_image} alt={sheet.publisher_name}/>
                </a>
            </div>

            <div className="authorByLineText">
                <SimpleLinkedBlock classes="authorName" aclasses="systemText" url={sheet.publisher_url}
                    en={sheet.publisher_name} he={sheet.publisher_name}>
                    <FollowButton large={false} uid={sheet.publisher_id} following={sheet.publisher_followed}/>
                </SimpleLinkedBlock>
                {positionBlock}
            </div>
        </div>
      </div>);
};
SheetBlock.propTypes = {sheet: sheetPropType.isRequired};


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
