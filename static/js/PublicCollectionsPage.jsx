import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Footer  from './Footer';
import Sefaria  from './sefaria/sefaria';
import Component from 'react-class';
import { NavSidebar } from './NavSidebar';
import {
  InterfaceText,
  LoadingMessage,
  ResponsiveNBox
} from './Misc';

const PublicCollectionsPage = ({multiPanel, navHome, initialWidth}) => {
  const [collectionsList, setCollectionsList] = useState(Sefaria.getCollectionsListFromCache());
  
  const sortCollectionList = d => {
    if (Sefaria.interfaceLang == "hebrew") {
      d.public.sort((a, b) => {
        const [aHe, bHe] = [a.name, b.name].map(Sefaria.hebrew.isHebrew);
        return aHe == bHe ? a.name - b.name : (aHe ? -1 : 1)
      });
    }
    return d;
  };

  if (collectionsList) {
    sortCollectionList(collectionsList);
  }

  useEffect(() => {
    Sefaria.getCollectionsList()
        .then(d => sortCollectionList(d))
        .then(d => setCollectionsList(d));
  });

  const sidebarModules = [
    {type: "AboutCollections"},
    {type: "StayConnected"},
  ];

  return (
    <div className="readerNavMenu">
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner">
            <h1>
              <InterfaceText>Collections</InterfaceText>
            </h1>

            <div className="collectionsList">
              { !!collectionsList ?
              (collectionsList.public.length ?
                <ResponsiveNBox 
                  content={collectionsList.public.map(item => 
                    <CollectionBlockListing data={item} key={item.name} />)}
                  initialWidth={initialWidth} />
                : <InterfaceText>There are no public collections yet.</InterfaceText>)
              : <LoadingMessage /> }
            </div>
          </div>
          <NavSidebar modules={sidebarModules} />
        </div>
        <Footer />
      </div>
    </div>);
}


const CollectionBlockListing = ({data}) => {
  return (
    <div className="navBlock">
      <a href={`/collections/${data.slug}`} className="navBlockTitle">
        <span className="collectionListingImageBox">
          <img className="collectionListingImage" src={data.imageUrl} alt="Collection Logo"/>
        </span>
        <InterfaceText>{data.name}</InterfaceText>
      </a>
      {data.description ?
      <div className="navBlockDescription clamped clamped5">
        <InterfaceText>{data.description.stripHtml()}</InterfaceText>
      </div> : null }
    </div>
  );
}


const CollectionListing = ({data, showMembership, small}) => {
  const imageUrl = data.imageUrl && !small ? data.imageUrl : "/static/icons/collection.svg";
  const imageClass = classNames({collectionListingImage: 1, default: !data.imageUrl});
  const collectionUrl = "/collections/" + data.slug;
  return (
    <div className="collectionListing navBlock">
      <div className="left-content">
        {!small ?
        <a href={collectionUrl}>
          <div className="collectionListingImageBox">
            <img className={imageClass} src={imageUrl} alt="Collection Logo"/>
          </div>
        </a>
        : null }
        <div className="collectionListingText">
          
          <a href={collectionUrl} className="collectionListingName">
            {small ? <img className={imageClass} src={imageUrl} alt="Collection Icon"/> : null}
            {data.name}
          </a>
         
          <div className="collectionListingDetails">
            {data.listed ? null :
              (<span className="unlisted">
                <img src="/static/img/eye-slash.svg"/>
                <InterfaceText>Unlisted</InterfaceText>
              </span>) }

            {data.listed ? null :
            <span className="collectionListingDetailSeparator">•</span> }
            
            <span className="collectionListingDetail collectionListingSheetCount">
              <InterfaceText>{`${data.sheetCount} `}</InterfaceText>
              <InterfaceText>Sheets</InterfaceText>
            </span>

            {data.memberCount > 1 && small ? 
            <span className="collectionListingDetailSeparator">•</span> : null }

            {data.memberCount > 1 && small ?
            <span className="collectionListingDetail collectionListingMemberCount">
              <InterfaceText>{`${data.memberCount} `}</InterfaceText>
              <InterfaceText>Editors</InterfaceText>
            </span> : null }
          </div>
        </div>
      </div>
    </div>
  );
}


export {
  CollectionListing,
  PublicCollectionsPage,
};