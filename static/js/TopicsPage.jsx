import {
    InterfaceText,
    ContentText,
    ResponsiveNBox, AdminToolHeader,
} from './Misc';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import { NavSidebar, Modules } from './NavSidebar';
import Footer  from './Footer';
import Component from 'react-class';
import EditTextInfo from "./BookPage";
import CategoryChooser from "./BookPage";

// The root topics page listing topic categories to browse
const TopicsPage = ({setNavTopic, multiPanel, initialWidth}) => {
  const [addingTopics, setAddingTopics] = useState(false);

  let categoryListings = Sefaria.topic_toc.map(cat => {
    const openCat = e => {e.preventDefault(); setNavTopic(cat.slug, {en: cat.en, he: cat.he})};
    return (
      <div className="navBlock">
        <a href={`/topics/category/${cat.slug}`} className="navBlockTitle" onClick={openCat}>
          <InterfaceText text={cat} />
        </a>
        <div className="navBlockDescription">
          <InterfaceText text={cat.categoryDescription} />
        </div>
      </div>
    );
  });
  const letter = Sefaria.interfaceLang === "hebrew" ? "א" : "a";
  categoryListings.push(
    <div className="navBlock">
      <a href={"/topics/all/" + letter} className="navBlockTitle">
        <InterfaceText>All Topics A-Z</InterfaceText>
      </a>
      <div className="navBlockDescription">
        <InterfaceText>Browse or search our complete list of topics.</InterfaceText>
      </div>
    </div>
  );
  categoryListings = (
    <div className="readerNavCategories">
      <ResponsiveNBox content={categoryListings} initialWidth={initialWidth} />
    </div>
  );

  const about = multiPanel ? null :
    <Modules type={"AboutTopics"} props={{hideTitle: true}} />;

  const toggleAddingTopics = function(e) {
      if (e.currentTarget.id === "addTopic") {
        setAddingTopics(true);
      }
      else if(e.currentTarget.id === "cancel") {
        setAddingTopics(false);
     }
  }

  const sidebarModules = [
    multiPanel ? {type: "AboutTopics"} : {type: null},
    {type: "TrendingTopics"},
    {type: "JoinTheConversation"},
    {type: "GetTheApp"},
    {type: "SupportSefaria"},
  ];

  let canAddTopics =    Sefaria.is_moderator ? <div onClick={(e) => this.toggleAddingTopics(e)} id="addTopic" className="button small topic" role="button">
                                                  <InterfaceText>Add Topic</InterfaceText>
                                              </div> : null;
  let currentTopic = addingTopics ? <EditTopics/> : null;
  return (
    <div className="readerNavMenu noLangToggleInHebrew" key="0">
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner">
            <div className="navTitle tight sans-serif">
              <h1 className="sans-serif"><InterfaceText>Explore by Topic</InterfaceText></h1>
                {canAddTopics}
                {currentTopic}
            </div>
            { about }
            { categoryListings }
          </div>
          <NavSidebar modules={sidebarModules} />
        </div>
        <Footer />
      </div>
    </div>
  );
};


const EditTopics = ({topic}) => {
    const [savingStatus, setSavingStatus] = useState(false);
    const validate = function () {
        return true;
    }
    const save = function () {
        toggleInProgress();
        $.post(url,  {"json": postJSON}, function(data) {
          if (data.error) {
            toggleInProgress();
            alert(data.error);
          } else {
            alert("Text information saved.");
            window.location.href = "/admin/reset/"+index.current.title;
          }
          }).fail( function(xhr, textStatus, errorThrown) {
            alert("Unfortunately, there may have been an error saving this text information.");
            window.location.href = "/admin/reset/"+index.current.title;  // often this occurs when save occurs successfully but there is simply a timeout on cauldron so try resetting it
          });
    }
    const toggleInProgress = function() {
      setSavingStatus(savingStatus => !savingStatus);
    }
    return <div className="editTextInfo">
            <div className="static">
                <div className="inner">
                    {savingStatus ?
                        <div className="collectionsWidget">Saving topic information...<br/><br/>(processing title changes
                            may take some time)</div> : null}
                    <div id="newIndex">
                        <AdminToolHeader en="Topic Editor" he="Topic Editor" close={close} validate={validate}/>
                        <div className="section">
                            <label><InterfaceText>Topic Title</InterfaceText></label>
                            <input id="topicTitle" onBlur={(e) => setEnTitle(e.target.value)} defaultValue={enTitle}/>
                        </div>
                        <div className="section">
                            <label><InterfaceText>Category</InterfaceText></label>
                            <CategoryChooser update={setCategories} categories={categories}/>
                        </div>
                        <div className="section">
                            <label><InterfaceText>Topic Description</InterfaceText></label>
                            <input id="topicDesc" onBlur={(e) => setDescription(e.target.value)}
                                   defaultValue={description}/>
                        </div>
                    </div>
                </div>
            </div>
     </div>
}

export default TopicsPage;