import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  IntText,
  LoadingMessage,
  SinglePanelNavHeader,
} from './Misc';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Footer  from './Footer';
import Sefaria  from './sefaria/sefaria';
import Component from 'react-class';


function PublicCollectionsPage({multiPanel, navHome}) {
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

  const classStr = classNames( {systemPanel: 1, readerNavMenu: 1, noHeader: 1 });
  return (
    <div className={classStr}>
      {multiPanel ? null :
        <SinglePanelNavHeader
          title="Collections"
          navHome={navHome}
          showDisplaySettings={false}/>
      }
      <div className="content hasFooter">
        <div className="contentInner">
          {multiPanel ?
          <h1>
            <IntText>Collections</IntText>
          </h1> : null}
          {multiPanel ?
          <center>
            <a className="button white" href="/collections/new">
              <IntText>Create a Collection</IntText>
            </a>
          </center> : null}

          <div className="collectionsList">
            { !!collectionsList ?
                (collectionsList.public.length ?
                  collectionsList.public.map(function(item) {
                    return <CollectionListing data={item} key={item.name} />
                  })
                  : <IntText>There are no public collections yet.</IntText>)
                : <LoadingMessage />
            }
          </div>

        </div>
        <Footer />
      </div>
    </div>);

}
PublicCollectionsPage.propTypes = {};


function CollectionListing({data, showMembership, small}) {
  const imageUrl = data.imageUrl && !small ? data.imageUrl : "/static/icons/collection.svg";
  const imageClass = classNames({collectionListingImage: 1, default: !data.imageUrl});
  const collectionUrl = "/collections/" + data.slug;
  return (<div className="collectionListing">
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
                      <IntText>Unlisted</IntText>
                    </span>) }

                  {data.listed ? null :
                  <span className="collectionListingDetailSeparator">•</span> }
                  
                  <span className="collectionListingDetail collectionListingSheetCount">
                    <IntText>{`${data.sheetCount} `}</IntText>
                    <IntText>Sheets</IntText>
                  </span>

                  {data.memberCount > 1 && small ? 
                  <span className="collectionListingDetailSeparator">•</span> : null }

                  {data.memberCount > 1 && small ?
                  <span className="collectionListingDetail collectionListingMemberCount">
                    <IntText>{`${data.memberCount} `}</IntText>
                    <IntText>Editors</IntText>
                  </span> : null }
                </div>
              </div>
            </div>
          </div>);
}
CollectionListing.propTypes = {
  data: PropTypes.object.isRequired,
  showMembership: PropTypes.bool,
};


export {
  CollectionListing,
  PublicCollectionsPage,
};