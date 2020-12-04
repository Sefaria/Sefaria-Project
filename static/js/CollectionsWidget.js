import { useState, useEffect } from 'react';
import {
	IntText,
} from "./Misc"
import Sefaria  from './sefaria/sefaria';


const CollectionsModal = (props) => {
  return <div className="collectionsModalBox">
    <div className="whiteOverlay" onClick={props.close}></div>
    <CollectionsWidget {...props} />
  </div>
};


const CollectionsWidget = ({sheetID, close}) => {
  const [collections, setCollections] = useState(Sefaria.getUserGroupsFromCache(Sefaria._uid));
  const [collectionsSelected, setCollectionsSelected] = useState(Sefaria.getUserCollectionsForSheetFromCache(sheetID));
  const [dataLoaded, setDataLoaded] = useState(!!collections && !!collectionsSelected);
  const [newName, setNewName] = useState("");


  useEffect(() => {
    if (!dataLoaded) {
      Promise.all([
         Sefaria.getUserGroups(Sefaria._uid),
         Sefaria.getUserCollectionsForSheet(sheetID)
      ])
     .then(() => {
        setCollections(Sefaria.getUserGroupsFromCache(Sefaria._uid));
        setCollectionsSelected(Sefaria.getUserCollectionsForSheetFromCache(sheetID));
        setDataLoaded(true);
      });
    }
  }, []);

  const onCheckChange = (collection, checked) => {
    let newCollectionsSelected;
    if (checked) {
      newCollectionsSelected = [...collectionsSelected, collection];
      $.post(`/api/collections/${collection}/add/${sheetID}`);
    } else {
      newCollectionsSelected = collectionsSelected.filter(x => x !== collection);
      $.post(`/api/collections/${collection}/remove/${sheetID}`)
    }
    Sefaria._userCollectionsForSheet[sheetID] = newCollectionsSelected;
    setCollectionsSelected(newCollectionsSelected);
  };

  const onNameChange = event => setNewName(event.target.value);

  const onCreateClick = () => {
    const collection = {name: newName, "new": true};
    $.post("/api/groups", {json: JSON.stringify(collection)}, (data) => {
      if ("error" in data) {
        alert(data.error);
        return;
      }
      setNewName("");
      const newCollections = [data.collection, ...collections];
      Sefaria._userGroups[Sefaria._uid] = newCollections;
      setCollections(newCollections);
      onCheckChange(data.collection.name, true);
    });
  };

  return <div className="collectionsWidget">
    <div className="collectionsWidgetTop">
      <IntText className={"collectionsWidgetTitle"}>Collections</IntText>
      <div className="collectionsWidgetClose" onClick={close}>×</div>
    </div>
    <div className="collectionsWidgetList">
      {!dataLoaded ? null :
        collections.map((collection, i) => {
        return <label className="checkmarkLabel" key={i+collection.name}>
          <input 
            type="checkbox"
            label={collection.name}
            onChange={event => onCheckChange(event.target.getAttribute("label"), event.target.checked)}
            checked={collectionsSelected.includes(collection.name) ? "checked" : ""} />
          <span className="checkmark"></span>
          {collection.name}
        </label>
      })}
    </div>
    <div className="collectionsWidgetCreate">
      <div className="collectionsWidgetCreateInputBox">
        <input className="collectionsWidgetCreateInput" placeholder={Sefaria._("Name")} value={newName} onChange={onNameChange} />
      </div>
      <div className="button large collectionsWidgetCreateButton" onClick={onCreateClick}>
        <IntText>Create</IntText>
      </div>
    </div>
  </div>
};


export {
  CollectionsModal,
  CollectionsWidget
}