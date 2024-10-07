import React, { useState, useEffect, useRef} from 'react';
import PropTypes  from 'prop-types';
import ReactDOM  from 'react-dom';
import Component from 'react-class';
import classNames  from 'classnames';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import {
  SearchButton,
  GlobalWarningMessage,
  ProfilePic,
  InterfaceLanguageMenu,
  InterfaceText,
  LanguageToggleButton,
  DonateLink
} from './Misc';
import {Autocomplete} from './Autocomplete'

class Header extends Component {
  constructor(props) {
    super(props)
    this.state = {
      mobileNavMenuOpen: false,
    };
  }
  componentDidMount() {
    window.addEventListener('keydown', this.handleFirstTab);
  }
  handleFirstTab(e) {
    if (e.keyCode === 9) { // tab (i.e. I'm using a keyboard)
      document.body.classList.add('user-is-tabbing');
      window.removeEventListener('keydown', this.handleFirstTab);
    }
  }
  toggleMobileNavMenu() {
    this.setState({mobileNavMenuOpen: !this.state.mobileNavMenuOpen});
  }
  render() {
    if (this.props.hidden && !this.props.mobileNavMenuOpen) {
      return null;
    }
    const logo = Sefaria.interfaceLang == "hebrew" ?
      <img src="/static/img/logo-hebrew.png" alt="Sefaria Logo"/> :
      <img src="/static/img/logo.svg" alt="Sefaria Logo"/>;

    const headerContent = (
      <>

        <div className="headerNavSection">
          { Sefaria._siteSettings.TORAH_SPECIFIC ?
          <a className="home" href="/" >{logo}</a> : null }
          <a href="/texts" className="textLink"><InterfaceText context="Header">Texts</InterfaceText></a>
          <a href="/topics" className="textLink"><InterfaceText>Topics</InterfaceText></a>
          <a href="/community" className="textLink"><InterfaceText>Community</InterfaceText></a>
          <DonateLink classes={"textLink donate"} source={"Header"}><InterfaceText>Donate</InterfaceText></DonateLink>
        </div>

        <div className="headerLinksSection">
        <Autocomplete
            onRefClick={this.props.onRefClick}
            showSearch={this.props.showSearch}
            openTopic={this.props.openTopic}
            openURL={this.props.openURL}
        />


          { Sefaria._uid ?
            <LoggedInButtons headerMode={this.props.headerMode}/>
            : <LoggedOutButtons headerMode={this.props.headerMode}/>
          }
          { !Sefaria._uid && Sefaria._siteSettings.TORAH_SPECIFIC ?
              <InterfaceLanguageMenu
                currentLang={Sefaria.interfaceLang}
                translationLanguagePreference={this.props.translationLanguagePreference}
                setTranslationLanguagePreference={this.props.setTranslationLanguagePreference} /> : null}
        </div>
      </>
    );

    const mobileHeaderContent = (
      <>
        <div>
          <button onClick={this.props.onMobileMenuButtonClick} aria-label={Sefaria._("Menu")} className="menuButton">
            <i className="fa fa-bars"></i>
          </button>
        </div>

        <div className="mobileHeaderCenter">
          { Sefaria._siteSettings.TORAH_SPECIFIC ?
          <a className="home" href="/texts" >{logo}</a> : null }
        </div>

        {this.props.hasLanguageToggle ?
        <div className={this.props.firstPanelLanguage + " mobileHeaderLanguageToggle"}>
          <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} />
        </div> :
        <div></div>}
      </>
    );

    const headerClasses = classNames({header: 1, mobile: !this.props.multiPanel});
    const headerInnerClasses = classNames({
      headerInner: 1,
      boxShadow: this.props.hasBoxShadow,
      mobile: !this.props.multiPanel
    });
    return (
      <div className={headerClasses} role="banner">
        <div className={headerInnerClasses}>
          {this.props.multiPanel ? headerContent : mobileHeaderContent}
        </div>

        {this.props.multiPanel ? null :
        <MobileNavMenu
          visible={this.props.mobileNavMenuOpen}
          onRefClick={this.props.onRefClick}
          showSearch={this.props.showSearch}
          openTopic={this.props.openTopic}
          openURL={this.props.openURL}
          close={this.props.onMobileMenuButtonClick} />
        }
        <GlobalWarningMessage />
      </div>
    );
  }
}
Header.propTypes = {
  multiPanel:   PropTypes.bool.isRequired,
  headerMode:   PropTypes.bool.isRequired,
  onRefClick:   PropTypes.func.isRequired,
  showSearch:   PropTypes.func.isRequired,
  openTopic:    PropTypes.func.isRequired,
  openURL:      PropTypes.func.isRequired,
  hasBoxShadow: PropTypes.bool.isRequired,
};

