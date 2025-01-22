import Modal from "../common/modal";
import { ShareBox } from "../ConnectionsPanel";
import { CollectionsWidget } from "../CollectionsWidget";
import { AddToSourceSheetBox } from "../AddToSourceSheet";
import React, { useEffect, useState } from "react";
import Sefaria from "../sefaria/sefaria";
import { InterfaceText } from "../Misc";
import Button from "../common/Button";
import ReactTags from "react-tag-autocomplete";

const ShareModal = ({sheetID, close}) => {
  return <Modal close={close}>
          <ShareBox
              sheetID={sheetID}
              url={window.location.href}
          />
        </Modal>;
}

const CollectionsModal = ({close, sheetID, handleCollectionsChange, editable}) => {
  return <Modal close={close}>
            <CollectionsWidget
                sheetID={sheetID}
                close={close}
                handleCollectionsChange={handleCollectionsChange}/>
        </Modal>;
}

const AddToSourceSheetModal = ({nodeRef, srefs, close}) => {
  return <Modal close={close}><AddToSourceSheetBox nodeRef={nodeRef} srefs={srefs} hideGDocAdvert={true}/></Modal>
}

const CopyModal = ({close, sheetID}) => {
  const copyState = {
    copying: { en: "Copying Sheet...", he: "מעתיק..."},
    copied: { he: "צפייה בדף המקורות", en: "View Copy"},
    error: { en: "Sorry, there was an error.", he: "סליחה, ארעה שגיאה" }
  }
  const [copyText, setCopyText] = useState(copyState.copying);
  const [copiedSheetId, setCopiedSheetId] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const filterAndSaveCopiedSheetData = async (data) => {
    let newSheet = Sefaria.util.clone(data);
    newSheet.status = "unlisted";
    newSheet.title = newSheet.title + " (Copy)";
    if (Sefaria._uid !== newSheet.owner) {
      newSheet.via = newSheet.id;
      newSheet.viaOwner = newSheet.owner;
      newSheet.owner = Sefaria._uid
    }
    delete newSheet.id;
    delete newSheet.ownerName;
    delete newSheet.views;
    delete newSheet.dateCreated;
    delete newSheet.dateModified;
    delete newSheet.displayedCollection;
    delete newSheet.collectionName;
    delete newSheet.collectionImage;
    delete newSheet.likes;
    delete newSheet.promptedToPublish;
    delete newSheet._id;

    return await Sefaria.apiRequestWithBody("/api/sheets/", null, newSheet);
  }

  useEffect( () => {
    async function fetchData() {
      let loadedSheet = Sefaria.sheets.loadSheetByID(sheetID);
      return await filterAndSaveCopiedSheetData(loadedSheet);
    }
    if (!loaded) {
      setLoaded(true);
      fetchData().then((response) => {
        if (response.id) {
          setCopyText(copyState.copied);
          setCopiedSheetId(response.id);
        } else {
          setCopyText(copyState.error);
        }
      })
    }
  })

  const getCopySuccessMessage = () => {
    return <><InterfaceText>Success!</InterfaceText>
              <a className="successMessage" href={`/sheets/${copiedSheetId}`} target='_blank'>
              <InterfaceText>View your Copy</InterfaceText>
              </a>
          </>;
  }
  const handleClose = () => {
    if (copyText.en !== copyState.copying) { // don't allow user to close modal while copying is taking place
      setLoaded(false);
      close();
    }
  }

  const copyMessage = copyText.en === copyState.copied.en ? getCopySuccessMessage() : <InterfaceText>{copyText.en}</InterfaceText>;
  return <GenericSheetModal title={<InterfaceText>Copy</InterfaceText>} message={copyMessage} close={handleClose}/>;
}

const GenericSheetModal = ({title, message, close}) => {
  return <Modal close={close}>
            <div className="modalTitle">{title}</div>
            <div className="modalMessage">{message}</div>
        </Modal>;
}

