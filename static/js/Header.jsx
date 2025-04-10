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
  InterfaceLanguageMenu,
  InterfaceText,
  LanguageToggleButton,
  DonateLink
} from './Misc';
import {ProfilePic} from "./ProfilePic";
import {HeaderAutocomplete} from './HeaderAutocomplete'
import { DropdownMenu, DropdownMenuSeparator, DropdownMenuItem, DropdownMenuItemLink, DropdownMenuItemWithIcon, DropdownMenuItemWithCallback } from './common/DropdownMenu';
import Button from './common/Button';


const LoggedOutDropdown = ({module}) => {
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

  const getCurrentPage = () => {
    return encodeURIComponent(Sefaria.util.currentPath());
  }
  return (
      <DropdownMenu positioningClass="headerDropdownMenu" buttonComponent={<img src='/static/icons/logged_out.svg'/>}>
          <div className='dropdownLinks-options'>
              <DropdownMenuItemLink url={loginLink}>
                  <InterfaceText text={{'en': 'Log in', 'he': 'התחברות'}}/>
              </DropdownMenuItemLink>
              <DropdownMenuItemLink url={registerLink}>
                  <InterfaceText text={{'en': 'Sign up', 'he': 'להרשמה'}}/>
              </DropdownMenuItemLink>
              <DropdownMenuSeparator/>
              <div className="languageHeader">
                  <InterfaceText>Site Language</InterfaceText>
              </div>
              <div className='languageToggleFlexContainer'>
                <span className='englishLanguageButton'>
                  <DropdownMenuItemLink url={`/interface/english?next=${getCurrentPage()}`}>
                    English
                  </DropdownMenuItemLink>
                </span>
                  <DropdownMenuItemLink url={`/interface/hebrew?next=${getCurrentPage()}`}>
                      עברית
                  </DropdownMenuItemLink>
              </div>
              <DropdownMenuSeparator/>
              { module === 'library' &&
                <DropdownMenuItemLink url={'/updates'}>
                    <InterfaceText text={{'en': 'New Additions', 'he': 'חידושים בארון הספרים של ספריא'}}/>
                </DropdownMenuItemLink>
              }
              <DropdownMenuItemLink url={'/help'}>
                  <InterfaceText text={{'en': 'Help', 'he': 'עזרה'}}/>
              </DropdownMenuItemLink>
          </div>
      </DropdownMenu>
);
}


