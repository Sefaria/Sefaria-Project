import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Footer  from './Footer';
import Sefaria  from './sefaria/sefaria';
import Component from 'react-class';
import { NavSidebar, Modules } from './NavSidebar';
import {
  InterfaceText,
  LoadingMessage,
  ResponsiveNBox
} from './Misc';

const PublicCollectionsPage = ({multiPanel, initialWidth}) => {
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
    multiPanel ? {type: "AboutCollections"} : {type: null},
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

            {multiPanel ? null :
            <Modules type={"AboutCollections"} props={{hideTitle: true}} /> }

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
        <div className="collectionListingImageBox">
          <img className="collectionListingImage" src={data.imageUrl} alt="Collection Logo"/>
        </div>
        <InterfaceText>{data.name}</InterfaceText>
      </a>
      {data.description ?
      <div className="navBlockDescription clamped clamped5">
        <InterfaceText>{data.description.stripHtml()}</InterfaceText>
      </div> : null }
    </div>
  );
}


export default PublicCollectionsPage