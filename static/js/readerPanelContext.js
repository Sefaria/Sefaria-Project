import React, { useState } from "react";

const ReaderPanelContext = React.createContext({});
ReaderPanelContext.displayName = "ReaderPanelContext";

function PanelContextWrapper({ children }) {
  // In ReaderApp, panels are unmounted and remounted when a users adds or removes one. This causes the panels to lose their state.
  // In the current implementation, panels regain the state they had when they were last mounted.
  // Using useState for variables such as the panels version would not work because the state would be reset when the panel is unmounted.
  // Therefore, the context here is updated from the ReaderApp component when a panel is added or removed, and the context is
  // handled by readerAppContextObject, setReaderAppContextObject which update a json object containing the state of the panel
  // by ID. A typical state will look like:
  // {
  //   "adf17433-fd69-459d-8217-1f80da6307b5":{"translation":{"versionTitle":"The Koren Jerusalem Bible","language":"en"}},
  //   "e5ab4c85-8201-4281-8316-2919fe4a3236":{"translation":{"versionTitle":"Rashi Chumash, Metsudah Publications, 2009","language":"en"}}
  // }
  // To retrieve the appropriate context, the panel ID is passed to e every component that needs to access the context.
  
  const [readerAppContextObject, setReaderAppContextObject] = useState({});

  return (
    <ReaderPanelContext.Provider value={{readerAppContextObject, setReaderAppContextObject}}>
      {children}
    </ReaderPanelContext.Provider>
  );
}



export {
    ReaderPanelContext,
    PanelContextWrapper,
}