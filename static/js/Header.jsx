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
    const logo = Sefaria.interfaceLang === "hebrew" ?
      <img src="/static/img/pecha-logo.svg" alt="Sefaria Logo"/> :
      <img src="/static/img/pecha-logo.svg" alt="Sefaria Logo"/>;

    const headerContent = (
      <>
        <div className="headerNavSection">
          { Sefaria._siteSettings.TORAH_SPECIFIC ?
          <a className="home" href="/" >{logo}</a> : null }
          <a href="/texts" className="textLink"><InterfaceText context="Header">Texts</InterfaceText></a>
          <a href="/topics" className="textLink"><InterfaceText>Topics</InterfaceText></a>
          <a href="/community" className="textLink"><InterfaceText>Community</InterfaceText></a>
          {/*<DonateLink classes={"textLink donate"} source={"Header"}><InterfaceText>Donate</InterfaceText></DonateLink>*/}
        </div>

        <div className="headerLinksSection">
          <SearchBar
            onRefClick={this.props.onRefClick}
            showSearch={this.props.showSearch}
            openTopic={this.props.openTopic}
            openURL={this.props.openURL} />

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


class SearchBar extends Component {
  constructor(props) {
    super(props);

    this.state = {
      searchFocused: false
    };
    this._searchOverridePre = Sefaria._('Search for') +': "';
    this._searchOverridePost = '"';
    this._type_icon_map = {
      "Collection": "collection.svg",
      "AuthorTopic": "iconmonstr-pen-17.svg",
      "TocCategory": "iconmonstr-view-6.svg",
      "PersonTopic": "iconmonstr-hashtag-1.svg",
      "Topic": "iconmonstr-hashtag-1.svg",
      "ref": "iconmonstr-book-15.svg",
      "search": "iconmonstr-magnifier-2.svg",
      "Term": "iconmonstr-script-2.svg",
      "User": "iconmonstr-user-2%20%281%29.svg"
    }
  }
  componentDidMount() {
    this.initAutocomplete();
    window.addEventListener('keydown', this.handleFirstTab);
  }
  _type_icon(item) {
    if (item.type === "User" && item.pic !== "") {
      return item.pic;
    } else {
      return `/static/icons/${this._type_icon_map[item.type]}`;
    }
  }
  _searchOverrideRegex() {
    return RegExp(`^${RegExp.escape(this._searchOverridePre)}(.*)${RegExp.escape(this._searchOverridePost)}`);
  }
  // Returns true if override is caught.
  catchSearchOverride(query) {
    const override = query.match(this._searchOverrideRegex());
    if (override) {
      if (Sefaria.site) {
        Sefaria.track.event("Search", "Search Box Navigation - Book Override", override[1]);
      }
      this.closeSearchAutocomplete();
      this.showSearch(override[1]);
      $(ReactDOM.findDOMNode(this)).find("input.search").val(override[1]);
      return true;
    }
    return false;
  }
  initAutocomplete() {
    $.widget( "custom.sefariaAutocomplete", $.ui.autocomplete, {
      _renderItem: function(ul, item) {
        const override = item.label.match(this._searchOverrideRegex());
        const is_hebrew = Sefaria.hebrew.isHebrew(item.label);
        return $( "<li></li>" )
          .addClass('ui-menu-item')
          .data( "item.autocomplete", item )
          .toggleClass("search-override", !!override)
          .toggleClass("hebrew-result", !!is_hebrew)
          .toggleClass("english-result", !is_hebrew)
          .append(`<img alt="${item.type}" class="ac-img-${item.type === "User" && item.pic === "" ? "UserPlaceholder" : item.type}" src="${this._type_icon(item)}">`)
          .append( $(`<a href="${this.getURLForObject(item.type, item.key)}" role='option' data-type-key="${item.type}-${item.key}"></a>` ).text( item.label ) )
          .appendTo( ul );
      }.bind(this)
    });
    const anchorSide = Sefaria.interfaceLang === "hebrew" ? "right+" : "left-";
    const sideGap = this.props.fullWidth ? 55 : Sefaria.interfaceLang === "hebrew" ? 38 : 40;
    $(ReactDOM.findDOMNode(this)).find("input.search").sefariaAutocomplete({
      position: {my: anchorSide + sideGap + " top+18", at: anchorSide + "0 bottom"},
      minLength: 3,
      open: function($event, ui) {
          const $widget = $("ul.ui-autocomplete");
          $(".readerApp > .header").append($widget);
      },
      select: ( event, ui ) => {
        event.preventDefault();

        if (this.catchSearchOverride(ui.item.label)) {
          return false;
        }

        this.redirectToObject(ui.item.type, ui.item.key);
        $(".ui-state-focus").removeClass("ui-state-focus");

        return false;
      },
      focus: ( event, ui ) => {
        event.preventDefault();
        $(ReactDOM.findDOMNode(this)).find("input.search").val(ui.item.label);
        $(".ui-state-focus").removeClass("ui-state-focus");
        $(`.ui-menu-item a[data-type-key="${ui.item.type}-${ui.item.key}"]`).parent().addClass("ui-state-focus");
      },
      source: (request, response) => Sefaria.getName(request.term)
        .then(d => {
          const comps = d["completion_objects"].map(o => {
            const c = {...o};
            c["value"] = `${o['title']}${o["type"] === "ref" ? "" :` (${o["type"]})`}`;
            c["label"] = o["title"];
            return c;
          });
          if (comps.length > 0) {
            const q = `${this._searchOverridePre}${request.term}${this._searchOverridePost}`;
            response([{value: "SEARCH_OVERRIDE", label: q, type: "search"}].concat(comps));
          } else {
            response([])
          }
        }, e => response([]))
    });
  }
  showVirtualKeyboardIcon(show){
    if(document.getElementById('keyboardInputMaster')){ //if keyboard is open, ignore.
      return; //this prevents the icon from flashing on every key stroke.
    }
    if(Sefaria.interfaceLang === 'english' && !this.props.hideHebrewKeyboard){
      $(ReactDOM.findDOMNode(this)).find(".keyboardInputInitiator").css({"display": show ? "inline" : "none"});
    }
  }
  focusSearch(e) {
    const parent = document.getElementById('searchBox');
    this.setState({searchFocused: true});
    this.showVirtualKeyboardIcon(true);
  }
  blurSearch(e) {
    // check that you're actually focusing in on element outside of searchBox
    // see 2nd answer https://stackoverflow.com/questions/12092261/prevent-firing-the-blur-event-if-any-one-of-its-children-receives-focus/47563344
    const parent = document.getElementById('searchBox');
    if (!parent.contains(e.relatedTarget)) {
      if (!document.getElementById('keyboardInputMaster')) {
        // if keyboard is open, don't just close it and don't close search
        this.setState({searchFocused: false});
      }
      this.showVirtualKeyboardIcon(false);
    }
  }
  showSearch(query) {
    query = query.trim();
    if (typeof sjs !== "undefined") {
      query = encodeURIComponent(query);
      window.location = `/search?q=${query}`;
      return;
    }
    this.props.showSearch(query);

    $(ReactDOM.findDOMNode(this)).find("input.search").sefariaAutocomplete("close");
    this.props.onNavigate && this.props.onNavigate();
  }
  getURLForObject(type, key) {
    if (type === "Collection") {
      return `/collections/${key}`;
    } else if (type === "TocCategory") {
      return `/texts/${key.join('/')}`;
    } else if (type in {"Topic": 1, "PersonTopic": 1, "AuthorTopic": 1}) {
      return `/topics/${key}`;
    } else if (type === "ref") {
      return `/${key.replace(/ /g, '_')}`;
    } else if (type === "User") {
      return `/profile/${key}`;
    }
  }
  redirectToObject(type, key) {
    Sefaria.track.event("Search", `Search Box Navigation - ${type}`, key);
    this.closeSearchAutocomplete();
    this.clearSearchBox();
    const url = this.getURLForObject(type, key);
    const handled = this.props.openURL(url);
    if (!handled) {
      window.location = url;
    }
    this.props.onNavigate && this.props.onNavigate();
  }
  submitSearch(query) {
    Sefaria.getName(query)
      .then(d => {
        // If the query isn't recognized as a ref, but only for reasons of capitalization. Resubmit with recognizable caps.
        const repairedCaseVariant = Sefaria.repairCaseVariant(query, d);
        if (repairedCaseVariant !== query) {
          this.submitSearch(repairedCaseVariant);
          return;
        }
        const repairedQuery = Sefaria.repairGershayimVariant(query, d);
        if (repairedQuery !== query) {
          this.submitSearch(repairedQuery);
          return;
        }

        if (d["is_ref"]) {
          var action = d["is_book"] ? "Search Box Navigation - Book" : "Search Box Navigation - Citation";
          Sefaria.track.event("Search", action, query);
          this.clearSearchBox();
          this.props.onRefClick(d["ref"]);  //todo: pass an onError function through here to the panel onError function which redirects to search
          this.props.onNavigate && this.props.onNavigate();

        } else if (!!d["topic_slug"]) {
          Sefaria.track.event("Search", "Search Box Navigation - Topic", query);
          this.clearSearchBox();
          this.props.openTopic(d["topic_slug"]);
          this.props.onNavigate && this.props.onNavigate();

        } else if (d["type"] === "Person" || d["type"] === "Collection" || d["type"] === "TocCategory") {
          this.redirectToObject(d["type"], d["key"]);
        } else {
          Sefaria.track.event("Search", "Search Box Search", query);
          this.closeSearchAutocomplete();
          this.showSearch(query);
        }
      });
  }
  closeSearchAutocomplete() {
    $(ReactDOM.findDOMNode(this)).find("input.search").sefariaAutocomplete("close");
  }
  clearSearchBox() {
    $(ReactDOM.findDOMNode(this)).find("input.search").val("").sefariaAutocomplete("close");
  }
  handleSearchKeyUp(event) {
    if (event.keyCode !== 13 || $(".ui-state-focus").length > 0) { return; }
    const query = $(event.target).val();
    if (!query) { return; }
    if (this.catchSearchOverride(query)) { return; }
    this.submitSearch(query);
  }
  handleSearchButtonClick(event) {
    const query = $(ReactDOM.findDOMNode(this)).find(".search").val();
    if (query) {
      this.submitSearch(query);
    } else {
      $(ReactDOM.findDOMNode(this)).find(".search").focus();
    }
  }
  render() {
    const inputClasses = classNames({
      search: 1,
      serif: 1,
      keyboardInput: Sefaria.interfaceLang === "english",
      hebrewSearch: Sefaria.interfaceLang === "hebrew"
    });
    const searchBoxClasses = classNames({searchBox: 1, searchFocused: this.state.searchFocused});

    return (
      <div id="searchBox" className={searchBoxClasses}>
        <SearchButton onClick={this.handleSearchButtonClick} />
        <input className={inputClasses}
          id="searchInput"
          placeholder={Sefaria._("Search")}
          onKeyUp={this.handleSearchKeyUp}
          onFocus={this.focusSearch}
          onBlur={this.blurSearch}
          maxLength={75}
          title={Sefaria._("Search for Texts or Keywords Here")} />
      </div>
    );
  }
}
SearchBar.propTypes = {
  onRefClick:         PropTypes.func.isRequired,
  showSearch:         PropTypes.func.isRequired,
  openTopic:          PropTypes.func.isRequired,
  openURL:            PropTypes.func.isRequired,
  fullWidth:          PropTypes.bool,
  hideHebrewKeyboard: PropTypes.bool,
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
        <img src="/static/icons/bookmarks.svg" />
      </a>
      <a href="/notifications" aria-label="See New Notifications" key={`notificationCount-C-${unread}`} className={notificationsClasses}>
        <img src="/static/icons/notification.svg" />
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
        <SearchBar
          onRefClick={onRefClick}
          showSearch={showSearch}
          openTopic={openTopic}
          openURL={openURL}
          onNavigate={close}
          fullWidth={true}
          hideHebrewKeyboard={true} />
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
            <img src="/static/icons/bookmarks.svg" />
            <InterfaceText>Saved & History</InterfaceText>
          </a>
          <a href="/notifications" onClick={close}>
            <img src="/static/icons/notification.svg" />
            <InterfaceText>Notifications</InterfaceText>
          </a>
        </> : null }

        <a href="/about">
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

  const loadFeedBucket = (e) => {
    const s = document.createElement('script');
        s.module = true;
        s.defer = true;
        s.src = "https://cdn.feedbucket.app/assets/feedbucket.js";
        s.dataset.feedbucket = '0csPeBQ216w32NZdoqnk';
        document.head.appendChild(s);
        const crossImage =document.querySelector("#crossImage");
        crossImage.classList.toggle('hidden');

        const feedbucket = document.querySelector("feedbucket-app");
        console.log(feedbucket.classList)
        // Remove the event listener so the script isn't loaded multiple times
        feedbucket.classList.toggle('hidden');
        if(feedbucket.classList.toggle('hidden')){
          feedbucket.classList.remove('hidden');
          crossImage.classList.remove('hidden');
        }else{
          feedbucket.classList.add('hidden');
          crossImage.classList.add('hidden');
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
                <a className={`${(Sefaria.interfaceLang == 'hebrew') ? 'active':''}`} href={`/interface/hebrew?next=${getCurrentPage()}`} id="select-hebrew-interface-link">བོད་ཡིག</a>
                <a className={`${(Sefaria.interfaceLang == 'english') ? 'active':''}`} href={`/interface/english?next=${getCurrentPage()}`} id="select-english-interface-link">English</a>
              </div>
              <div><a className="interfaceLinks-row" id="help-link" onClick={loadFeedBucket}>
                <InterfaceText>Feedback Tool</InterfaceText>
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
      <a href={"/interface/hebrew?next=" + currentURL} className="int-he">བོད་ཡིག</a>
      <span className="separator">•</span>
      <a href={"/interface/english?next=" + currentURL} className="int-en inactive">English</a>
    </>
    :
    <>
      <a href={"/interface/english?next=" + currentURL} className="int-en">English</a>
      <span className="separator">•</span>
      <a href={"/interface/hebrew?next=" + currentURL} className="int-he inactive">བོད་ཡིག</a>
    </>;

  return (
    <div className="mobileInterfaceLanguageToggle">
      <img src="/static/icons/globe-wire.svg" />
      {links}
    </div>
  );
};


const HelpButton = () => {
  const url = Sefaria._v({he: "/collections/help-center", en:"/collections/help-center"});
  return (
    <div className="help">
      <a href={url}>
        <img src="/static/img/help.svg" alt={Sefaria._("Help")}/>
      </a>
    </div>
  );
};


export default Header;
