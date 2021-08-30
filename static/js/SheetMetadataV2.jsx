import React, { Component, useContext, useEffect, useState } from 'react';
import { ToolsButton, ConnectionsContext } from './ConnectionsPanel.jsx';
import Sefaria from './sefaria/sefaria.js';

const SheetMetadataV2 = (props) => {

    const [isOwner, setIsOwner] = useState(false); 
    const [isPublished, setIsPublished] = useState(false);
    const sheet = useContext(ConnectionsContext);

    useEffect(() => {
        setIsOwner(sheet.owner === Sefaria._uid); 
        setIsPublished(sheet.status === "public" ? true : false);
    }, []);

    return (<div><ToolsButton en="About this Sheet" he="תרגומים" image="about-text.svg" onClick={() => props.setConnectionsMode("AboutSheet")} />
        {isOwner ? <ToolsButton en={isPublished ? "Publish Settings" : "Publish"} he="תרגומים" image="publish.png" onClick={() => props.setConnectionsMode("Publish")} /> : null}
        <ToolsButton en="Copy" he="תרגומים" image="copy.png" onClick={() => props.setConnectionsMode("AboutSheet")} />
        <ToolsButton en="Add to Collection" he="תרגומים" image="add-to-collection.png" onClick={() => props.setConnectionsMode("AboutSheet")} />
        <ToolsButton en="Print" he="תרגומים" image="print.png" onClick={() => props.setConnectionsMode("AboutSheet")} />
        <ToolsButton en="Export to Google Docs" he="תרגומים" image="googledrive.png" onClick={() => props.setConnectionsMode("AboutSheet")} />
        {sheet.title.stripHtml()}
    </div>
    )
}

export default SheetMetadataV2;