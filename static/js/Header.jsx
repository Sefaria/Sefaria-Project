import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import Component from 'react-class';
import classNames from 'classnames';
import $ from './sefaria/sefariaJquery';
import Sefaria from './sefaria/sefaria';
import {
  SearchButton,
  GlobalWarningMessage,
  InterfaceLanguageMenu,
  InterfaceText,
  LanguageToggleButton,
  DonateLink,
  useOnceFullyVisible
} from './Misc';
import { ProfilePic } from "./ProfilePic";
import { HeaderAutocomplete } from './HeaderAutocomplete'
import {
  DropdownMenu,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownModuleItem,
  DropdownLanguageToggle,
  NextRedirectAnchor
} from './common/DropdownMenu';
import Util from './sefaria/util';
import Button from './common/Button';

const LoggedOutDropdown = ({module}) => {
  return (
    <DropdownMenu positioningClass="headerDropdownMenu" buttonComponent={
      <button className="header-dropdown-button" aria-label={Sefaria._("Account menu")}>
        <img src='/static/icons/logged_out.svg' alt={Sefaria._("Login")} />
      </button>
    }>
      <div className='dropdownLinks-options'>
        <NextRedirectAnchor url='/login'>
          <InterfaceText text={{ 'en': 'Log in', 'he': 'התחברות' }} />
        </NextRedirectAnchor>
        <NextRedirectAnchor url='/register'>
          <InterfaceText text={{ 'en': 'Sign up', 'he': 'להרשמה' }} />
        </NextRedirectAnchor>
        <DropdownMenuSeparator />
        <DropdownLanguageToggle />
        <DropdownMenuSeparator />
        {module === Sefaria.LIBRARY_MODULE &&
          <DropdownMenuItem url={'/updates'}>
            <InterfaceText text={{ 'en': 'New Additions', 'he': 'חידושים בארון הספרים של ספריא' }} />
          </DropdownMenuItem>
        }
        <DropdownMenuItem url={'/help'}>
          <InterfaceText text={{ 'en': 'Help', 'he': 'עזרה' }} />
        </DropdownMenuItem>
      </div>
    </DropdownMenu>
  );
}

const LoggedInDropdown = ({ module }) => {
  return (
    <DropdownMenu positioningClass="headerDropdownMenu"
      buttonComponent={<ProfilePic url={Sefaria.profile_pic_url}
        name={Sefaria.full_name}
        len={25} />}>
      <div className='dropdownLinks-options'>
        {module === Sefaria.LIBRARY_MODULE &&
          <DropdownMenuItem preventClose={true}>
            <strong>{Sefaria.full_name}</strong>
          </DropdownMenuItem>
        }
        {module === Sefaria.VOICES_MODULE &&
          <DropdownMenuItem url={`/profile/${Sefaria.slug}`} preventClose={true} targetModule={Sefaria.VOICES_MODULE}>
            <strong>{Sefaria.full_name}</strong>
          </DropdownMenuItem>
        }
        <DropdownMenuSeparator />

        {module === Sefaria.LIBRARY_MODULE &&
          <>
            <DropdownMenuItem url={'/settings/account'} targetModule={Sefaria.LIBRARY_MODULE}>
              <InterfaceText>Account Settings</InterfaceText>
            </DropdownMenuItem>
            <DropdownMenuItem url={'/torahtracker'}>
              <InterfaceText text={{ 'en': 'Torah Tracker', 'he': 'לימוד במספרים' }} />
            </DropdownMenuItem>
          </>
        }


        {module === Sefaria.VOICES_MODULE &&
          <>
            <DropdownMenuItem url={`/profile/${Sefaria.slug}`} targetModule={Sefaria.VOICES_MODULE}>
              <InterfaceText>Profile</InterfaceText>
            </DropdownMenuItem>
            <DropdownMenuItem url={'/saved'} targetModule={Sefaria.VOICES_MODULE}>
              <InterfaceText>Saved</InterfaceText>
            </DropdownMenuItem>
            <DropdownMenuItem url={'/history'} targetModule={Sefaria.VOICES_MODULE}>
              <InterfaceText>History</InterfaceText>
            </DropdownMenuItem>
            <DropdownMenuItem url={'/settings/account'} targetModule={Sefaria.LIBRARY_MODULE}>
              <InterfaceText>Account Settings</InterfaceText>
            </DropdownMenuItem>
          </>
        }

        <DropdownMenuSeparator />
        <DropdownLanguageToggle />
        <DropdownMenuSeparator />

        {module === Sefaria.LIBRARY_MODULE &&
          <DropdownMenuItem url={'/updates'}>
            <InterfaceText text={{ 'en': 'New Additions', 'he': 'חידושים בארון הספרים של ספריא' }} />
          </DropdownMenuItem>
        }

        <DropdownMenuItem preventClose={true} url={'/help'}>
          <InterfaceText text={{ 'en': 'Help', 'he': 'עזרה' }} />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem url={Sefaria.getLogoutUrl()}>
          <InterfaceText text={{ 'en': 'Log Out', 'he': 'ניתוק' }} />
        </DropdownMenuItem>
      </div>
    </DropdownMenu>
  );
}