const LoggedOutButtons = ({mobile, loginOnly}) => {
  const [isClient, setIsClient] = useState(false);
  const [next, setNext] = useState("/");
  const [loginLink, setLoginLink] = useState("/login?next=/");
  const [registerLink, setRegisterLink] = useState("/register?next=/");
  useEffect(()=>{
    setIsClient(true);
  }, []);
  useEffect(()=> {
    if(isClient){
      setNext(encodeURIComponent(Sefaria.util.currentPath()));
      setLoginLink("/login?next="+next);
      setRegisterLink("/register?next="+next);
    }
  })
  const classes = classNames({accountLinks: !mobile, anon: !mobile});
  return (
    <div className={classes}>
      <a className="login loginLink" href={loginLink} key={`login${isClient}`}>
         {mobile ? <img src="/static/icons/login.svg" /> : null }
         <InterfaceText>Log in</InterfaceText>
       </a>
      {loginOnly ? null :
      <a className="login signupLink" href={registerLink} key={`register${isClient}`}>
         {mobile ? <img src="/static/icons/register.svg" /> : null }
         <InterfaceText>Sign up</InterfaceText>
      </a> }
      { Sefaria._siteSettings.TORAH_SPECIFIC ? <HelpButton /> : null}
    </div>
  );
}


const LoggedInButtons = ({headerMode}) => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    if(headerMode){
      setIsClient(true);
    }
  }, []);
  const unread = headerMode ? ((isClient && Sefaria.notificationCount > 0) ? 1 : 0) : Sefaria.notificationCount > 0 ? 1 : 0
  const notificationsClasses = classNames({notifications: 1, unread: unread});
  return (
    <div className="loggedIn accountLinks">
      <a href="/texts/saved" aria-label="See My Saved Texts">
        <img src="/static/icons/bookmarks.svg" alt={Sefaria._('Bookmarks')}/>
      </a>
      <a href="/notifications" aria-label="See New Notifications" key={`notificationCount-C-${unread}`} className={notificationsClasses}>
        <img src="/static/icons/notification.svg" alt={Sefaria._('Notifications')} />
      </a>
      { Sefaria._siteSettings.TORAH_SPECIFIC ? <HelpButton /> : null}
      <ProfilePicMenu len={24} url={Sefaria.profile_pic_url} name={Sefaria.full_name} key={`profile-${isClient}-${Sefaria.full_name}`}/>
    </div>
  );
}

const MobileNavMenu = ({onRefClick, showSearch, openTopic, openURL, close, visible}) => {
  const classes = classNames({
    mobileNavMenu: 1,
    closed: !visible,
  });
  return (
    <div className={classes}>
      <div className="searchLine">
        <Autocomplete
            onRefClick={onRefClick}
            showSearch={showSearch}
            openTopic={openTopic}
            openURL={openURL}
            onNavigate={close}
            hideHebrewKeyboard={true}
        />
      </div>
      <a href="/texts" onClick={close} className="textsPageLink">
        <img src="/static/icons/book.svg" />
        <InterfaceText context="Header">Texts</InterfaceText>
      </a>
      <a href="/topics" onClick={close}>
        <img src="/static/icons/topic.svg" />
        <InterfaceText>Topics</InterfaceText>
      </a>
      <a href="/community" onClick={close}>
        <img src="/static/icons/community.svg" />
        <InterfaceText>Community</InterfaceText>
      </a>
      <a href="/calendars" onClick={close}>
        <img src="/static/icons/calendar.svg" />
        <InterfaceText>Learning Schedules</InterfaceText>
      </a>
      <a href="/collections" onClick={close}>
        <img src="/static/icons/collection.svg"/>
        <InterfaceText>Collections</InterfaceText>
      </a>

      <DonateLink classes={"blue"} source="MobileNavMenu">
        <img src="/static/img/heart.png" alt="donation icon" />
        <InterfaceText>Donate</InterfaceText>
      </DonateLink>

      <div className="mobileAccountLinks">
        {Sefaria._uid ?
        <>
          <a href="/my/profile" onClick={close}>
            <ProfilePic len={22} url={Sefaria.profile_pic_url} name={Sefaria.full_name} />
            <InterfaceText>Profile</InterfaceText>
          </a>
          <a href="/texts/saved" onClick={close}>
            <img src="/static/icons/bookmarks.svg" alt={Sefaria._('Bookmarks')} />
            <InterfaceText>Saved & History</InterfaceText>
          </a>
          <a href="/notifications" onClick={close}>
            <img src="/static/icons/notification.svg" alt={Sefaria._('Notifications')} />
            <InterfaceText>Notifications</InterfaceText>
          </a>
        </> : null }

        <a href="/mobile-about-menu">
          <img src="/static/icons/info.svg" />
          <InterfaceText>About Sefaria</InterfaceText>
        </a>

        {Sefaria._uid ?
        <>
          <a href="/settings/account">
          <img src="/static/icons/settings.svg" />
          <InterfaceText>Account Settings</InterfaceText>
        </a>
        </> : null }

        <MobileInterfaceLanguageToggle />

        <a href="/products">
          <img src="/static/icons/products.svg" />
          <InterfaceText text={{en: "Products", he: "מוצרים"}} />
        </a>


        <a href="/help">
          <img src="/static/icons/help.svg" />
          <InterfaceText>Get Help</InterfaceText>
        </a>

        {Sefaria._uid ?
        <a href="/logout" className="logout">
          <img src="/static/icons/logout.svg" />
          <InterfaceText>Logout</InterfaceText>
        </a>
        :
        <LoggedOutButtons mobile={true} loginOnly={true}/> }

      </div>
    </div>
  );
};


