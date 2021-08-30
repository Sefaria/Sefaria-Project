import React, { Component, useContext, useEffect, useState } from 'react';
import { ToolsButton, ConnectionsContext } from './ConnectionsPanel.jsx';
import Sefaria from './sefaria/sefaria.js';
import { CollectionsModal } from './CollectionsWidget.jsx';

const SheetMetadataV2 = (props) => {

    const [isOwner, setIsOwner] = useState(false); 
    const [isPublished, setIsPublished] = useState(false);
    const [showCollectionsModal, setShowCollectionsModal] = useState(false);
    const sheet = useContext(ConnectionsContext);

    useEffect(() => {
        setIsOwner(sheet.owner === Sefaria._uid); 
        setIsPublished(sheet.status === "public" ? true : false);
    }, []);

    const toggleCollectionsModal = () => {
        if (!Sefaria._uid) {
          props.toggleSignUpModal();
        } else {
          setShowCollectionsModal(!showCollectionsModal)
        }
      }

    return (<div><ToolsButton en="About this Sheet" he="תרגומים" image="about-text.svg" onClick={() => props.setConnectionsMode("AboutSheet")} />
        {isOwner ? <ToolsButton en={isPublished ? "Publish Settings" : "Publish"} he="תרגומים" image="publish.png" onClick={() => props.setConnectionsMode("Publish")} /> : null}
        <ToolsButton en="Copy" he="תרגומים" image="copy.png" onClick={() => props.setConnectionsMode("AboutSheet")} />
        <ToolsButton en="Add to Collection" he="תרגומים" image="add-to-collection.png" onClick={() => toggleCollectionsModal()} />
        <ToolsButton en="Print" he="תרגומים" image="print.png" onClick={() => window.print()} />
        <ToolsButton en="Export to Google Docs" he="תרגומים" image="googledrive.png" onClick={() => window.print()} /> 
        {/* todo: update export to google docs button so it works */}
        {showCollectionsModal ? <CollectionsModal
                        sheetID={sheet.id}
                        close={toggleCollectionsModal} />  : null}
    </div>
    )
}

export default SheetMetadataV2;