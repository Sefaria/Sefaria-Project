import React, { useState, useEffect, useContext } from 'react';
import { ConnectionsContext } from './ConnectionsPanel.jsx';

const AboutSheet = (props) => {

    const sheet = useContext(ConnectionsContext);
    const [title, setTitle] = useState(null);

    useEffect(() => {
        setTitle(sheet.title.stripHtmlConvertLineBreaks());
    })
    return(<div>
        <h2 class="aboutHeader">{title}</h2>
    </div>)

}


export default AboutSheet;