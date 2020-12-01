import {
	IntText
} from "./Misc"


const CollectionWidget = ({
  collections,
  sheetID,
  close
}) => {
  return <div className="collectionsWidget">
    <div className="whiteOverlay" onClick={close}></div>
    <div className="collectionsWidgetModal">
      <div className="collectionsWidgetTop">
        <IntText>Collections</IntText>
  	</div>
  </div>
};