const ModuleSwitcher = () => {
  const logoPath = Sefaria.interfaceLang === "hebrew" ? "/static/img/logo-hebrew.png" : "/static/img/logo.svg";
  return (
    <DropdownMenu positioningClass="headerDropdownMenu" buttonComponent={
      <button className="header-dropdown-button" aria-label={Sefaria._("Library")}>
        <img src='/static/icons/module_switcher_icon.svg' alt={Sefaria._("Library")} />
      </button>
    }>
      <div className='dropdownLinks-options moduleDropdown'>
        <DropdownMenuItem url={"/about"} newTab={false} customCSS="dropdownItem dropdownLogoItem">
          <img src={logoPath} alt={Sefaria._('Sefaria')} className='dropdownLogo' />

        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownModuleItem
          url={"/"}
          newTab={Sefaria.activeModule !== Sefaria.LIBRARY_MODULE}
          targetModule={Sefaria.LIBRARY_MODULE}
          dotColor={'--sefaria-blue'}
          text={{ en: "Library", he: Sefaria._("Library") }} />
        <DropdownMenuSeparator />
        <DropdownModuleItem
          url={"/"}
          newTab={Sefaria.activeModule !== Sefaria.VOICES_MODULE}
          targetModule={Sefaria.VOICES_MODULE}
          dotColor={'--sheets-green'}
          text={{ en: "Voices", he: Sefaria._("Voices") }} />
        <DropdownMenuSeparator />
        <DropdownModuleItem
          url={'https://developers.sefaria.org'}
          newTab={true}
          dotColor={'--devportal-purple'}
          text={{ en: "Developers", he: Sefaria._("Developers") }} />
        <DropdownMenuSeparator />
        <DropdownMenuItem url={'/products'} newTab={true} customCSS="dropdownItem dropdownMoreItem">
          <InterfaceText text={{ en: 'More from Sefaria' + ' ›', he: Sefaria._('More from Sefaria') + ' ›' }} />
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
  
  const mobile = !props.multiPanel;

  
  const shouldHide = () => {
    // Header visibility logic - on mobile, return null when we are viewing library content.  When we return null,
    // we either display no component at the top of the screen or display ReaderControls at the top of the screen, essentially as the header.
    // If the mobile nav menu is open, even when vieiwng a book, we still want the header to display.
    const isViewingTextContent = !props.firstPanel?.menuOpen && (props.firstPanel?.mode === "Text" || props.firstPanel?.mode === "TextAndConnections");
    const hidden = mobile && !props.mobileNavMenuOpen && isViewingTextContent;
    return hidden;
  }

  const path = `/static/img/${Sefaria.activeModule}-logo-${Sefaria.interfaceLang}.svg`;
  const logo = (
    <a href='/'>
      <img src={path} className="home" alt={Sefaria._(`Sefaria ${Sefaria.activeModule} logo`)}/>
    </a>
  );

  const librarySavedIcon = <div className='librarySavedIcon'>
                                <a
                                  href="/saved"
                                  data-target-module={Sefaria.LIBRARY_MODULE}
                                  onKeyDown={(e) => Util.handleKeyboardClick(e)}
                                >
                                  <img src='/static/icons/bookmarks.svg' alt={Sefaria._('Saved items')} />
                                </a>
                              </div>;

  const sheetsNotificationsIcon = <div className='sheetsNotificationsHeaderIcon'>
    <a
      href="/notifications"
      data-target-module={Sefaria.VOICES_MODULE}
      onKeyDown={(e) => Util.handleKeyboardClick(e)}
    >
      <img src='/static/icons/notification.svg' alt={Sefaria._("Notifications")} />
    </a>
  </div>;

  const headerRef = useOnceFullyVisible(() => {
    sa_event("header_viewed", { impression_type: "regular_header" });
    gtag("event", "header_viewed", { impression_type: "regular_header" });
    if (Sefaria._debug) console.log("sa: we got a view event! (regular header)");
  }, "sa.header_viewed");

  
  if (shouldHide()) return null;

  const headerContent = (
    <>
      <nav className="headerNavSection" aria-label="Primary navigation">
        {Sefaria._siteSettings.TORAH_SPECIFIC && logo}
        {props.module === Sefaria.LIBRARY_MODULE &&
          <>
            <a
              href="/texts"
              className="textLink"
              onKeyDown={(e) => Util.handleKeyboardClick(e)}
            >
              <InterfaceText context="Header">Texts</InterfaceText>
            </a>
            <a
              href="/topics"
              className="textLink"
              onKeyDown={(e) => Util.handleKeyboardClick(e)}
            >
              <InterfaceText context="Header">Topics</InterfaceText>
            </a>
          </>
        }
        {props.module === Sefaria.VOICES_MODULE &&
          <>
            <a
              href="/topics"
              data-target-module={Sefaria.VOICES_MODULE}
              className="textLink"
              onKeyDown={(e) => Util.handleKeyboardClick(e)}
            >
              <InterfaceText context="Header">Topics</InterfaceText>
            </a>
            <a
              href="/collections"
              data-target-module={Sefaria.VOICES_MODULE}
              className="textLink"
              onKeyDown={(e) => Util.handleKeyboardClick(e)}
            >
              <InterfaceText context="Header">Collections</InterfaceText>
            </a>
          </>
        }
        <DonateLink classes={"textLink donate"} source={"Header"}><InterfaceText>Donate</InterfaceText></DonateLink>
      </nav>

      <div className="headerLinksSection">
        <HeaderAutocomplete
          onRefClick={props.onRefClick}
          showSearch={props.showSearch}
          openTopic={props.openTopic}
          openURL={props.openURL}
        />

        {!Sefaria._uid && props.module === Sefaria.LIBRARY_MODULE && <SignUpButton />}
        {props.module === Sefaria.VOICES_MODULE && <CreateButton />}
        {Sefaria._siteSettings.TORAH_SPECIFIC && <HelpButton />}

        {!Sefaria._uid && Sefaria._siteSettings.TORAH_SPECIFIC ?
          <InterfaceLanguageMenu
            currentLang={Sefaria.interfaceLang}
            translationLanguagePreference={props.translationLanguagePreference}
            setTranslationLanguagePreference={props.setTranslationLanguagePreference} /> : null}

        {Sefaria._uid && (props.module === Sefaria.LIBRARY_MODULE ? librarySavedIcon : sheetsNotificationsIcon)}

        <ModuleSwitcher />

        {Sefaria._uid ?
          <LoggedInDropdown module={props.module} />
          : <LoggedOutDropdown module={props.module} />
        }

      </div>
    </>
  );

  // Language toggle logic - show on mobile for specific menu pages
  const languageToggleMenus = ["navigation", "saved", "history", "notes"];
  const hasLanguageToggle = !Sefaria.multiPanel && Sefaria.interfaceLang !== "hebrew" && languageToggleMenus.includes(props.firstPanel?.menuOpen);

  const mobileHeaderContent = (
    <>
      <div>
        <button onClick={props.onMobileMenuButtonClick} aria-label={Sefaria._("Menu")} className="menuButton">
          <i className="fa fa-bars"></i>
        </button>
      </div>

      <div className="mobileHeaderCenter">
        {Sefaria._siteSettings.TORAH_SPECIFIC && logo}
      </div>

      {hasLanguageToggle ?
        <div className={props.firstPanel?.settings?.language + " mobileHeaderLanguageToggle"}>
          <LanguageToggleButton toggleLanguage={props.toggleLanguage} />
        </div> :
        <div></div>}
    </>
  );

  // Box shadow styling - don't show shadow over panels with color line (book toc in all contexts)
  const hasBoxShadow = !props.firstPanel?.menuOpen === "book toc";;
  const headerClasses = classNames({ header: 1, mobile: mobile });
  const headerInnerClasses = classNames({
    headerInner: 1,
    boxShadow: hasBoxShadow,
    mobile: mobile
  });
  return (
    <div className={headerClasses} role="banner" ref={headerRef}>
      <div className={headerInnerClasses}>
        {!mobile ? headerContent : mobileHeaderContent}
      </div>

      {mobile &&
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
  multiPanel: PropTypes.bool.isRequired,
  headerMode: PropTypes.bool.isRequired,
  onRefClick: PropTypes.func.isRequired,
  showSearch: PropTypes.func.isRequired,
  openTopic: PropTypes.func.isRequired,
  openURL: PropTypes.func.isRequired,
  firstPanel: PropTypes.object,
  module: PropTypes.string.isRequired,
  mobileNavMenuOpen: PropTypes.bool,
  onMobileMenuButtonClick: PropTypes.func,
  toggleLanguage: PropTypes.func,
  translationLanguagePreference: PropTypes.string,
  setTranslationLanguagePreference: PropTypes.func,
};

const LoggedOutButtons = ({ mobile, loginOnly }) => {
  const classes = classNames({accountLinks: !mobile, anon: !mobile});

  return (
    <div className={classes}>
      {loginOnly && (
        <NextRedirectAnchor className="login loginLink" url={'/login'}>
          {mobile ? <img src="/static/icons/login.svg" alt={Sefaria._("Login")} /> : null}
          <InterfaceText>Log in</InterfaceText>
        </NextRedirectAnchor>)}
      {loginOnly ? null :
        <span>
          <NextRedirectAnchor className="login signupLink" url={'/register'}>
            {mobile ? <img src="/static/icons/login.svg" alt={Sefaria._("Login")} /> : null}
            <InterfaceText>Sign up</InterfaceText>
          </NextRedirectAnchor>
          <NextRedirectAnchor className="login loginLink" url={'/login'}>
            <InterfaceText>Log in</InterfaceText>
          </NextRedirectAnchor>
        </span>}

    </div>
  );
}


const LoggedInButtons = ({ headerMode }) => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    if (headerMode) {
      setIsClient(true);
    }
  }, []);
  const unread = headerMode ? ((isClient && Sefaria.notificationCount > 0) ? 1 : 0) : Sefaria.notificationCount > 0 ? 1 : 0
  const notificationsClasses = classNames({ notifications: 1, unread: unread });
  return (
    <div className="loggedIn accountLinks">
      <a href="/saved" aria-label="See My Saved Texts">
        <img src="/static/icons/bookmarks.svg" alt={Sefaria._('Bookmarks')} />
      </a>
      <a href="/notifications" aria-label="See New Notifications" key={`notificationCount-C-${unread}`} className={notificationsClasses}>
        <img src="/static/icons/notification.svg" alt={Sefaria._('Notifications')} />
      </a>
      {Sefaria._siteSettings.TORAH_SPECIFIC ? <HelpButton /> : null}
      <ProfilePicMenu len={24} url={Sefaria.profile_pic_url} name={Sefaria.full_name} key={`profile-${isClient}-${Sefaria.full_name}`} />
    </div>
  );
}