const SaveModal = ({historyObject, close}) => {
  const isSaved = !!Sefaria.getSavedItem(historyObject);
  const savingMessage = "Saving...";
  const [message, setMessage] = useState(savingMessage);
  const savedMessage = isSaved ? "Sheet no longer saved." : "Saved sheet.";
  useEffect(() => {
    if (message === savingMessage) {
      Sefaria.toggleSavedItem(historyObject)
          .finally(() => {
            setMessage(savedMessage);
          });
    }
  });
  return <GenericSheetModal title={<InterfaceText>Save</InterfaceText>} message={<InterfaceText>{message}</InterfaceText>} close={close}/>;
}

const GoogleDocExportModal = ({ sheetID, close }) => {
  const googleDriveState = {
    exporting: {en: "Exporting to Google Docs...", he: "מייצא לגוגל דוקס..."},
    exportComplete: {en: "Success!", he: "ייצוא הסתיים"}
  }
  const [googleDriveText, setGoogleDriveText] = useState(googleDriveState.exporting);
  const [googleDriveLink, setGoogleDriveLink] = useState("");
  const exportToDrive = async () => {
    if (googleDriveText.en === googleDriveState.exporting.en) {
      history.replaceState("", document.title, window.location.pathname + window.location.search); // remove exportToDrive hash once it's used to trigger export
      try {
        const response = await Sefaria.apiRequestWithBody(`/api/sheets/${sheetID}/export_to_drive`, null, {}, "POST", false);
        if (response.status === 401) {
          // couldn't authenticate, so forward to google authentication
          window.location.href = `/gauth?next=${encodeURIComponent(window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search + "#afterLoading=exportToDrive")}`;
          return;
        }
        const data = await response.json();
        if ("error" in data) {
          setGoogleDriveText(data.error.message);
        } else {
          // Export succeeded
          setGoogleDriveLink(data.webViewLink);
          setGoogleDriveText(googleDriveState.exportComplete);
        }
      } catch (error) {
        setGoogleDriveText(error);
      }
    }
  }

  useEffect(() => {
    exportToDrive();
  }, [googleDriveText]);
  const getExportMessage = () => {
    if (googleDriveText.en === googleDriveState.exporting.en) {
      return <InterfaceText text={googleDriveText}/>;
    } else {
      return <>
        <InterfaceText text={googleDriveText}/>&nbsp;
        <a href={googleDriveLink} target="_blank" className="successMessage"><InterfaceText>View in Google
          Docs</InterfaceText></a>
      </>
    }
  }
  return <GenericSheetModal title={<InterfaceText>Export</InterfaceText>}
                            message={getExportMessage()}
                            close={close}/>;
}

const DeleteModal = ({close, sheetID, authorUrl}) => {
  useEffect( () => {
    Sefaria.sheets.deleteSheetById(sheetID).then(() => {
      window.location.href = authorUrl;
    });
  });
  return <GenericSheetModal title={<InterfaceText>Deleting...</InterfaceText>} close={close}/>;
}

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
        await postSheet(sheet);
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
    Sefaria.getName(input, false, 0).then(d => {
        const topics = d.completion_objects
            .filter(obj => obj.type === "Topic")
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
  const onTagValidate = (tag) => {
      return tags.every((item) => item.name !== tag.name)
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
  return <div>
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
                    delimiters={["Enter", "Tab", ","]}
                    onAddition={onTagAddition}
                    onValidate={onTagValidate}
                    onInput={updateSuggestedTags}
                />
            </div>
            {validation.validationFailed !== "none" &&
                <p className="error"><InterfaceText>{validation.validationMsg}</InterfaceText></p>}
            <Button className="small" onClick={handlePublish}>Publish</Button>
        </div>
    </div>
}

export { ShareModal, CollectionsModal, AddToSourceSheetModal, CopyModal, SaveModal, GoogleDocExportModal, DeleteModal,
         PublishModal };