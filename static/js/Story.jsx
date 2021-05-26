import React  from 'react';
import Sefaria  from './sefaria/sefaria';
import PropTypes  from 'prop-types';
import {
    NBox,
    BlockLink,
    SaveButton,
    SimpleInterfaceBlock,
    DangerousInterfaceBlock,
    SimpleContentBlock,
    FollowButton,
    SimpleLinkedBlock,
    ProfileListing,
} from './Misc';


const sheetPropType = PropTypes.shape({
            publisher_id: PropTypes.number,
            publisher_name: PropTypes.string,
            publisher_url:  PropTypes.string,
            publisher_image:PropTypes.string,
            publisher_position: PropTypes.string,
            publisher_organization: PropTypes.string,
            publisher_followed: PropTypes.bool,
            sheet_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
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
function Story(story_props, indx, props) {
    const storyForms = {
        freeText:            FreeTextStory,
        newIndex:            NewIndexStory,
        newVersion:          NewVersionStory,
        publishSheet:        PublishSheetStory,
        author:              AuthorStory,
        textPassage:         TextPassageStory,
        multiText:           MultiTextStory,
        topicTexts:          TopicTextsStory,
        topicList:           TopicListStory,
        sheetList:           SheetListStory,
        userSheets:          UserSheetsStory,
        collectionSheetList: CollectionSheetListStory
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

const FreeTextStory = (props) => {

  const lead = props.data.lead || {en: "Updates", he: "עדכונים"};
  const title = props.data.title || {en: "New in the Library", he: "חדש בספריא"};

  return (
  <StoryFrame cls="freeTextStory">
    <StoryTypeBlock en={lead.en} he={lead.he}/>
    <StoryTitleBlock en={title.en} he={title.he}/>
    <NaturalTimeBlock timestamp={props.timestamp}/>
    <DangerousInterfaceBlock classes="storyBody contentText" en={props.data.en} he={props.data.he}/>
  </StoryFrame>
)};
FreeTextStory.propTypes = {
  storyForm:    PropTypes.string.isRequired,
  timestamp:    PropTypes.number.isRequired,
  is_shared:    PropTypes.bool,
  data:         PropTypes.shape({
      en: PropTypes.string.isRequired,
      he: PropTypes.string.isRequired,
      lead: bilingualPropType,
      title: bilingualPropType
  }),
  interfaceLang:      PropTypes.string,
  toggleSignUpModal:  PropTypes.func
};

const NewIndexStory = (props) => {
  const title = props.data.index;
  const heTitle = Sefaria.hebrewTerm(title);
  const url = title && Sefaria.ref(title)?"/" + Sefaria.normRef(Sefaria.ref(title).book):"/" + Sefaria.normRef(title);

  return (
    <StoryFrame cls="newIndexStory" cardColor={Sefaria.palette.indexColor(title)}>
        <StoryTypeBlock en="New Text" he="טקסט חדש"/>
        <NaturalTimeBlock timestamp={props.timestamp}/>
        <SaveLine dref={props.data.ref || title} toggleSignUpModal={props.toggleSignUpModal} classes={"storyTitleWrapper"}>
            <StoryTitleBlock en={title} he={heTitle} url={url} />
        </SaveLine>
        <DangerousInterfaceBlock classes="storyBody contentText" en={props.data.en} he={props.data.he}/>
        {props.data.ref?<ColorBarBox tref={props.data.ref}>
            <StoryBodyBlock en={props.data.text.en} he={props.data.text.he}/>
        </ColorBarBox>:""}
        {props.data.ref?<ReadMoreLink url={"/" + Sefaria.normRef(props.data.ref)}/>:""}
    </StoryFrame>
  );
};

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
  toggleSignUpModal:  PropTypes.func
};

// Todo: merge the class above and below.  They're nearly identical.
const NewVersionStory = (props) => {
  const title = props.data.index;
  const heTitle = Sefaria.hebrewTerm(title);
  const url = title && Sefaria.ref(title)?"/" + Sefaria.normRef(Sefaria.ref(title).book):"/" + Sefaria.normRef(title);

  return (
    <StoryFrame cls="newVersionStory" cardColor={Sefaria.palette.indexColor(title)}>
        <StoryTypeBlock en="New Version" he="גרסה חדשה" />
        <NaturalTimeBlock timestamp={props.timestamp}/>
        <SaveLine dref={props.data.ref || title} toggleSignUpModal={props.toggleSignUpModal} classes={"storyTitleWrapper"}>
            <StoryTitleBlock en={title} he={heTitle} url={url} />
        </SaveLine>
        <DangerousInterfaceBlock classes="storyBody contentText" en={props.data.en} he={props.data.he}/>
        {props.data.ref?<ColorBarBox tref={props.data.ref}>
            <StoryBodyBlock en={props.data.text.en} he={props.data.text.he}/>
        </ColorBarBox>:""}
        {props.data.ref?<ReadMoreLink url={"/" + Sefaria.normRef(props.data.ref)}/>:""}
    </StoryFrame>
  );
};

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
  toggleSignUpModal:  PropTypes.func
};

//         <ReadMoreLink url={Sefaria.normRef(props.data.example_work)}/>
const AuthorStory = (props) => (
    <StoryFrame cls="authorStory" cardColor={Sefaria.palette.indexColor(props.data.example_work)}>
        <StoryTypeBlock en="Author" he="מחבר" />
        <NaturalTimeBlock timestamp={props.timestamp}/>
        <StoryTitleBlock en={props.data.author_names.en} he={props.data.author_names.he} url={"/topics/" + props.data.author_key} />
        <DangerousInterfaceBlock classes="storyBody contentText" en={props.data.author_bios.en} he={props.data.author_bios.he}/>
    </StoryFrame>
);

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
  toggleSignUpModal:  PropTypes.func
};


const UserSheetsStory = (props) => {
      /* const positionBlock = (props.data.publisher_position) ?
            <SimpleInterfaceBlock classes="systemText storySubTitle"
              en={props.data.publisher_position}
              he={props.data.publisher_position}/>:"";
      */
      const organizationBlock = (props.data.publisher_organization) ?
            <SimpleInterfaceBlock classes="systemText storySubTitle"
              en={props.data.publisher_organization}
              he={props.data.publisher_organization}/>:"";
      return (
        <StoryFrame cls="userSheetsStory">
            <StoryTypeBlock en="People" he="קהילה" />
            <StoryTitleBlock en={props.data.publisher_name} he={props.data.publisher_name} url={props.data.publisher_url}>
                {organizationBlock}
                <FollowButton large={true} uid={props.data.publisher_id} following={props.data.publisher_followed}
                              toggleSignUpModal={props.toggleSignUpModal}/>
            </StoryTitleBlock>

            <img className="mediumProfileImage" src={props.data.publisher_image} alt={props.data.publisher_name}/>
            <div className="storySheetList">
                {props.data.sheets.map(sheet =>
                    <div className="storySheetListItem" key={sheet.sheet_id}>
                        <SaveLine toggleSignUpModal={props.toggleSignUpModal} historyObject={{ref: "Sheet " + sheet.sheet_id,
                                sheet_title: sheet.sheet_title, versions: {} }}>
                            <SimpleLinkedBlock en={sheet.sheet_title} he={sheet.sheet_title} url={"/sheets/" + sheet.sheet_id} aclasses="contentText"/>
                        </SaveLine>
                    </div>
                )}
            </div>
        </StoryFrame>
      );
};
UserSheetsStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.shape({
    title: bilingualPropType,
    lead: bilingualPropType,
    cozy: PropTypes.bool,
    publisher_id: PropTypes.number,
    publisher_name: PropTypes.string,
    publisher_url:  PropTypes.string,
    publisher_image:PropTypes.string,
    publisher_position: PropTypes.string,
    publisher_organization: PropTypes.string,
    publisher_followed: PropTypes.bool,
    sheets: PropTypes.arrayOf(PropTypes.shape({
        sheet_id: PropTypes.number,
        sheet_title: PropTypes.string,
        sheet_summary: PropTypes.string,
    })).isRequired
  }),
  interfaceLang:      PropTypes.string,
  toggleSignUpModal:  PropTypes.func.isRequired
};


