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
  getCurrentPage,
  LanguageToggleButton,
  DonateLink,
  useOnceFullyVisible
} from './Misc';
import {ProfilePic} from "./ProfilePic";
import {HeaderAutocomplete} from './HeaderAutocomplete'
import { DropdownMenu, DropdownMenuSeparator, DropdownMenuItem, DropdownMenuItemWithIcon, DropdownLanguageToggle } from './common/DropdownMenu';
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
  
  return (
      <DropdownMenu positioningClass="headerDropdownMenu" buttonComponent={<img src='/static/icons/logged_out.svg'/>}>
          <div className='dropdownLinks-options'>
              <DropdownMenuItem url={loginLink}>
                  <InterfaceText text={{'en': 'Log in', 'he': 'התחברות'}}/>
              </DropdownMenuItem>
              <DropdownMenuItem url={registerLink}>
                  <InterfaceText text={{'en': 'Sign up', 'he': 'להרשמה'}}/>
              </DropdownMenuItem>
              <DropdownMenuSeparator/>
              <DropdownLanguageToggle/>
              <DropdownMenuSeparator/>
              { module === Sefaria.LIBRARY_MODULE &&
                <DropdownMenuItem url={'/updates'}>
                    <InterfaceText text={{'en': 'New Additions', 'he': 'חידושים בארון הספרים של ספריא'}}/>
                </DropdownMenuItem>
              }
              <DropdownMenuItem url={'/help'}>
                  <InterfaceText text={{'en': 'Help', 'he': 'עזרה'}}/>
              </DropdownMenuItem>
          </div>
      </DropdownMenu>
);
}

const LoggedInDropdown = ({module}) => {
  return (
      <DropdownMenu positioningClass="headerDropdownMenu" 
                    buttonComponent={<ProfilePic url={Sefaria.profile_pic_url}
                                                 name={Sefaria.full_name}
                                                 len={25}/>}>
          <div className='dropdownLinks-options'>
              { module === Sefaria.LIBRARY_MODULE && 
                <DropdownMenuItem preventClose={true}>
                    <strong>{Sefaria.full_name}</strong>
                </DropdownMenuItem>
              }
               { module === Sefaria.SHEETS_MODULE && 
                <DropdownMenuItem url={`/profile/${Sefaria.slug}`} preventClose={true} targetModule={Sefaria.SHEETS_MODULE}>
                    <strong>{Sefaria.full_name}</strong>
                </DropdownMenuItem>
              }
              <DropdownMenuSeparator/>

              { module === Sefaria.LIBRARY_MODULE && 
                <>
                <DropdownMenuItem url={'/settings/account'} targetModule={Sefaria.LIBRARY_MODULE}>
                    <InterfaceText>Account Settings</InterfaceText>
                </DropdownMenuItem>
                <DropdownMenuItem url={'/torahtracker'}>
                    <InterfaceText text={{'en': 'Torah Tracker', 'he': 'לימוד במספרים'}}/>
                </DropdownMenuItem>
                </> 
              }


              { module === Sefaria.SHEETS_MODULE && 
                <>
                <DropdownMenuItem url={`/profile/${Sefaria.slug}`} targetModule={Sefaria.SHEETS_MODULE}>
                    <InterfaceText>Profile</InterfaceText>
                </DropdownMenuItem>
                <DropdownMenuItem url={'/saved'} targetModule={Sefaria.SHEETS_MODULE}>
                  <InterfaceText>Saved</InterfaceText>
                </DropdownMenuItem>
                <DropdownMenuItem url={'/history'} targetModule={Sefaria.SHEETS_MODULE}>
                  <InterfaceText>History</InterfaceText>
                </DropdownMenuItem>
                <DropdownMenuItem url={'/settings/account'} targetModule={Sefaria.LIBRARY_MODULE}>
                    <InterfaceText>Account Settings</InterfaceText>
                </DropdownMenuItem>
                </> 
              }
              
              <DropdownMenuSeparator/>
              <DropdownLanguageToggle/>
              <DropdownMenuSeparator/>
              
              { module === Sefaria.LIBRARY_MODULE && 
                <DropdownMenuItem url={'/updates'}>
                    <InterfaceText text={{'en': 'New Additions', 'he': 'חידושים בארון הספרים של ספריא'}}/>
                </DropdownMenuItem>
              }

              <DropdownMenuItem preventClose={true} url={'/help'}>
                  <InterfaceText text={{'en': 'Help', 'he': 'עזרה'}}/>
              </DropdownMenuItem>
              <DropdownMenuSeparator/>
              <DropdownMenuItem url={Sefaria.getLogoutUrl()}>
                  <InterfaceText text={{'en': 'Log Out', 'he': 'ניתוק'}}/>
              </DropdownMenuItem>
          </div>
      </DropdownMenu>
);
}

