import React from 'react';
import { InterfaceText } from './Misc';

const CommunityUploadPage = ({ multiPanel, menuOpen, openMenu, openNav, openDisplaySettings, toggleLanguage, toggleSignUpModal }) => {
  return (
    <div className="readerNavMenu communityUploadPage">
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner">
            <h1><InterfaceText text={{ en: "Upload Your Book", he: "העלאת ספר" }} /></h1>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityUploadPage;