const CollectionSheetListStory = (props) => (
    <StoryFrame cls="collectionSheetListStory">
        <StoryTypeBlock en={props.data.lead?props.data.lead.en:"Collection"} he={props.data.lead?props.data.lead.he:"אסופה"} />
        <StoryTitleBlock en={props.data.title.en} he={props.data.title.he}/>
        <img className="mediumProfileImage" src={props.data.collection_image} alt={props.data.title.en}/>
        <StorySheetList sheets={props.data.sheets} cozy={props.data.cozy} toggleSignUpModal={props.toggleSignUpModal}/>
    </StoryFrame>
);
CollectionSheetListStory.propTypes = {
  storyForm:          PropTypes.string,
  timestamp:          PropTypes.number,
  is_shared:          PropTypes.bool,
  data:               PropTypes.shape({
    title:            bilingualPropType.isRequired,
    collection_image: PropTypes.string,
    collection_url:   PropTypes.string,
    collection_name:  PropTypes.string,
    sheets:           PropTypes.arrayOf(sheetPropType).isRequired
  }),
  interfaceLang:      PropTypes.string,
  toggleSignUpModal:  PropTypes.func
};


const SheetListStory = (props) => {
  const lead = props.data.lead || {en: "Sheets", he: "גליונות"};

  return (
    <StoryFrame cls="sheetListStory">
        <StoryTypeBlock en={lead.en} he={lead.he}/>
        <StoryTitleBlock en={props.data.title.en} he={props.data.title.he}/>
        <StorySheetList sheets={props.data.sheets} toggleSignUpModal={props.toggleSignUpModal}/>
    </StoryFrame>
  );
};

SheetListStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.shape({
      lead: bilingualPropType,
      title: bilingualPropType.isRequired,
      sheets: PropTypes.arrayOf(sheetPropType).isRequired
  }),
  interfaceLang:      PropTypes.string,
  toggleSignUpModal:  PropTypes.func
};


const PublishSheetStory = (props) => (
    <StoryFrame cls="publishSheetStory">
        <StoryTypeBlock en="New Sheet" he="דף מקורות חדש" />
        <NaturalTimeBlock timestamp={props.timestamp}/>
        <SheetBlock sheet={props.data} toggleSignUpModal={props.toggleSignUpModal} isTitle={true}/>
    </StoryFrame>
);

PublishSheetStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         sheetPropType.isRequired,
  interfaceLang:      PropTypes.string,
  toggleSignUpModal:  PropTypes.func.isRequired
};

//todo: This might be a sheet!!

const TextPassageStory = (props) => {
  const url = "/" + Sefaria.normRef(props.data.ref);
  const lead = props.data.lead || {en: "Read More", he: "קרא עוד"};
  return (
    <StoryFrame cls="textPassageStory" cardColor={Sefaria.palette.indexColor(props.data.index)}>
        <StoryTypeBlock en={lead.en} he={lead.he} />
        <NaturalTimeBlock timestamp={props.timestamp}/>
        <SaveLine dref={props.data.ref} toggleSignUpModal={props.toggleSignUpModal} classes={"storyTitleWrapper"}>
            <StoryTitleBlock en={props.data.title.en} he={props.data.title.he} url={url}/>
        </SaveLine>
        <ColorBarBox tref={props.data.ref}>
            <StoryBodyBlock en={props.data.text.en} he={props.data.text.he}/>
        </ColorBarBox>
        <ReadMoreLink url={url}/>
    </StoryFrame>
  );
};

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
  toggleSignUpModal:  PropTypes.func
};

const TopicTextsStory = (props) => (
    <StoryFrame cls="topicTextsStory">
        <StoryTypeBlock en="Topic" he="" />
        <SeeAllLink url="/topics"/>
      <StoryTitleBlock en={props.data.title.en} he={props.data.title.he} url={"/topics/" + (props.data.slug || props.data.title.en)}/>
        <StoryTextList texts={props.data.texts} toggleSignUpModal={props.toggleSignUpModal}/>
    </StoryFrame>
);

TopicTextsStory.propTypes = {
  storyForm:    PropTypes.string,
  timestamp:    PropTypes.number,
  is_shared:    PropTypes.bool,
  data:         PropTypes.shape({
      title: bilingualPropType.isRequired,
      texts: PropTypes.arrayOf(textPropType)
  }),
  interfaceLang:      PropTypes.string,
  toggleSignUpModal:  PropTypes.func
};

const MultiTextStory = (props) => (
    <StoryFrame cls="multiTextStory">
        <StoryTypeBlock en={props.data.lead.en} he={props.data.lead.he}/>
        <StoryTitleBlock en={props.data.title.en} he={props.data.title.he}/>
        <StoryTextList texts={props.data.texts} toggleSignUpModal={props.toggleSignUpModal} />
    </StoryFrame>
);

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
  toggleSignUpModal:  PropTypes.func
};

const TopicListStory = (props) => (
    <StoryFrame cls="topicListStory">
        <StoryTypeBlock en={props.data.lead.en} he={props.data.lead.he}/>
        <SeeAllLink url="/topics"/>
        <StoryTitleBlock en={props.data.title.en} he={props.data.title.he}/>
        <NBox n={2} content={props.data.topics.map(topic =>
            <BlockLink title={topic.en} heTitle={topic.he} target={"/topics/" + (topic.slug || topic.en)} interfaceLink={true}/>
        )}/>
    </StoryFrame>
);

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
  toggleSignUpModal:  PropTypes.func
};


 /****************************
*                             *
*           Pieces            *
*                             *
 *****************************/