const MobileNavMenu = ({ onRefClick, showSearch, openTopic, openURL, close, visible, module }) => {
  const classes = classNames({
    mobileNavMenu: 1,
    closed: !visible,
  });
  return (
    <nav className={classes} aria-label="Mobile navigation menu">
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
            <img src="/static/icons/book.svg" alt={Sefaria._("Texts")} />
            <InterfaceText context="Header">Texts</InterfaceText>
          </a>
          <a href={"/topics"} onClick={close}>
            <img src="/static/icons/topic.svg" alt={Sefaria._("Topics")} />
            <InterfaceText context="Header">Explore</InterfaceText>
          </a>
          <a href="/calendars" onClick={close}>
            <img src="/static/icons/calendar.svg" alt={Sefaria._("Learning Schedules")} />
            <InterfaceText>Learning Schedules</InterfaceText>
          </a>
        </>
      }
      {module === Sefaria.VOICES_MODULE &&
        <>
          <a href="/topics" data-target-module={Sefaria.VOICES_MODULE} onClick={close}>
            <img src="/static/icons/topic.svg" alt={Sefaria._("Topics")} />
            <InterfaceText context="Header">Topics</InterfaceText>
          </a>
          <a href="/collections" onClick={close} className="textsPageLink" data-target-module={Sefaria.VOICES_MODULE}>
            <img src="/static/icons/collection.svg" alt={Sefaria._("Collections")} />
            <InterfaceText context="Header">Collections</InterfaceText>
          </a>
        </>
      }

      <DonateLink classes={"blue"} source="MobileNavMenu">
        <img src="/static/img/heart.png" alt={Sefaria._("donation icon")} />
        <InterfaceText>Donate</InterfaceText>
      </DonateLink>

      <div className="mobileAccountLinks">

        {Sefaria._uid &&
          <>
            {module === Sefaria.LIBRARY_MODULE &&
              <>
                <a href="/saved" onClick={close} data-target-module={Sefaria.LIBRARY_MODULE}>
                  <img src="/static/icons/bookmarks.svg" alt={Sefaria._('Bookmarks')} />
                  {<InterfaceText text={{ en: "Saved, History & Notes", he: "שמורים, היסטוריה והערות" }} />}
                </a>
              </>}
            {module === Sefaria.VOICES_MODULE &&
              <>
                <a href={`/profile/${Sefaria.slug}`} onClick={close} data-target-module={Sefaria.VOICES_MODULE}>
                  <div className="mobileProfileFlexContainer">
                    <ProfilePic url={Sefaria.profile_pic_url} name={Sefaria.full_name} len={25} />
                    <InterfaceText>Profile</InterfaceText>
                  </div>
                </a>
                <a href="/saved" onClick={close} data-target-module={Sefaria.VOICES_MODULE}>
                  <img src="/static/icons/bookmarks.svg" alt={Sefaria._('Bookmarks')} />
                  {<InterfaceText text={{ en: "Saved & History", he: "שמורים והיסטוריה" }} />}
                </a>
                <a href="/notifications" onClick={close} data-target-module={Sefaria.VOICES_MODULE}>
                  <img src="/static/icons/notification.svg" alt={Sefaria._("Notifications")} />
                  <InterfaceText>Notifications</InterfaceText>
                </a>
              </>}
          </>}

        {Sefaria._uid &&
          <>
            <a href="/settings/account" data-target-module={Sefaria.LIBRARY_MODULE}>
              <img src="/static/icons/settings.svg" alt={Sefaria._("Settings")} />
              <InterfaceText>Account Settings</InterfaceText>
            </a>
          </>
        }

        <MobileInterfaceLanguageToggle />

        <hr />

        <a href={Sefaria._v({
          he: Sefaria._siteSettings.HELP_CENTER_URLS.HE,
          en: Sefaria._siteSettings.HELP_CENTER_URLS.EN_US
        })} target="_blank">
          <img src="/static/icons/help.svg" alt={Sefaria._("Help")} />
          <InterfaceText>Get Help</InterfaceText>
        </a>

        <a href="/mobile-about-menu">
          <img src="/static/icons/info.svg" alt={Sefaria._("About")} />
          <InterfaceText>About Sefaria</InterfaceText>
        </a>

        <hr />

        {module === Sefaria.LIBRARY_MODULE &&
          <a href="/" data-target-module={Sefaria.VOICES_MODULE}>
            <img src="/static/icons/sheets-mobile-icon.svg" alt={Sefaria._("Sheets")} />
            <InterfaceText>Sheets</InterfaceText>
          </a>
        }

        {module === Sefaria.VOICES_MODULE &&
          <a href="/texts" data-target-module={Sefaria.LIBRARY_MODULE}>
            <img src="/static/icons/book.svg" alt={Sefaria._("Library")} />
            <InterfaceText text={{ en: "Sefaria Library", he: "ספריית ספריא" }} />
          </a>
        }

        <a href="https://developers.sefaria.org" target="_blank">
          <img src="/static/icons/dev-portal-mobile-icon.svg" alt={Sefaria._("Developers")} />
          <InterfaceText text={{ en: "Developers", he: "מפתחים" }} />
        </a>

        <a href="/products" data-target-module={Sefaria.LIBRARY_MODULE}>
          <img src="/static/icons/products-icon.svg" alt={Sefaria._("Products")} />
          <InterfaceText text={{ en: "All Products", he: "מוצרים" }} />
        </a>

        <hr />

        {Sefaria._uid ?
          <a href={Sefaria.getLogoutUrl()} className="logout">
            <img src="/static/icons/logout.svg" alt={Sefaria._("Logout")} />
            <InterfaceText>Logout</InterfaceText>
          </a>
          :
          <LoggedOutButtons mobile={true} loginOnly={false} />}

        <hr />
      </div>
    </nav>
  );
};