const ProfilePicMenu = ({len, url, name}) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  const menuClick = (e) => {
    var el = e.target;
    while (el && el.nodeName !== 'A') {
      el = el.parentNode;
    }
    if (el) {
      resetOpen();
    }
  };
  const profilePicClick = (e) => {
    e.preventDefault();
    resetOpen();
  };
  const resetOpen = () => {
    setIsOpen(isOpen => !isOpen);
  };
  const handleHideDropdown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };
  const handleClickOutside = (event) => {
    if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target)
    ) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleHideDropdown, true);
    document.addEventListener('click', handleClickOutside, true);
    return () => {
      document.removeEventListener('keydown', handleHideDropdown, true);
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, []);
  const getCurrentPage = () => {
    return encodeURIComponent(Sefaria.util.currentPath());
  };
  return (
    <div className="myProfileBox" ref={wrapperRef}>
        <a href="/my/profile" className="my-profile" onClick={profilePicClick}>
          <ProfilePic len={len} url={url} name={name}/>
        </a>
        <div className="interfaceLinks">
          {isOpen ?
          <div className="interfaceLinks-menu profile-menu" onClick={menuClick}>
            <div className="interfaceLinks-header profile-menu">{name}</div>
            <div className="profile-menu-middle">
              <div><a className="interfaceLinks-row" id="my-profile-link" href="/my/profile">
                <InterfaceText>Profile</InterfaceText>
              </a></div>
              <div><a className="interfaceLinks-row" id="new-sheet-link" href="/sheets/new">
                <InterfaceText>Create a New Sheet</InterfaceText>
              </a></div>
              <div><a className="interfaceLinks-row" id="account-settings-link" href="/settings/account">
                <InterfaceText>Account Settings</InterfaceText>
              </a></div>
              <div className="interfaceLinks-row languages">
                <a className={`${(Sefaria.interfaceLang == 'hebrew') ? 'active':''}`} href={`/interface/hebrew?next=${getCurrentPage()}`} id="select-hebrew-interface-link">עברית</a>
                <a className={`${(Sefaria.interfaceLang == 'english') ? 'active':''}`} href={`/interface/english?next=${getCurrentPage()}`} id="select-english-interface-link">English</a>
              </div>
              <div><a className="interfaceLinks-row bottom" id="help-link" href="/help">
                <InterfaceText>Help</InterfaceText>
              </a></div>
            </div>
            <hr className="interfaceLinks-hr"/>
            <div><a className="interfaceLinks-row logout" id="logout-link" href="/logout">
              <InterfaceText>Logout</InterfaceText>
            </a></div>
          </div> : null}
        </div>
    </div>
  );
};


const MobileInterfaceLanguageToggle = () => {
  const currentURL = encodeURIComponent(Sefaria.util.currentPath());

  const links = Sefaria.interfaceLang == "hebrew" ?
    <>
      <a href={"/interface/hebrew?next=" + currentURL} className="int-he">עברית</a>
      <span className="separator">•</span>
      <a href={"/interface/english?next=" + currentURL} className="int-en inactive">English</a>
    </>
    :
    <>
      <a href={"/interface/english?next=" + currentURL} className="int-en">English</a>
      <span className="separator">•</span>
      <a href={"/interface/hebrew?next=" + currentURL} className="int-he inactive">עברית</a>
    </>;

  return (
    <div className="mobileInterfaceLanguageToggle">
      <img src="/static/icons/globe-wire.svg" />
      {links}
    </div>
  );
};


const HelpButton = () => {
  const url = Sefaria._v({he: "/collections/%D7%A9%D7%90%D7%9C%D7%95%D7%AA-%D7%A0%D7%A4%D7%95%D7%A6%D7%95%D7%AA-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90", en:"/collections/sefaria-faqs"});
  return (
    <div className="help">
      <a href={url}>
        <img src="/static/img/help.svg" alt={Sefaria._("Help")}/>
      </a>
    </div>
  );
};


export default Header;
