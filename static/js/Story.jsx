import React  from 'react';
import Sefaria  from './sefaria/sefaria';
import PropTypes  from 'prop-types';
import {
    ColorBarBox,
    SaveButton,
    SimpleInterfaceBlock,
    SimpleContentBlock,
    SimpleLinkedBlock,
    ProfileListing,
    InterfaceText,
    CategoryHeader,
} from './Misc';
import {ContentText} from "./ContentText";

// Much of Stories was removed November 2022.
// It remains because some of the Components are re-used in other areas of the site.

const sheetPropType = PropTypes.shape({
    publisher_id:           PropTypes.number,
    publisher_name:         PropTypes.string,
    publisher_url:          PropTypes.string,
    publisher_image:        PropTypes.string,
    publisher_position:     PropTypes.string,
    publisher_organization: PropTypes.string,
    publisher_followed:     PropTypes.bool,
    sheet_id:               PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    sheet_title:            PropTypes.string,
    sheet_summary:          PropTypes.string,
});
const textPropType = PropTypes.shape({
    ref:   PropTypes.string.isRequired,
    heRef: PropTypes.string.isRequired,
    en:    PropTypes.string.isRequired,
    he:    PropTypes.string.isRequired,
});
const bilingualPropType = PropTypes.shape({
    en: PropTypes.string.isRequired,
    he: PropTypes.string.isRequired,
});

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


const StoryTypeBlock = ({en, he}) => (
    <SimpleInterfaceBlock en={en} he={he} classes="storyTypeBlock sectionTitleText"/>
);


const StoryTitleBlock = ({url, he, en, children}) => {
    const SBlock = url ? SimpleLinkedBlock : SimpleInterfaceBlock;
    return <div className="storyTitleBlock">
        <SBlock classes="storyTitle" url={url} he={he} en={en}/>
        {children}
    </div>;
};


const StoryBodyBlock = ({children}) => (
    <SimpleContentBlock classes="storyBody">
        {children}
    </SimpleContentBlock>
);


