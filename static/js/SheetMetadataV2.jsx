import React, { Component, useState } from 'react';
import ToolsButton from './ConnectionsPanel.jsx';

const SheetMetadataV2 = (props) => {

    return (<div>
        Hi
        {/* <ToolsButton en="About this Sheet" image="about-text.svg" onClick={() => console.log('clicked')} /> 
        <ToolsButton en="Publish" image="about-text.svg" onClick={() => console.log('clicked')} />  */}
    </div>)

}

// class SheetMetadataV2 extends Component {
//     constructor(props) {
//         super(props);
//     }

//     componentDidMount() {

//     }
//     render() {
//         return(<div>
//         Hi
//         {/* <ToolsButton en="About this Sheet" image="about-text.svg" onClick={() => console.log('clicked')} /> 
//         <ToolsButton en="Publish" image="about-text.svg" onClick={() => console.log('clicked')} />  */}
//         </div>)
//     }

//     loadSaved() {
//         Sefaria.getRefSavedHistory("Sheet " + this.props.id).then(data => {
//           const sheetSaves = [];
//           for (let hist of data) {
//             sheetSaves.push(hist["uid"]);
//           }
//           if (this._isMounted) {
//             this.setState({ sheetSaves });
//           }
//         });
//       }
// }

export default SheetMetadataV2;