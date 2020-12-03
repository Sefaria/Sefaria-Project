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
  const collections = Sefaria.getUserGroupsFromCache(Sefaria._uid);
  const [collectionsSelected, setCollectionsSelected] = useState(Sefaria.getUserCollectionsForSheetFromCache(sheetID));
  const [dataLoaded, setDataLoaded] = useState(!!collections && !!collectionsSelected);

  useEffect(() => {
    if (!dataLoaded) {
      Promise.all([
         Sefaria.getUserGroups(Sefaria._uid),
         Sefaria.getUserCollectionsForSheet(sheetID)
      ])
     .then(() => {
        setCollectionsSelected(Sefaria.getUserCollectionsForSheetFromCache(sheetID));
        setDataLoaded(true);
      });
    }
  }, []);

  const onCheckChange = (event) => {
    const collection = event.target.getAttribute("label");
    let newCollectionsSelected;
    if (event.target.checked) {
      newCollectionsSelected = collectionsSelected + [collection];
      $.ajax({
        type: "post",
        url: `/api/collections/${collection}/add/${sheetID}`,
      });
    } else {
      newCollectionsSelected = collectionsSelected.filter(x => x !== collection);
      $.ajax({
        type: "post",
        url: `/api/collections/${collection}/remove/${sheetID}`,
      });
    }
    Sefaria._userCollectionsForSheet[sheetID] = newCollectionsSelected;
    setCollectionsSelected(newCollectionsSelected);
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
            onChange={onCheckChange}
            checked={collectionsSelected.includes(collection.name) ? "checked" : null} />
          <span className="checkmark"></span>
          {collection.name}
        </label>
      })}
    </div>
    <div className="collectionsWidgetCreate">
      <div className="collectionsWidgetCreateInputBox">
        <input className="collectionsWidgetCreateInput" placeholder={Sefaria._("Name")} />
      </div>
      <div className="button large collectionsWidgetCreateButton">
        <IntText>Create</IntText>
      </div>
    </div>
  </div>
};


export {
  CollectionsModal,
  CollectionsWidget
}