// todo: if we don't want the monopoly card effect, this component isn't needed.    // style={{"borderColor": cardColor || "#18345D"}}>
const StoryFrame = ({cls, cardColor, children}) => (
     <div className={'story ' + cls}>
        {children}
     </div>
);
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


const ColorBarBox = ({tref, children}) =>  <div className="colorBarBox" style={{"borderColor": Sefaria.palette.refColor(tref)}}>{children}</div>;


const StoryBodyBlock = ({en, he}) => <SimpleContentBlock classes="storyBody contentText" en={en} he={he}/>;


const StoryTextList = ({texts, toggleSignUpModal}) => (
    <div className="storyTextList">
        {texts.map((text,i) => <StoryTextListItem text={text} key={i} toggleSignUpModal={toggleSignUpModal} />)}
    </div>
);


const StoryTextListItem = ({text, toggleSignUpModal}) => (
    <div className="storyTextListItem">
        <ColorBarBox tref={text.ref} >
            <StoryBodyBlock en={text.en} he={text.he}/>
        </ColorBarBox>
        <SaveLine dref={text.ref} toggleSignUpModal={toggleSignUpModal}>
            <SimpleLinkedBlock url={"/" + Sefaria.normRef(text.ref)} en={text.ref} he={text.heRef} classes="contentText citationLine"/>
        </SaveLine>
    </div>
);
StoryTextListItem.propTypes = {text: textPropType.isRequired};


const StorySheetList = ({sheets, toggleSignUpModal, compact, cozy, smallfonts}) => (
    <div className="storySheetList">
        {sheets.map((sheet, i) => <SheetBlock sheet={sheet} key={i} smallfonts={smallfonts} compact={compact} cozy={cozy} toggleSignUpModal={toggleSignUpModal}/>)}
    </div>
);
StorySheetList.propTypes = {
    sheets: PropTypes.arrayOf(sheetPropType).isRequired,
    toggleSignUpModal: PropTypes.func
};


const SheetBlock = ({sheet, compact, cozy, smallfonts, isTitle, toggleSignUpModal}) => {
      const historyObject = {ref: "Sheet " + sheet.sheet_id,
                  sheet_title: sheet.sheet_title,
                  versions: {}};

      return (<div className="storySheetListItem">
        <SaveLine historyObject={historyObject} toggleSignUpModal={toggleSignUpModal}>
            <SimpleLinkedBlock en={sheet.sheet_title} he={sheet.sheet_title} url={"/sheets/" + sheet.sheet_id} classes={"sheetTitle" + (smallfonts?" chapterText lowercase":" pageTitle") + (isTitle ? " storyTitle" : "")}/>
        </SaveLine>
        {(sheet.sheet_summary && !(compact || cozy))?<SimpleInterfaceBlock classes={"storyBody" + (smallfonts?" smallText":" contentText")} en={sheet.sheet_summary} he={sheet.sheet_summary}/>:null}
        {cozy?"":<ProfileListing
          uid={sheet.publisher_id}
          url={sheet.publisher_url}
          image={sheet.publisher_image}
          name={sheet.publisher_name}
          is_followed={sheet.publisher_followed}
          smallfonts={smallfonts}
          position={sheet.publisher_position}
          organization={sheet.publisher_organization}
          toggleSignUpModal={toggleSignUpModal}
        />}
      </div>);
};
SheetBlock.propTypes = {sheet: sheetPropType.isRequired};


const SaveLine = (props) => (
    <div className={"saveLine " + props.classes}>
        <div className="beforeSave">
            {props.children}
        </div>
        <SaveButton tooltip={true}
            historyObject={props.historyObject || {ref: props.dref, versions: props.versions || {}}}
            toggleSignUpModal={props.toggleSignUpModal}
        />
      { props.afterChildren ? props.afterChildren : null }
    </div>
);

SaveLine.propTypes = {
  historyObject:        PropTypes.object,   // One or
  dref:                 PropTypes.string,   // the other
  toggleSignUpModal:    PropTypes.func,
  versions:             PropTypes.object,
  classes:              PropTypes.string,
  afterChildren:        PropTypes.object,
};

const ReadMoreLink = ({url}) => <SimpleLinkedBlock classes="learnMoreLink smallText" url={url} en="Read More ›" he="קרא עוד ›"/>;

export {
  Story,
  SheetBlock,
  StorySheetList,
  StoryTextListItem,
  SaveLine,
  StoryTitleBlock,
  ColorBarBox,
  StoryBodyBlock,
  StoryFrame,
  textPropType,
};