const LoggedInDropdown = ({module}) => {

  const getCurrentPage = () => {
    return encodeURIComponent(Sefaria.util.currentPath());
  }

  return (
      <DropdownMenu positioningClass="headerDropdownMenu" 
                    buttonComponent={<ProfilePic url={Sefaria.profile_pic_url}
                                                 name={Sefaria.full_name}
                                                 len={25}/>}>
          <div className='dropdownLinks-options'>
              { module === 'library' && 
                <DropdownMenuItem preventClose={true}>
                    <strong>{Sefaria.full_name}</strong>
                </DropdownMenuItem>
              }
               { module === 'sheets' && 
                <DropdownMenuItemLink url={'/my/profile'} preventClose={true}>
                    <strong>{Sefaria.full_name}</strong>
                </DropdownMenuItemLink>
              }
              <DropdownMenuSeparator/>

              { module === 'library' && 
                <>
                <DropdownMenuItemLink url={'/settings/account'}>
                    <InterfaceText>Account Settings</InterfaceText>
                </DropdownMenuItemLink>
                <DropdownMenuItemLink url={'/torahtracker'}>
                    <InterfaceText text={{'en': 'Torah Tracker', 'he': 'לימוד במספרים'}}/>
                </DropdownMenuItemLink>
                </> 
              }


              { module === 'sheets' && 
                <>
                <DropdownMenuItemLink url={'/my/profile'}>
                    <InterfaceText>Profile</InterfaceText>
                </DropdownMenuItemLink>
                <DropdownMenuItemLink url={'/sheets/saved'}>
                  <InterfaceText>Saved</InterfaceText>
                </DropdownMenuItemLink>
                <DropdownMenuItemLink url={'/sheets/history'}>
                  <InterfaceText>History</InterfaceText>
                </DropdownMenuItemLink>
                <DropdownMenuItemLink url={'/settings/account'}>
                    <InterfaceText>Account Settings</InterfaceText>
                </DropdownMenuItemLink>
                </> 
              }
              
              <DropdownMenuSeparator/>
              <div className="languageHeader">
                  <InterfaceText>Site Language</InterfaceText>
              </div>
              <div className='languageToggleFlexContainer'>
                  <DropdownMenuItemLink url={`/interface/english?next=${getCurrentPage()}`}>
                      English
                  </DropdownMenuItemLink>
                  <span className="languageDot">&#183;</span>
                  <DropdownMenuItemLink url={`/interface/hebrew?next=${getCurrentPage()}`}>
                      עברית
                  </DropdownMenuItemLink>
              </div>
              <DropdownMenuSeparator/>
              
              { module === 'library' && 
                <DropdownMenuItemLink url={'/updates'}>
                    <InterfaceText text={{'en': 'New Additions', 'he': 'חידושים בארון הספרים של ספריא'}}/>
                </DropdownMenuItemLink>
              }

              <DropdownMenuItemLink preventClose={true} url={'/help'}>
                  <InterfaceText text={{'en': 'Help', 'he': 'עזרה'}}/>
              </DropdownMenuItemLink>
              <DropdownMenuSeparator/>
              <DropdownMenuItemLink url={'/logout'}>
                  <InterfaceText text={{'en': 'Log Out', 'he': 'ניתוק'}}/>
              </DropdownMenuItemLink>
          </div>
      </DropdownMenu>
);
}


