import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Sefaria from './sefaria/sefaria';
import {
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
import ModuleSwitcherPopover from './ModuleSwitcherPopover';

const LoggedOutDropdown = ({module}) => {
  return (
    <DropdownMenu positioningClass="headerDropdownMenu" buttonComponent={
      <Button
        variant="icon-only"
        icon="profile_loggedout_mdl"
        ariaLabel={Sefaria._("Account menu")}
      />
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
        <DropdownMenuItem url={Sefaria._v({
          he: Sefaria._siteSettings.HELP_CENTER_URLS.HE,
          en: Sefaria._siteSettings.HELP_CENTER_URLS.EN_US
        })} newTab={true}>
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
        len={24} />}>
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

        <DropdownMenuItem url={Sefaria._v({
          he: Sefaria._siteSettings.HELP_CENTER_URLS.HE,
          en: Sefaria._siteSettings.HELP_CENTER_URLS.EN_US
        })} newTab={true}>
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
  const button = (<Button
                    variant="icon-only"
                    icon="moduleswitcher_mdl"
                    ariaLabel={Sefaria._("Library")}
                  />);

  const handleClose = (event) => {
    if (event?.type === 'passive') {
      gtag("event", "modswitch_close", {
        feature_name: "module_switcher"
      });
    }
  };

  return (
    <ModuleSwitcherPopover>
      <DropdownMenu positioningClass="headerDropdownMenu"
                    analyticsFeatureName="module_switcher"
                    buttonComponent={button}
                    onClose={handleClose}>
        <div className='dropdownLinks-options moduleDropdown'>
          <DropdownMenuItem url={"/about"} newTab={false} customCSS="dropdownItem dropdownLogoItem" analyticsEventName="modswitch_item_click:click" analyticsEventText="About Sefaria">
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
          <DropdownMenuItem url={'/products'} newTab={true} customCSS="dropdownItem dropdownMoreItem" analyticsEventName="modswitch_item_click:click" analyticsEventText="More">
            <InterfaceText text={{ en: 'More from Sefaria' + ' ›', he: Sefaria._('More from Sefaria') + ' ›' }} />
          </DropdownMenuItem>
        </div>
      </DropdownMenu>
    </ModuleSwitcherPopover>
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
  
  const mobile = Sefaria.getBreakpoint() === Sefaria.breakpoints.MOBILE;
  
  const shouldHide = () => {
    // Determines whether or not this component should be displayed or not. 
    // When the component is hidden, there are two cases: (1) the ReaderControls component is displayed instead of this component, essentially
    // functioning as the header.  This case occurs when viewing a library text in mode "Text"
    // and (2) there is simply no header at all.  This case occurs when viewing a library text in mode "TextAndConnections".    
    // shouldHide() returns true when the header should be hidden (a) on mobile (b) while viewing library texts (c) when the mobile nav menu is not open.
    const isViewingTextContent = !props.firstPanel?.menuOpen && (props.firstPanel?.mode === "Text" || props.firstPanel?.mode === "TextAndConnections");
    const hidden = mobile && !props.mobileNavMenuOpen && isViewingTextContent;
    return hidden;
  }

  const hasUnreadNotifications = !!(props.notificationCount);

  const logo = (
    <a href='/' className="home" aria-label={Sefaria._(`Sefaria ${Sefaria.activeModule} logo`)}/>
  );

  const librarySavedIcon = <Button
                                  variant="icon-only"
                                  icon="bookmarkset_outline_mdl"
                                  ariaLabel={Sefaria._('Saved items')}
                                  href="/saved"
                                  targetModule={Sefaria.LIBRARY_MODULE}
                                />;

  const voicesNotificationIcon = <Button
                                variant="icon-only"
                                icon={hasUnreadNotifications ? "notifications-1_mdl" : "notifications_mdl"}
                                ariaLabel={Sefaria._("Notifications")}
                                href="/notifications"
                                targetModule={Sefaria.VOICES_MODULE}
                              />;


  const headerRef = useOnceFullyVisible(() => {
    sa_event("header_viewed", { impression_type: "regular_header" });
    gtag("event", "header_viewed", { impression_type: "regular_header" });
    if (Sefaria._debug) console.log("sa: we got a view event! (regular header)");
  }, "sa.header_viewed");


  const links = props.module === Sefaria.LIBRARY_MODULE ? ['Texts', 'Topics'] : ['Topics', 'Collections']
  const textLinks = <div className="textLinks">
    {links.map((link) => (
      <a
        key={link}
        href={`/${link.toLowerCase()}`}
        data-target-module={Sefaria.activeModule}
        className="textLink"
        onKeyDown={Util.handleKeyboardClick}
      >
        <InterfaceText context="Header">{link}</InterfaceText>
      </a>
    ))}
    <DonateLink classes={"textLink donate"} source={"Header"}><InterfaceText>Donate</InterfaceText></DonateLink>
  </div>

  
  if (shouldHide()) return null;

  const headerContent = (
    <>
      <nav className="headerNavSection" aria-label="Primary navigation">
        {Sefaria._siteSettings.TORAH_SPECIFIC && logo}
        {textLinks}
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
        <div className={"header-icons"}>
          {Sefaria._siteSettings.TORAH_SPECIFIC && <HelpButton />}

          {!Sefaria._uid && Sefaria._siteSettings.TORAH_SPECIFIC ?
            <InterfaceLanguageMenu
              currentLang={Sefaria.interfaceLang}
              translationLanguagePreference={props.translationLanguagePreference}
              setTranslationLanguagePreference={props.setTranslationLanguagePreference} /> : null}

          {Sefaria._uid && (props.module === Sefaria.LIBRARY_MODULE ? librarySavedIcon : voicesNotificationIcon)}

          <ModuleSwitcher />

          {Sefaria._uid ?
            <LoggedInDropdown module={props.module} />
            : <LoggedOutDropdown module={props.module} />
          }
        </div>
      </div>
    </>
  );

  // Language toggle logic - show on mobile for specific menu pages
  const languageToggleMenus = ["navigation", "saved", "history", "notes"];
  const hasLanguageToggle = Sefaria.interfaceLang !== "hebrew" && languageToggleMenus.includes(props?.firstPanel?.menuOpen);

  const mobileHeaderContent = (
    <>
      <div>
        <ModuleSwitcherPopover>
          <button onClick={props.onMobileMenuButtonClick} aria-label={Sefaria._("Menu")} className="menuButton">
            <i className="fa fa-bars"></i>
          </button>
        </ModuleSwitcherPopover>
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

  // In "book toc" mode, we want to show a color line below the header.  In all other cases, we want to show a box shadow.
  const hasColorLine = props?.firstPanel?.menuOpen === "book toc";
  const hasBoxShadow = !hasColorLine;
  const headerInnerClasses = classNames({
    headerInner: 1,
    boxShadow: hasBoxShadow,
    mobile: mobile
  });
  return (
    <div className="header" role="banner" ref={headerRef}>
      <div className={headerInnerClasses}>
        {mobile ? mobileHeaderContent : headerContent}
      </div>

      {mobile &&
        <MobileNavMenu
          visible={props.mobileNavMenuOpen}
          onRefClick={props.onRefClick}
          showSearch={props.showSearch}
          openTopic={props.openTopic}
          openURL={props.openURL}
          close={props.onMobileMenuButtonClick}
          module={props.module}
          hasUnreadNotifications={hasUnreadNotifications}
          />
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
  firstPanel: PropTypes.shape({
    menuOpen: PropTypes.string,
    mode: PropTypes.string,
    settings: PropTypes.shape({
      language: PropTypes.string
    })
  }),
  module: PropTypes.string.isRequired,
  mobileNavMenuOpen: PropTypes.bool,
  onMobileMenuButtonClick: PropTypes.func,
  toggleLanguage: PropTypes.func,
  translationLanguagePreference: PropTypes.string,
  setTranslationLanguagePreference: PropTypes.func,
  notificationCount: PropTypes.number,
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

const MobileNavMenu = ({ onRefClick, showSearch, openTopic, openURL, close, visible, module, hasUnreadNotifications }) => {
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
            <InterfaceText context="Header">Topics</InterfaceText>
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
                <Button
                  variant="secondary"
                  icon="bookmarkset_outline_mdl"
                  alt={Sefaria._('Bookmarks')}
                  href="/saved"
                  onClick={close}
                  targetModule={Sefaria.LIBRARY_MODULE}
                >
                  <InterfaceText>Saved, History & Notes</InterfaceText>
                </Button>
              </>}
            {module === Sefaria.VOICES_MODULE &&
              <>
                <a href={`/profile/${Sefaria.slug}`} onClick={close} data-target-module={Sefaria.VOICES_MODULE}>
                  <div className="mobileProfileFlexContainer">
                    <ProfilePic url={Sefaria.profile_pic_url} name={Sefaria.full_name} len={25} />
                    <InterfaceText>Profile</InterfaceText>
                  </div>
                </a>
                <Button
                  variant="secondary"
                  icon="bookmarkset_outline_mdl"
                  alt={Sefaria._('Bookmarks')}
                  href="/saved"
                  onClick={close}
                  targetModule={Sefaria.VOICES_MODULE}
                >
                  <InterfaceText>Saved & History</InterfaceText>
                </Button>
                <Button
                  variant="secondary"
                  icon={hasUnreadNotifications ? "notifications-1_mdl" : "notifications_mdl"}
                  alt={Sefaria._("Notifications")}
                  href="/notifications"
                  onClick={close}
                  targetModule={Sefaria.VOICES_MODULE}
                >
                  <InterfaceText>Notifications</InterfaceText>
                </Button>
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

        <Button
          variant="secondary"
          icon="help_mdl"
          href={Sefaria._v({
            he: Sefaria._siteSettings.HELP_CENTER_URLS.HE,
            en: Sefaria._siteSettings.HELP_CENTER_URLS.EN_US
          })}
          target="_blank"
        >
          <InterfaceText>Get Help</InterfaceText>
        </Button>

        <a href="/mobile-about-menu">
          <img src="/static/icons/info.svg" alt={Sefaria._("About")} />
          <InterfaceText>About Sefaria</InterfaceText>
        </a>

        <hr />

        {module === Sefaria.LIBRARY_MODULE &&
          <a href="/" className="mobileModuleSwitcher" data-target-module={Sefaria.VOICES_MODULE}>
            <span className="dropdownDot" style={{backgroundColor: `var(--sheets-green)`}}></span>
            <InterfaceText>Voices on Sefaria</InterfaceText>
          </a>
        }

        {module === Sefaria.VOICES_MODULE &&
          <a href="/texts" className="mobileModuleSwitcher" data-target-module={Sefaria.LIBRARY_MODULE}>
            <span className="dropdownDot" style={{backgroundColor: `var(--sefaria-blue)`}}></span>
            <InterfaceText>Sefaria Library</InterfaceText>
          </a>
        }

        <a href="https://developers.sefaria.org" className="mobileModuleSwitcher" target="_blank">
          <span className="dropdownDot" style={{backgroundColor: `var(--devportal-purple)`}}></span>
          <InterfaceText>Developers on Sefaria</InterfaceText>
        </a>

        <a href="/products" data-target-module={Sefaria.LIBRARY_MODULE}>
          <img className="chevron" src="/static/icons/chevron-right.svg"/>
          <InterfaceText>More from Sefaria</InterfaceText>
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
      <img src="/static/icons/globallanguageswitcher_mdl.svg" alt={Sefaria._("Language")} />
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
    <Button
      variant="icon-only"
      icon="help_mdl"
      ariaLabel={Sefaria._("Help")}
      href={url}
      targetModule={Sefaria.VOICES_MODULE}
    />
  );
};

const SignUpButton = () => {
  return (
    <Button className="auto-width-button" href="/register" targetModule={Sefaria.LIBRARY_MODULE}>
      <InterfaceText>Sign Up</InterfaceText>
    </Button>
  )
}

const CreateButton = () => {

  return (
    <Button className="auto-width-button" href="/sheets/new" targetModule={Sefaria.VOICES_MODULE}>
      <InterfaceText text={{ 'en': 'Create', 'he': 'דף חדש' }} />
    </Button>
  );
};


export { Header };