const StoryTextListItem = ({text, toggleSignUpModal}) => (
    <div className="storyTextListItem">
        <ColorBarBox tref={text.ref} >
            <StoryBodyBlock>
              <ContentText html={{en: text.en, he: text.he}} />
            </StoryBodyBlock>
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

const IntroducedTextPassage = ({text, topic, afterSave, toggleSignUpModal, bodyTextIsLink=false}) => {
    if (!text.ref) { return null; }
    const versions = text.versions || {}
    const params = Sefaria.util.getUrlVersionsParams(versions);
    const url = "/" + Sefaria.normRef(text.ref) + (params ? "?" + params  : "");
    const heOnly = !text.en;
    const enOnly = !text.he;
    const overrideLanguage = (enOnly || heOnly) ? (heOnly ? "hebrew" : "english") : null;
    let innerContent = <ContentText html={{en: text.en, he: text.he}} overrideLanguage={overrideLanguage} bilingualOrder={["he", "en"]} />;
    const content = bodyTextIsLink ? <a href={url} style={{ textDecoration: 'none' }}>{innerContent}</a> : innerContent;

    return (
        <StoryFrame cls="introducedTextPassageStory">
            <CategoryHeader type="sources" data={[topic, text]} buttonsToDisplay={["edit"]}>
                <StoryTitleBlock en={text.descriptions?.en?.title} he={text.descriptions?.he?.title}/>
            </CategoryHeader>
            <div className={"systemText learningPrompt"}>
                <InterfaceText text={{"en": text.descriptions?.en?.prompt, "he": text.descriptions?.he?.prompt}} />
            </div>
            <SaveLine
                dref={text.ref}
                versions={versions}
                toggleSignUpModal={toggleSignUpModal}
                classes={"storyTitleWrapper"}
                afterChildren={afterSave || null} >
                <SimpleLinkedBlock classes={"contentText subHeading"} en={text.ref} he={text.heRef} url={url}/>
            </SaveLine>
            <ColorBarBox tref={text.ref}>
                <StoryBodyBlock>
                    {content}
                </StoryBodyBlock>
            </ColorBarBox>
        </StoryFrame>
    );
};
IntroducedTextPassage.propTypes = {
    intros: PropTypes.object,
    text: textPropType,
    afterSave: PropTypes.object,
    toggleSignUpModal:  PropTypes.func
};

const TextPassage = ({text, topic, afterSave, toggleSignUpModal, bodyTextIsLink=false}) => {
  if (!text.ref) { return null; }
  const versions = text.versions || {}
  const params = Sefaria.util.getUrlVersionsParams(versions);
  const url = "/" + Sefaria.normRef(text.ref) + (params ? "?" + params  : "");
  const heOnly = !text.en;
  const enOnly = !text.he;
  const overrideLanguage = (enOnly || heOnly) ? (heOnly ? "hebrew" : "english") : null;
  let innerContent = <ContentText html={{en: text.en, he: text.he}} overrideLanguage={overrideLanguage} bilingualOrder={["he", "en"]} />;
  const content = bodyTextIsLink ? <a href={url} style={{ textDecoration: 'none' }}>{innerContent}</a> : innerContent;

  return (
    <StoryFrame cls="textPassageStory">
      <CategoryHeader type="sources" data={[topic, text]} buttonsToDisplay={["edit"]}>
          <SaveLine
            dref={text.ref}
            versions={versions}
            toggleSignUpModal={toggleSignUpModal}
            classes={"storyTitleWrapper"}
            afterChildren={afterSave || null} >
              <StoryTitleBlock en={text.ref} he={text.heRef} url={url}/>
          </SaveLine>
      </CategoryHeader>
      <ColorBarBox tref={text.ref}>
          <StoryBodyBlock>
            {content}
          </StoryBodyBlock>
      </ColorBarBox>
    </StoryFrame>
  );
};
TextPassage.propTypes = {
  text: textPropType,
  afterSave: PropTypes.object,
  toggleSignUpModal:  PropTypes.func
};


const SheetBlock = ({sheet, compact, cozy, smallfonts, afterSave, toggleSignUpModal}) => {
    const historyObject = {
      ref: "Sheet " + sheet.sheet_id,
      sheet_title: sheet.sheet_title,
      sheet_owner: sheet.publisher_name,
      versions: {}
    };

    return (
      <StoryFrame cls={"storySheetListItem" + (smallfonts ? " small" : "")}>
        <SaveLine
            historyObject={historyObject}
            afterChildren={afterSave || null}
            toggleSignUpModal={toggleSignUpModal}>
            <SimpleLinkedBlock 
                en={sheet.sheet_title}
                he={sheet.sheet_title}
                url={"/sheets/" + sheet.sheet_id}
                classes={"sheetTitle storyTitle"}/>
        </SaveLine>

        {(sheet.sheet_summary && !(compact || cozy)) ? 
        <SimpleInterfaceBlock classes={"storyBody"} en={sheet.sheet_summary} he={sheet.sheet_summary}/>
        : null}
        
        {cozy ? null :
        <ProfileListing
          uid={sheet.publisher_id}
          url={sheet.publisher_url}
          image={sheet.publisher_image}
          name={sheet.publisher_name}
          is_followed={sheet.publisher_followed}
          smallfonts={smallfonts}
          position={sheet.publisher_position}
          organization={sheet.publisher_organization}
          toggleSignUpModal={toggleSignUpModal} />}
      </StoryFrame>
    );
};
SheetBlock.propTypes = {
    sheet: sheetPropType.isRequired,
    afterSave: PropTypes.object,
    toggleSignUpModal:  PropTypes.func
};


const SaveLine = ({classes, children, historyObject, dref, versions, hideSave, afterChildren, toggleSignUpModal}) => (
    <div className={"saveLine " + (classes ? classes : "")}>
        <div className="beforeSave">
            {children}
        </div>
        {hideSave ? null :
        <SaveButton tooltip={true}
            historyObject={historyObject || {ref: dref, versions: versions || {}}}
            toggleSignUpModal={toggleSignUpModal}
        />}
      { afterChildren ? afterChildren : null }
    </div>
);
SaveLine.propTypes = {
  historyObject:        PropTypes.object,   // One or
  dref:                 PropTypes.string,   // the other
  toggleSignUpModal:    PropTypes.func,
  versions:             PropTypes.object,
  classes:              PropTypes.string,
  hideSave:             PropTypes.bool,
  afterChildren:        PropTypes.object,
};


export {
  SheetBlock,
  StorySheetList,
  TextPassage,
  IntroducedTextPassage
};
