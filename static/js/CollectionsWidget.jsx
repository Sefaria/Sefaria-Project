import { useState, useEffect } from 'react';
import {
	InterfaceText,
} from "./Misc"
import Sefaria  from './sefaria/sefaria';


const CollectionsModal = (props) => {
  // A CollectionsWidget as a modal
  const onClose = () => {
    props.handleCollectionsChange && props.handleCollectionsChange();
    props.close();
  };
  return <div className="collectionsModalBox">
    <div className="whiteOverlay" onClick={onClose}></div>
    <CollectionsWidget {...props} />
  </div>
};


const CollectionsWidget = ({sheetID, close, handleCollectionsChange}) => {
  // A box that lets you control which of your collections `sheetID` belongs to
  
  const initialCollectionsSort = (cs, csSelected) => {
    // When first opened, sort checked collections to top, but don't reshuffle when user clicks check of open modal
    if (!cs || !csSelected) { return null; }
    return cs.sort((a, b) => {
      let aSel, bSel;
      [aSel, bSel] = [a, b].map(x => !!csSelected.filter(y => y.slug === x.slug).length)
      if (aSel === bSel) { return a.lastModified > b.lastModified ? -1 : 1; }
      else { return aSel ? -1 : 1; }
    });
  };
  const [collectionsSelected, setCollectionsSelected] = useState(Sefaria.getUserCollectionsForSheetFromCache(sheetID));
  let initialCollections = Sefaria.getUserCollectionsFromCache(Sefaria._uid);
  initialCollections = initialCollections ? initialCollectionsSort(initialCollections.slice(), collectionsSelected) : null;
  const [collections, setCollections] = useState(initialCollections);
  const [dataLoaded, setDataLoaded] = useState(!!collections && !!collectionsSelected);
  const [newName, setNewName] = useState("");
  const [changed, setChanged] = useState(false);

  // Make sure we have loaded the user's list of collections, 
  // and which collections this sheet belongs to for this user
  useEffect(() => {
    if (!dataLoaded) {
      Promise.all([
         Sefaria.getUserCollections(Sefaria._uid),
         Sefaria.getUserCollectionsForSheet(sheetID)
      ])
     .then(() => {
        const initialCollectionsSelected = Sefaria.getUserCollectionsForSheetFromCache(sheetID);
        const initialSortedCollections = initialCollectionsSort(Sefaria.getUserCollectionsFromCache(Sefaria._uid), initialCollectionsSelected);
        setCollections(initialSortedCollections);
        setCollectionsSelected(initialCollectionsSelected);
        setDataLoaded(true);
      });
    }
  }, []);

  const onCheckChange = (collection, checked) => {
    // When a checkmark changes, add or remove this sheet from that collection
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
    let newCollections = Sefaria.getUserCollectionsFromCache(Sefaria._uid).filter(c => c.slug !== data.collection.slug);
    // Put the new collection first since it's just been modified
    newCollections = [data.collectionListing, ...newCollections];
    // Update in cache, but not in Component state -- prevents the list from jumping around
    // while you're looking at it, but show this collection first next time you see the list.
    Sefaria._userCollections[Sefaria._uid] = newCollections;
    // Update cache for this collection's full listing, which has now changed
    Sefaria._collections[data.collection.slug] = data.collection;
    // Update sheet cache
    Sefaria.sheets._loadSheetByID[sheetID] = data.sheet;
    Sefaria.sheets.updateUserSheets(data.sheetListing, Sefaria._uid, true, true);
    setChanged(true);
  };

  const onNameChange = event => setNewName(event.target.value);

  const onCreateClick = () => {
    const collection = {name: newName};
    $.post("/api/collections", {json: JSON.stringify(collection)}, (data) => {
      if ("error" in data) {
        alert(data.error);
        return;
      }
      setNewName("");
      const newCollections = [data.collection, ...collections];
      Sefaria._userCollections[Sefaria._uid] = newCollections;
      setCollections(newCollections);
      onCheckChange(data.collection, true);
      handleCollectionsChange && handleCollectionsChange();
    });
  };

  const onClose = () => {
    if (changed && handleCollectionsChange) {
      handleCollectionsChange();
    }
    close();
  };

  return <div className="collectionsWidget">
    <div className="collectionsWidgetTop">
      <span className={"collectionsWidgetTitle"}>
        <InterfaceText>{ Sefaria._("Collections")} </InterfaceText>
      </span>
      <div className="collectionsWidgetClose" onClick={onClose}>×</div>
    </div>
    <div className="collectionsWidgetList serif">
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
      {dataLoaded && collections.length === 0 ?
        <span className={"emptyMessage"}>
          <InterfaceText>
           { Sefaria._("You can use collections to organize your sheets or public sheets you like. Collections can shared privately or made public on Sefaria.")}
          </InterfaceText>
        </span> : null }
    </div>
    <div className="collectionsWidgetCreate">
      <span className="collectionsWidgetPlus">+</span>
      <div className="collectionsWidgetCreateInputBox">
        <input className="collectionsWidgetCreateInput" placeholder={Sefaria._("Create new collection")} value={newName} onChange={onNameChange} />
      </div>
      {newName.length ?
      <div className="button extraSmall white collectionsWidgetCreateButton" onClick={onCreateClick}>
        <InterfaceText>{Sefaria._("Create")} </InterfaceText>
      </div>
      : null}
    </div>
    <div className="collectionsWidgetDone">
       <div className="button large fillWidth" onClick={onClose}>
        <InterfaceText>{Sefaria._("Done")}</InterfaceText>
      </div>     
    </div>
  </div>
};


export {
  CollectionsModal,
  CollectionsWidget
}