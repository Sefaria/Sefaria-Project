import Sefaria from "../sefaria/sefaria";
import React, {useEffect, useState} from "react";
import {InterfaceText} from "../Misc";
import Modal from "../common/modal";
import ReactTags from "react-tag-autocomplete";
import Button from "../common/Button";

const PublishModal = ({close, status, sheetID, postSheet}) => {
  // `status` is 'public' or 'unlisted'.  we are going to toggle the status.  if it's 'public' we want to unlist it
  // so this modal simply posts the new status.  If it's 'unlisted', we want to give the user the PublishMenu component
  // allowing them to specify title, summary, and tags and from there the user can choose to make the sheet public
  const sheet = Sefaria.sheets.loadSheetByID(sheetID);
  const publishState = {
    notPosting: "",
    posting: "Updating sheet...",
    posted: "Success!",
  }

  // if it's not yet public, show PublishMenu and don't yet post it; if it's public, start posting it
  const initState = status === 'unlisted' ? publishState.notPosting : publishState.posting;
  const [publishText, setPublishText] = useState(initState);

  const handleClose = () => {
    if (publishText !== publishText.posting) {
      // don't allow user to close modal while posting is taking place
      close();
    }
  }
  const togglePublishStatus = async () => {
      sheet.status = status === 'public' ? "unlisted" : "public";
      sheet.lastModified = sheet.dateModified;
      delete sheet._id;
      try {
        await postSheet(JSON.stringify(sheet));
        setPublishText(publishState.posted);
      } catch (error) {
        setPublishText(`Error: ${error.message}`);
      }
  }
  useEffect( () => {
      const toggle = async () => {
          if (publishText === publishState.posting) {
              await togglePublishStatus();
          }
      }
      toggle();
  }, [publishText])
  let contents;
  if (publishText === publishState.notPosting) {
      contents = <PublishMenu sheet={sheet} publishCallback={() => setPublishText(publishState.posting)}/>;
  }
  else {
      contents = <div className="modalMessage"><InterfaceText>{publishText}</InterfaceText></div>;
  }
  return <Modal isOpen={true} close={handleClose}>
              <div className="modalTitle"><InterfaceText>Publish</InterfaceText></div>
              {contents}
          </Modal>;
}

const PublishMenu = ({sheet, publishCallback}) => {
  const reactTags = React.createRef();
  const [title, setTitle] = useState(sheet.title.stripHtmlConvertLineBreaks() || "");
  const [summary, setSummary] = useState(sheet.summary || "");
  const [suggestions, setSuggestions] = useState([]);
  const [validation, setValidation] = useState({
          validationMsg: "",
          validationFailed: "none"
      });
  const [tags, setTags] = useState(
      sheet.topics.map((topic, i) => ({
          id: i,
          name: topic["asTyped"],
          slug: topic["slug"],
      })
      )
  )
  const isFormValidated = () => {
        if ((!summary || summary.trim() === '') && tags.length === 0) {
            setValidation({
                validationMsg: Sefaria._("Please add a description and topics to publish your sheet."),
                validationFailed: "both"
            });
            return false
        }
        else if (!summary || summary.trim() === '') {
            setValidation({
                validationMsg: Sefaria._("Please add a description to publish your sheet."),
                validationFailed: "summary"
            });
            return false
        }

        else if (tags.length === 0) {
            setValidation({
                validationMsg: Sefaria._("Please add topics to publish your sheet."),
                validationFailed: "topics"
            });
            return false;
        }

        else {
            setValidation({
                validationMsg: "",
                validationFailed: "none"
            });
            return true;
        }
    }
    const updateSuggestedTags = (input) => {
    if (input === "") return
    Sefaria.getName(input, 5, "Topic").then(d => {
        const topics = d.completion_objects
            .map((filteredObj, index) => ({
                id: index,
                name: filteredObj.title,
                slug: filteredObj.key
            })
            )
        return topics;
    }).then(topics => setSuggestions(topics))
  }
  const onTagDelete = (i) => {
    const newTags = tags.slice(0);
    newTags.splice(i, 1);
    setTags(newTags);
  }
  const onTagAddition = (tag) => {
    const newTags = [].concat(tags, tag);
    setTags(newTags);
  }
  const onTagValidate = (newTag) => {
    // Validate that the new tag is not already in the list and is in the list of autocompleted suggestions
    const isSuggestion = suggestions.some(suggestion => suggestion.slug === newTag.slug);
    const isNewTag = tags.every((item) => item.name !== newTag.name);
    return isNewTag && isSuggestion;
  }
  const handleSummaryChange = (event) => {
    const newSummary = event.target.value;
    if (event.target.value.length > 140) {
        setValidation({
            validationMsg: Sefaria._("The summary description is limited to 140 characters."),
            validationFailed: "summary"
        });
    }
    else {
        setValidation({
            validationMsg: "",
            validationFailed: "none"
        });
    }
    setSummary(newSummary);
  }
  const handlePublish = () => {
    sheet.title = title === "" ? "Untitled" : title;
    sheet.summary = summary;
    sheet.topics = tags.map(tag => ({
          asTyped: tag.name,
          slug: tag.slug,
        })
    );
    if ((isFormValidated())) {
      publishCallback(true);
    }
  }
  return <>
        <div className={"publishBox sans-serif"}>
            <div className="publishLabel">
                <InterfaceText>Title</InterfaceText>
            </div>
            <input type="text"
                   value={title}
                   placeholder={Sefaria._("Untitled")}
                   onChange={(e) => setTitle(e.target.value)}></input>
            <div className="publishLabel">
                <InterfaceText>Description (max 140 characters)</InterfaceText>
            </div>
            <textarea
                className={validation.validationFailed === "both" || validation.validationFailed === "summary" ? "error" : ""}
                rows="3"
                maxLength="140"
                placeholder={Sefaria._("Write a short description of your sheet...")}
                value={summary}
                onChange={handleSummaryChange}></textarea>
            <div className="publishLabel">
                <InterfaceText>Add topics related to your sheet</InterfaceText>
            </div>
            <div
                className={validation.validationFailed === "both" || validation.validationFailed === "topics" ? "error" : ""}>
                <ReactTags
                    ref={reactTags}
                    allowNew={true}
                    tags={tags}
                    suggestions={suggestions}
                    onDelete={onTagDelete}
                    placeholderText={Sefaria._("Add a topic...")}
                    delimiters={["Enter", ","]}
                    onAddition={onTagAddition}
                    onValidate={onTagValidate}
                    onInput={updateSuggestedTags}
                />
            </div>
            {validation.validationFailed !== "none" &&
                <p className="error"><InterfaceText>{validation.validationMsg}</InterfaceText></p>}
            <Button className="small" onClick={handlePublish}>Publish</Button>
        </div>
    </>
}

export default PublishModal;