const ProfilePicMenu = ({ len, url, name }) => {
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
      <a href={`/profile/${Sefaria.slug}`} className="my-profile" onClick={profilePicClick} data-target-module={Sefaria.VOICES_MODULE}>
        <ProfilePic len={len} url={url} name={name} />
      </a>
      <div className="interfaceLinks">
        {isOpen ?
          <div className="interfaceLinks-menu profile-menu" onClick={menuClick}>
            <div className="interfaceLinks-header profile-menu">{name}</div>
            <div className="profile-menu-middle">
              <div><a className="interfaceLinks-row" id="my-profile-link" href={`/profile/${Sefaria.slug}`} data-target-module={Sefaria.VOICES_MODULE}>
                <InterfaceText>Profile</InterfaceText>
              </a></div>
              <div><a className="interfaceLinks-row" id="new-sheet-link" href="/sheets/new" data-target-module={Sefaria.VOICES_MODULE}>
                <InterfaceText>Create a New Sheet</InterfaceText>
              </a></div>
              <div><a className="interfaceLinks-row" id="account-settings-link" href="/settings/account" data-target-module={Sefaria.LIBRARY_MODULE}>
                <InterfaceText>Account Settings</InterfaceText>
              </a></div>
              <div className="interfaceLinks-row languages">
                <NextRedirectAnchor className={`${(Sefaria.interfaceLang == 'hebrew') ? 'active':''}`} url='/interface/hebrew'>עברית</NextRedirectAnchor>
                <NextRedirectAnchor className={`${(Sefaria.interfaceLang == 'english') ? 'active':''}`} url='/interface/english'>English</NextRedirectAnchor>
              </div>
              <div><a className="interfaceLinks-row bottom" id="help-link" href={Sefaria._v({
                he: Sefaria._siteSettings.HELP_CENTER_URLS.HE,
                en: Sefaria._siteSettings.HELP_CENTER_URLS.EN_US
              })} target="_blank">
                <InterfaceText>Help</InterfaceText>
              </a></div>
            </div>
            <hr className="interfaceLinks-hr" />
            <div><a className="interfaceLinks-row logout" id="logout-link" href={Sefaria.getLogoutUrl()}>
              <InterfaceText>Logout</InterfaceText>
            </a></div>
          </div> : null}
      </div>
    </div>
  );
};


