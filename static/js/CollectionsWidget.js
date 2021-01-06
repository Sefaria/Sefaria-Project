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


const CollectionsWidget = ({sheetID, close, handleCollectionsChange}) => {
  const [collections, setCollections] = useState(Sefaria.getUserGroupsFromCache(Sefaria._uid));
  const [collectionsSelected, setCollectionsSelected] = useState(Sefaria.getUserCollectionsForSheetFromCache(sheetID));
  const [dataLoaded, setDataLoaded] = useState(!!collections && !!collectionsSelected);
  const [newName, setNewName] = useState("");

  // Make sure we have loaded the user's list of collections, 
  // and which collections this sheet belongs to for this user
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
    // When a checkmark changes, add or remove this sheet from that collection
    console.log("On chech change", collection.name, checked)
    let url, newCollectionsSelected;
    if (checked) {
      newCollectionsSelected = [...collectionsSelected, collection];
      url = `/api/collections/${collection.slug}/add/${sheetID}`;
    } else {
      newCollectionsSelected = collectionsSelected.filter(x => x.slug !== collection.slug);
      url = `/api/collections/${collection.slug}/remove/${sheetID}`;
    }

    $.post(url, data => handleCollectionInclusionChange(data));
    Sefaria._userCollectionsForSheet[sheetID] = newCollectionsSelected;
    setCollectionsSelected(newCollectionsSelected);
  };

  const handleCollectionInclusionChange = (data) => {
    // When a sheet has been added or removed, update collections list data in cache
    let newCollections = Sefaria.getUserGroupsFromCache(Sefaria._uid).filter(c => c.slug != data.collection.slug);
    // Put the new collection first since it's just been modified
    newCollections = [data.collectionListing, ...newCollections];
    // Update in cache, but not in Component cache -- prevents the list from jumping around
    // while you're looking at it, but show this collection first next time you see the list.
    Sefaria._userGroups[Sefaria._uid] = newCollections;
    // Update cache for this collection's full listing, which has now changed
    Sefaria._groups[data.collection.slug] = data.collection;
    // This sheet's `displayedCollection` field may have changed
    delete Sefaria.sheets._loadSheetByID[sheetID];
    handleCollectionsChange && handleCollectionsChange();

  };

  const onNameChange = event => setNewName(event.target.value);

  const onCreateClick = () => {
    const collection = {name: newName};
    $.post("/api/groups", {json: JSON.stringify(collection)}, (data) => {
      if ("error" in data) {
        alert(data.error);
        return;
      }
      setNewName("");
      const newCollections = [data.collection, ...collections];
      Sefaria._userGroups[Sefaria._uid] = newCollections;
      setCollections(newCollections);
      onCheckChange(data.collection, true);
      handleCollectionsChange && handleCollectionsChange();
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
            onChange={event => onCheckChange(collection, event.target.checked)}
            checked={collectionsSelected.filter(x => x.slug === collection.slug).length ? "checked" : ""} />
          <span className="checkmark"></span>
          {collection.name}
        </label>
      })}
      {dataLoaded && collections.length == 0 ?
        <IntText className="emptyMessage">You can use collections to organize your sheets or public sheets you like. Collections can shared privately or made public on Sefaria.</IntText> : null }
    </div>
    <div className="collectionsWidgetCreate">
      <span className="collectionsWidgetPlus">+</span>
      <div className="collectionsWidgetCreateInputBox">
        <input className="collectionsWidgetCreateInput" placeholder={Sefaria._("Create new collection")} value={newName} onChange={onNameChange} />
      </div>
      {newName.length ?
      <div className="button extraSmall white collectionsWidgetCreateButton" onClick={onCreateClick}>
        <IntText>Create</IntText>
      </div>
      : null}
    </div>
    <div className="collectionsWidgetDone">
       <div className="button large fillWidth" onClick={close}>
        <IntText>Done</IntText>
      </div>     
    </div>
  </div>
};


export {
  CollectionsModal,
  CollectionsWidget
}