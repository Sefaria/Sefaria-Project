import React, { Component, useState, useEffect } from 'react';
import {ToolsButton} from './ConnectionsPanel.jsx';

const AboutSheet = (props) => {

    const [title, setTitle] = useState(null);

    useEffect(() => {
        const sheet = Sefaria.sheets.loadSheetByID(props.masterPanelSheetId);
        setTitle(sheet.title.stripHtmlConvertLineBreaks());
    })
    return(<div>
        <h2 class="aboutHeader">{title}</h2>
    </div>)

}


export default AboutSheet;