const ModuleSwitcher = () => {
  return (
      <DropdownMenu positioningClass="headerDropdownMenu" buttonComponent={<img src='/static/icons/module_switcher_icon.svg'/>}>
          <div className='dropdownLinks-options'>
              <DropdownMenuItemLink url={'/'} newTab={true}>
                  <DropdownMenuItemWithIcon icon={'/static/icons/library_icon.svg'} textEn={'Library'}
                                            textHe={'ספריה'}/>
              </DropdownMenuItemLink>
              <DropdownMenuSeparator/>
              <DropdownMenuItemLink url={'/sheets'} newTab={true}>
                  <DropdownMenuItemWithIcon icon={'/static/icons/sheets_icon.svg'} textEn={'Sheets'} textHe={'דפים'}/>
              </DropdownMenuItemLink>
              <DropdownMenuSeparator/>
              <DropdownMenuItemLink url={'https://developers.sefaria.org'} newTab={true}>
                  <DropdownMenuItemWithIcon icon={'/static/icons/developers_icon.svg'} textEn={'Developers'}
                                            textHe={'מפתחים'}/>
              </DropdownMenuItemLink>
              <DropdownMenuSeparator/>
              <DropdownMenuItemLink url={'/products'} newTab={true}>
                  <InterfaceText text={{'he': 'לכל המוצרים שלנו', 'en': 'See all products ›'}}/>
              </DropdownMenuItemLink>
          </div>
      </DropdownMenu>
);
}
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
    const short_lang = Sefaria.interfaceLang.slice(0,2);

    const libraryLogoPath = Sefaria.interfaceLang === "hebrew"  ? "logo-hebrew.png" : "logo.svg";
    const libraryLogo = (
      <img src={`/static/img/${libraryLogoPath}`} alt="Sefaria Logo"/>
    );

    const sheetsLogoPath = `/static/img/${short_lang}_sheets_logo.svg`;
    const sheetsLogo = (
      <img src={sheetsLogoPath} alt="Sefaria Sheets Logo"/>
    );

    const logo = this.props.module === "library" ? libraryLogo : sheetsLogo;

      const librarySavedIcon = <div className='librarySavedIcon'>
                                  <a href="/texts/saved" >
                                    <img src='/static/icons/bookmarks.svg' alt='Saved items' />
                                  </a>
                                </div>;
      const sheetsNotificationsIcon = <div className='sheetsNotificationsHeaderIcon'>
                                        <a href="/sheets/notifications" >
                                          <img src='/static/icons/notification.svg' />
                                        </a>
                                      </div>;

    const headerContent = (
      <>

        <div className="headerNavSection">
          { Sefaria._siteSettings.TORAH_SPECIFIC && logo }
          <a href={this.props.module === 'library' ? '/texts' : '/sheets/topics'} className="textLink"><InterfaceText context="Header">{this.props.module === 'library' ? 'Texts' : 'Topics'}</InterfaceText></a>
          <a href={this.props.module === 'library' ? '/topics' : '/sheets/collections'} className="textLink"><InterfaceText>{this.props.module === 'library' ? 'Topics' : 'Collections'}</InterfaceText></a>
          <DonateLink classes={"textLink donate"} source={"Header"}><InterfaceText>Donate</InterfaceText></DonateLink>
        </div>

        <div className="headerLinksSection">
        <HeaderAutocomplete
            onRefClick={this.props.onRefClick}
            showSearch={this.props.showSearch}
            openTopic={this.props.openTopic}
            openURL={this.props.openURL}
        />


        { Sefaria._siteSettings.TORAH_SPECIFIC && <HelpButton />}

        {this.props.module === "sheets" && <CreateButton />}

        { !Sefaria._uid && Sefaria._siteSettings.TORAH_SPECIFIC ?
              <InterfaceLanguageMenu
                currentLang={Sefaria.interfaceLang}
                translationLanguagePreference={this.props.translationLanguagePreference}
                setTranslationLanguagePreference={this.props.setTranslationLanguagePreference} /> : null}

        { Sefaria._uid && (this.props.module ==="library" ? librarySavedIcon : sheetsNotificationsIcon) }

          <ModuleSwitcher />

          { Sefaria._uid ?
            <LoggedInDropdown module={this.props.module}/>
            : <LoggedOutDropdown module={this.props.module}/>
          }

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
          { Sefaria._siteSettings.TORAH_SPECIFIC && logo }
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
          close={this.props.onMobileMenuButtonClick}
          module={this.props.module} />
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
  module:       PropTypes.string.isRequired,
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
      { loginOnly && (
      <a className="login loginLink" href={loginLink} key={`login${isClient}`}>
         {mobile ? <img src="/static/icons/login.svg" /> : null }
         <InterfaceText>Log in</InterfaceText>
       </a>)}
      {loginOnly ? null :
      <span>
        <a className="login signupLink" href={registerLink} key={`register${isClient}`}>
          {mobile ? <img src="/static/icons/login.svg" /> : null }
          <InterfaceText>Sign up</InterfaceText>
        </a> 
        <a className="login loginLink" href={loginLink} key={`login${isClient}`}>
          <InterfaceText>Log in</InterfaceText>
        </a>
      </span>}

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

const MobileNavMenu = ({onRefClick, showSearch, openTopic, openURL, close, visible, module}) => {
  const classes = classNames({
    mobileNavMenu: 1,
    closed: !visible,
  });
  return (
    <div className={classes}>
      <div className="searchLine">
        <HeaderAutocomplete
            onRefClick={onRefClick}
            showSearch={showSearch}
            openTopic={openTopic}
            openURL={openURL}
            onNavigate={close}
            hideHebrewKeyboard={true}
        />
      </div>
      {module === "library" && 
      <a href="/texts" onClick={close} className="textsPageLink">
        <img src="/static/icons/book.svg" />
        <InterfaceText context="Header">Texts</InterfaceText>
      </a>
      }
      <a href={module === "library" ? "/topics" : "/sheets/topics"} onClick={close}>
        <img src="/static/icons/topic.svg" />
        <InterfaceText context="Header">Explore</InterfaceText>
      </a>
      {module === "sheets" && 
      <a href="/sheets/collections" onClick={close} className="textsPageLink">
        <img src="/static/icons/collection.svg" />
        <InterfaceText context="Header">Collections</InterfaceText>
      </a>
      }

      {module === "sheets" && 
      <a href="/sheets/collections" onClick={close} className="textsPageLink">
        <img src="/static/icons/collection.svg" />
        <InterfaceText context="Header">Collections</InterfaceText>
      </a>
      }

     { module === "library" && 
      <a href="/calendars" onClick={close}>
        <img src="/static/icons/calendar.svg" />
        <InterfaceText>Learning Schedules</InterfaceText>
      </a>
    }

      <DonateLink classes={"blue"} source="MobileNavMenu">
        <img src="/static/img/heart.png" alt="donation icon" />
        <InterfaceText>Donate</InterfaceText>
      </DonateLink>

      <div className="mobileAccountLinks">

      {Sefaria._uid && module === "sheets"?
        <>
          <a href="/my/profile" onClick={close}>
          <div className="mobileProfileFlexContainer">
            <ProfilePic url={Sefaria.profile_pic_url} name={Sefaria.full_name} len={25}/>
            <InterfaceText>Profile</InterfaceText>
          </div>
          </a>
        </> : null }

        {Sefaria._uid ?
        <>
          <a href={module === "library" ? "/texts/saved" : "/sheets/saved" } onClick={close}>
            <img src="/static/icons/bookmarks.svg" alt={Sefaria._('Bookmarks')} />
            {module === "library" && <InterfaceText text={{en: "Saved, History & Notes", he: "שמורים, היסטוריה והערות"}} />}
            {module === "sheets" && <InterfaceText text={{en: "Saved & History", he: "שמורים והיסטוריה"}} />}
          </a>
        </> : null }

        {Sefaria._uid && module === "sheets" ?
          <>
            <a href="/sheets/notifications">
            <img src="/static/icons/notification.svg" />
            <InterfaceText>Notifications</InterfaceText>
          </a>
          </> : null 
        }

        {Sefaria._uid ?
          <>
            <a href="/settings/account">
            <img src="/static/icons/settings.svg" />
            <InterfaceText>Account Settings</InterfaceText>
          </a>
          </> : null 
        }

        <MobileInterfaceLanguageToggle />

        <hr/>

        <a href="/help">
          <img src="/static/icons/help.svg" />
          <InterfaceText>Get Help</InterfaceText>
        </a>

        <a href="/mobile-about-menu">
          <img src="/static/icons/info.svg" />
          <InterfaceText>About Sefaria</InterfaceText>
        </a>

        <hr />
        
        { module === "library" &&
        <a href="/sheets/" target="_blank">
          <img src="/static/icons/sheets-mobile-icon.svg" />
          <InterfaceText>Sheets</InterfaceText>
        </a>
        } 

      { module === "sheets" &&
        <a href="/texts" target="_blank">
          <img src="/static/icons/book.svg" />
          <InterfaceText text={{en: "Sefaria Library", he: "ספריית ספריא"}} />
        </a>
        } 

        <a href="developers.sefaria.org" target="_blank">
          <img src="/static/icons/dev-portal-mobile-icon.svg" />
          <InterfaceText text={{en: "Developers", he: "מפתחים"}} />
        </a>

        <a href="sefaria.org/products" target="_blank">
          <img src="/static/icons/products-icon.svg" />
          <InterfaceText text={{en: "All Products", he: "מוצרים"}} />
        </a>

        <hr />

        {Sefaria._uid ?
        <a href="/logout" className="logout">
          <img src="/static/icons/logout.svg" />
          <InterfaceText>Logout</InterfaceText>
        </a>
        :
        <LoggedOutButtons mobile={true} loginOnly={false}/> }

        <hr />
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

const CreateButton = () => {
  return (
    <Button variant={"secondary"} onClick={() => window.location.href="/sheets/new"}>
      {/* Hebrew is a placeholder */}
      <InterfaceText text={{'en': 'Create', 'he': 'דף חדש'}} /> 
    </Button>
  );
};


export default Header;