const ModuleSwitcher = () => {
  return (
      <DropdownMenu positioningClass="headerDropdownMenu" buttonComponent={<img src='/static/icons/module_switcher_icon.svg'/>}>
          <div className='dropdownLinks-options'>
              <DropdownMenuItem url={"/"} newTab={Sefaria.activeModule !== Sefaria.LIBRARY_MODULE} targetModule={Sefaria.LIBRARY_MODULE}>
                  <DropdownMenuItemWithIcon icon={'/static/icons/library_icon.svg'} textEn={"Library"}/>
              </DropdownMenuItem>
              <DropdownMenuSeparator/>
              <DropdownMenuItem url={"/sheets"} newTab={Sefaria.activeModule !== Sefaria.SHEETS_MODULE} targetModule={Sefaria.SHEETS_MODULE}>  
                  <DropdownMenuItemWithIcon icon={'/static/icons/sheets_icon.svg'} textEn={'Sheets'}/>
              </DropdownMenuItem>
              <DropdownMenuSeparator/>
              <DropdownMenuItem url={'https://developers.sefaria.org'} newTab={true}>
                  <DropdownMenuItemWithIcon icon={'/static/icons/developers_icon.svg'} textEn={'Developers'}/>
              </DropdownMenuItem>
              <DropdownMenuSeparator/>
              <DropdownMenuItem url={'/products'} newTab={true}>
                <InterfaceText text={{'he': 'לכל המוצרים שלנו', 'en': 'See all products ›'}}/>
              </DropdownMenuItem>
          </div>
      </DropdownMenu>
);
}