const MobileInterfaceLanguageToggle = () => {
  const links = Sefaria.interfaceLang == "hebrew" ?
    <>
      <NextRedirectAnchor url="/interface/hebrew" className="int-he">עברית</NextRedirectAnchor>
      <span className="separator">•</span>
      <NextRedirectAnchor url="/interface/english" className="int-en inactive">English</NextRedirectAnchor>
    </>
    :
    <>
      <NextRedirectAnchor url="/interface/english" className="int-en">English</NextRedirectAnchor>
      <span className="separator">•</span>
      <NextRedirectAnchor url="/interface/hebrew" className="int-he inactive">עברית</NextRedirectAnchor>
    </>;

  return (
    <div className="mobileInterfaceLanguageToggle">
      <img src="/static/icons/globe-wire.svg" alt={Sefaria._("Language")} />
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
      <a href={url} data-target-module={Sefaria.VOICES_MODULE} target="_blank">
        <img src="/static/img/help.svg" alt={Sefaria._("Help")} />
      </a>
    </div>
  );
};

const SignUpButton = () => {
  return (
    <Button href="/register" targetModule={Sefaria.LIBRARY_MODULE}>
      <InterfaceText>Sign Up</InterfaceText>
    </Button>
  )
}

const CreateButton = () => {

  return (
    <Button className="small" href="/sheets/new" targetModule={Sefaria.VOICES_MODULE}>
      <InterfaceText text={{ 'en': 'Create', 'he': 'דף חדש' }} />
    </Button>
  );
};


export { Header };
