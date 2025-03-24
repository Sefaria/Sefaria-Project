import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { NavSidebar, Modules } from './NavSidebar';
import Footer from './Footer';
import { InterfaceText } from './Misc';

const Plans = ({ multiPanel, toggleSignUpModal, initialWidth }) => {
  // For now, just display "hi"
  return (
    <div className="readerNavMenu plansPage sans-serif" key="0">
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner mainColumn">
            <h1>hi</h1>
          </div>
          <NavSidebar modules={[]} /> {/* Empty sidebar for now */}
        </div>
        <Footer />
      </div>
    </div>
  );
};

Plans.propTypes = {
  multiPanel: PropTypes.bool.isRequired,
  toggleSignUpModal: PropTypes.func.isRequired,
  initialWidth: PropTypes.number.isRequired,
};

export default Plans;