const Header = (props) => {

  useEffect(() => {
    const handleFirstTab = (e) => {
      if (e.keyCode === 9) { // tab (i.e. I'm using a keyboard)
        document.body.classList.add('user-is-tabbing');
        window.removeEventListener('keydown', handleFirstTab);
      }
    }

    window.addEventListener('keydown', handleFirstTab);

    return () => {
      window.removeEventListener('keydown', handleFirstTab);
    }
  }, []);
  const short_lang = Sefaria._getShortInterfaceLang();

  const libraryLogoPath = Sefaria.interfaceLang === "hebrew"  ? "logo-hebrew.png" : "logo.svg";
  const libraryLogo = (
    <img src={`/static/img/${libraryLogoPath}`} className="home" alt="Sefaria Logo"/>
  );

  const sheetsLogoPath = `/static/img/${short_lang}_sheets_logo.svg`;
  const sheetsLogo = (
    <img src={sheetsLogoPath} alt="Sefaria Sheets Logo" className="home"/>
  );

  const logo = props.module === Sefaria.LIBRARY_MODULE ? libraryLogo : sheetsLogo;

      const librarySavedIcon = <div className='librarySavedIcon'>
                                  <a href="/texts/saved" data-target-module={Sefaria.LIBRARY_MODULE}>
                                    <img src='/static/icons/bookmarks.svg' alt='Saved items' />
                                  </a>
                                </div>;
  const sheetsNotificationsIcon = <div className='sheetsNotificationsHeaderIcon'>
                                        <a href="/notifications" data-target-module={Sefaria.SHEETS_MODULE}>
                                          <img src='/static/icons/notification.svg' />
                                        </a>
                                      </div>;

  const headerRef = useOnceFullyVisible(() => {
    sa_event("header_viewed", { impression_type: "regular_header" });
    gtag("event", "header_viewed", { impression_type: "regular_header" });
    if (Sefaria._debug) console.log("sa: we got a view event! (regular header)");
  }, "sa.header_viewed");

  if (props.hidden && !props.mobileNavMenuOpen) {
    return null;
  }
  
  const headerContent = (
    <>
        <div className="headerNavSection">
          { Sefaria._siteSettings.TORAH_SPECIFIC && logo }
          {props.module === Sefaria.LIBRARY_MODULE && 
          <>
            <a href="/texts" className="textLink">
              <InterfaceText context="Header">Texts</InterfaceText>
            </a>
            <a href="/topics" className="textLink">
              <InterfaceText context="Header">Topics</InterfaceText>
            </a>
          </>
          }
          {props.module === Sefaria.SHEETS_MODULE && 
          <>
            <a href="/topics" data-target-module={Sefaria.SHEETS_MODULE} className="textLink">
              <InterfaceText context="Header">Topics</InterfaceText>
            </a>
            <a href="/collections" data-target-module={Sefaria.SHEETS_MODULE} className="textLink">
              <InterfaceText context="Header">Collections</InterfaceText>
            </a>
          </>
          }
          <DonateLink classes={"textLink donate"} source={"Header"}><InterfaceText>Donate</InterfaceText></DonateLink>
        </div>

      <div className="headerLinksSection">
      <HeaderAutocomplete
          onRefClick={props.onRefClick}
          showSearch={props.showSearch}
          openTopic={props.openTopic}
          openURL={props.openURL}
      />

        {!Sefaria._uid && props.module === Sefaria.LIBRARY_MODULE && <SignUpButton/>}
        {props.module === Sefaria.SHEETS_MODULE && <CreateButton />}
        { Sefaria._siteSettings.TORAH_SPECIFIC && <HelpButton />}

        { !Sefaria._uid && Sefaria._siteSettings.TORAH_SPECIFIC ?
              <InterfaceLanguageMenu
                currentLang={Sefaria.interfaceLang}
                translationLanguagePreference={props.translationLanguagePreference}
                setTranslationLanguagePreference={props.setTranslationLanguagePreference} /> : null}

        { Sefaria._uid && (props.module ===Sefaria.LIBRARY_MODULE ? librarySavedIcon : sheetsNotificationsIcon) }

          <ModuleSwitcher />

          { Sefaria._uid ?
            <LoggedInDropdown module={props.module}/>
            : <LoggedOutDropdown module={props.module}/>
          }

        </div>
      </>
    );

    const mobileHeaderContent = (
      <>
        <div>
          <button onClick={props.onMobileMenuButtonClick} aria-label={Sefaria._("Menu")} className="menuButton">
            <i className="fa fa-bars"></i>
          </button>
        </div>

        <div className="mobileHeaderCenter">
          { Sefaria._siteSettings.TORAH_SPECIFIC && logo }
        </div>

        {props.hasLanguageToggle ?
        <div className={props.firstPanelLanguage + " mobileHeaderLanguageToggle"}>
          <LanguageToggleButton toggleLanguage={props.toggleLanguage} />
        </div> :
        <div></div>}
      </>
    );

    const headerClasses = classNames({header: 1, mobile: !props.multiPanel});
    const headerInnerClasses = classNames({
      headerInner: 1,
      boxShadow: props.hasBoxShadow,
      mobile: !props.multiPanel
    });
    return (
      <div className={headerClasses} role="banner" ref={headerRef}>
        <div className={headerInnerClasses}>
          {props.multiPanel ? headerContent : mobileHeaderContent}
        </div>

        {props.multiPanel ? null :
        <MobileNavMenu
          visible={props.mobileNavMenuOpen}
          onRefClick={props.onRefClick}
          showSearch={props.showSearch}
          openTopic={props.openTopic}
          openURL={props.openURL}
          close={props.onMobileMenuButtonClick}
          module={props.module} />
        }
        <GlobalWarningMessage />
      </div>
    );
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
      {module === Sefaria.LIBRARY_MODULE && 
      <>
        <a href="/texts" onClick={close} className="textsPageLink">
          <img src="/static/icons/book.svg" />
          <InterfaceText context="Header">Texts</InterfaceText>
        </a>
        <a href={"/topics"} onClick={close}>
          <img src="/static/icons/topic.svg" />
          <InterfaceText context="Header">Explore</InterfaceText>
        </a>
        <a href="/calendars" onClick={close}>
          <img src="/static/icons/calendar.svg" />
          <InterfaceText>Learning Schedules</InterfaceText>
        </a>
      </>  
      }
      {module === Sefaria.SHEETS_MODULE && 
      <>
        <a href="/topics" data-target-module={Sefaria.SHEETS_MODULE} onClick={close}>
        <img src="/static/icons/topic.svg" />
        <InterfaceText context="Header">Topics</InterfaceText>
        </a>
        <a href="/collections" onClick={close} className="textsPageLink" data-target-module={Sefaria.SHEETS_MODULE}>
        <img src="/static/icons/collection.svg" />
        <InterfaceText context="Header">Collections</InterfaceText>
      </a>
      </>
      }


      <DonateLink classes={"blue"} source="MobileNavMenu">
        <img src="/static/img/heart.png" alt="donation icon" />
        <InterfaceText>Donate</InterfaceText>
      </DonateLink>

      <div className="mobileAccountLinks">

        {Sefaria._uid &&
        <>
          {module === Sefaria.LIBRARY_MODULE && 
          <>
            <a href="/texts/saved" onClick={close} data-target-module={Sefaria.LIBRARY_MODULE}>
            <img src="/static/icons/bookmarks.svg" alt={Sefaria._('Bookmarks')} />
            {<InterfaceText text={{en: "Saved, History & Notes", he: "שמורים, היסטוריה והערות"}} />}
          </a>
          </>}
          {module === Sefaria.SHEETS_MODULE && 
          <>
           <a href={`/profile/${Sefaria.slug}`} onClick={close} data-target-module={Sefaria.SHEETS_MODULE}>
            <div className="mobileProfileFlexContainer">
              <ProfilePic url={Sefaria.profile_pic_url} name={Sefaria.full_name} len={25}/>
              <InterfaceText>Profile</InterfaceText>
            </div>
            </a>
            <a href="/saved" onClick={close} data-target-module={Sefaria.SHEETS_MODULE}>
            <img src="/static/icons/bookmarks.svg" alt={Sefaria._('Bookmarks')} />
            {<InterfaceText text={{en: "Saved & History", he: "שמורים והיסטוריה"}} />}
            <a href="/notifications" data-target-module={Sefaria.SHEETS_MODULE}>
            <img src="/static/icons/notification.svg" />
            <InterfaceText>Notifications</InterfaceText>
            </a>
          </a>
          </>}
        </>}

        {Sefaria._uid &&
          <>
            <a href="/settings/account" data-target-module={Sefaria.LIBRARY_MODULE}>
            <img src="/static/icons/settings.svg" />
            <InterfaceText>Account Settings</InterfaceText>
          </a>
          </>
        }

        <MobileInterfaceLanguageToggle />

        <hr/>

        <a href={Sefaria._v({
          he: Sefaria._siteSettings.HELP_CENTER_URLS.HE, 
          en: Sefaria._siteSettings.HELP_CENTER_URLS.EN_US
        })} target="_blank">
          <img src="/static/icons/help.svg" />
          <InterfaceText>Get Help</InterfaceText>
        </a>

        <a href="/mobile-about-menu">
          <img src="/static/icons/info.svg" />
          <InterfaceText>About Sefaria</InterfaceText>
        </a>

        <hr />
        
        { module === Sefaria.LIBRARY_MODULE &&
        <a href="/sheets/" data-target-module={Sefaria.SHEETS_MODULE}>
          <img src="/static/icons/sheets-mobile-icon.svg" />
          <InterfaceText>Sheets</InterfaceText>
        </a>
        } 

      { module === Sefaria.SHEETS_MODULE &&
        <a href="/texts" data-target-module={Sefaria.LIBRARY_MODULE}>
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
        <a href={Sefaria.getLogoutUrl()} className="logout">
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
  return (
    <div className="myProfileBox" ref={wrapperRef}>
        <a href={`/profile/${Sefaria.slug}`} className="my-profile" onClick={profilePicClick} data-target-module={Sefaria.SHEETS_MODULE}>
          <ProfilePic len={len} url={url} name={name}/>
        </a>
        <div className="interfaceLinks">
          {isOpen ?
          <div className="interfaceLinks-menu profile-menu" onClick={menuClick}>
            <div className="interfaceLinks-header profile-menu">{name}</div>
            <div className="profile-menu-middle">
              <div><a className="interfaceLinks-row" id="my-profile-link" href={`/profile/${Sefaria.slug}`} data-target-module={Sefaria.SHEETS_MODULE}>
                <InterfaceText>Profile</InterfaceText>
              </a></div>
              <div><a className="interfaceLinks-row" id="new-sheet-link" href="/sheets/new" data-target-module={Sefaria.SHEETS_MODULE}>
                <InterfaceText>Create a New Sheet</InterfaceText>
              </a></div>
              <div><a className="interfaceLinks-row" id="account-settings-link" href="/settings/account" data-target-module={Sefaria.LIBRARY_MODULE}>
                <InterfaceText>Account Settings</InterfaceText>
              </a></div>
              <div className="interfaceLinks-row languages">
                <a className={`${(Sefaria.interfaceLang == 'hebrew') ? 'active':''}`} href={`/interface/hebrew?next=${getCurrentPage()}`} id="select-hebrew-interface-link">עברית</a>
                <a className={`${(Sefaria.interfaceLang == 'english') ? 'active':''}`} href={`/interface/english?next=${getCurrentPage()}`} id="select-english-interface-link">English</a>
              </div>
              <div><a className="interfaceLinks-row bottom" id="help-link" href={Sefaria._v({
                he: Sefaria._siteSettings.HELP_CENTER_URLS.HE, 
                en: Sefaria._siteSettings.HELP_CENTER_URLS.EN_US
              })} target="_blank">
                <InterfaceText>Help</InterfaceText>
              </a></div>
            </div>
            <hr className="interfaceLinks-hr"/>
            <div><a className="interfaceLinks-row logout" id="logout-link" href={Sefaria.getLogoutUrl()}>
              <InterfaceText>Logout</InterfaceText>
            </a></div>
          </div> : null}
        </div>
    </div>
  );
};


const MobileInterfaceLanguageToggle = () => {
  const currentURL = getCurrentPage();

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
  const url = Sefaria._v({
    he: Sefaria._siteSettings.HELP_CENTER_URLS.HE, 
    en: Sefaria._siteSettings.HELP_CENTER_URLS.EN_US
  });
  return (
    <div className="help">
      <a href={url} data-target-module={Sefaria.SHEETS_MODULE} target="_blank">
        <img src="/static/img/help.svg" alt={Sefaria._("Help")}/>
      </a>
    </div>
  );
};

const SignUpButton = () => {
  return (
    <Button>
      <a href="/register">
        <InterfaceText>Sign Up</InterfaceText>
      </a>
    </Button>
  )
}

const CreateButton = () => {
  return (
    <Button className="small">
      <a href="/sheets/new" data-target-module={Sefaria.SHEETS_MODULE}>
        <InterfaceText text={{'en': 'Create', 'he': 'דף חדש'}} /> 
      </a>
    </Button>
  );
};


export {Header};
