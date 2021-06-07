import {
  ReaderNavigationMenuSearchButton,
  GlobalWarningMessage,
  ProfilePic,
  InterfaceLanguageMenu,
  InterfaceText
} from './Misc';
import React, { useState, useEffect, useRef} from 'react';
import PropTypes  from 'prop-types';
import ReactDOM  from 'react-dom';
import classNames  from 'classnames';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import ReaderPanel from './ReaderPanel';
import Component from 'react-class';


class Header extends Component {
  constructor(props) {
    super(props);

    this.state = props.initialState;
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
    }
  }
  _type_icon(item) {
    if (item.type === "User") {
      return item.pic;
    } else {
      return `/static/icons/${this._type_icon_map[item.type]}`;
    }
  }
  componentDidMount() {
    this.initAutocomplete();
    window.addEventListener('keydown', this.handleFirstTab);
    if (this.state.menuOpen === "search" && this.state.searchQuery === null) {
      // If this is an empty search page, comically, lazily make it full
      this.props.showSearch("Search");
    }
  }
  componentWillReceiveProps(nextProps) {
    if (nextProps.initialState) {
      this.setState(nextProps.initialState);
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
    $.widget( "custom.sefaria_autocomplete", $.ui.autocomplete, {
      _renderItem: function(ul, item) {
        const override = item.label.match(this._searchOverrideRegex());
        const is_hebrew = Sefaria.hebrew.isHebrew(item.label);
        return $( "<li></li>" )
          .addClass('ui-menu-item')
          .data( "item.autocomplete", item )
          .toggleClass("search-override", !!override)
          .toggleClass("hebrew-result", !!is_hebrew)
          .toggleClass("english-result", !is_hebrew)
          .append(`<img alt="${item.type}" class="ac-img-${item.type}" src="${this._type_icon(item)}">`)
          .append( $(`<a href="${this.getURLForObject(item.type, item.key)}" role='option' data-type-key="${item.type}-${item.key}"></a>` ).text( item.label ) )
          .appendTo( ul );
      }.bind(this)
    });
    const anchorSide = this.props.interfaceLang === "hebrew" ? "right+" : "left-";
    const sideGap = this.props.interfaceLang === "hebrew" ? 38 : 40;
    $(ReactDOM.findDOMNode(this)).find("input.search").sefaria_autocomplete({
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
            response(comps.concat([{value: "SEARCH_OVERRIDE", label: q, type: "search"}]));
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
      if(this.props.interfaceLang === 'english'){
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
  handleLibraryClick(e) {
    e.preventDefault();
    if (typeof sjs !== "undefined") {
      window.location = "/texts";
      return;
    }
    this.showLibrary();
  }
  showLibrary(categories) {
    this.props.showLibrary(categories);
    this.clearSearchBox();
  }
  showSearch(query) {
    query = query.trim();
    if (typeof sjs !== "undefined") {
      query = encodeURIComponent(query);
      window.location = `/search?q=${query}`;
      return;
    }
    this.props.showSearch(query);
    $(ReactDOM.findDOMNode(this)).find("input.search").sefaria_autocomplete("close");
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
  }
  submitSearch(query) {
    Sefaria.getName(query)
      .then(d => {
        // If the query isn't recognized as a ref, but only for reasons of capitalization. Resubmit with recognizable caps.
        if (Sefaria.isACaseVariant(query, d)) {
          this.submitSearch(Sefaria.repairCaseVariant(query, d));
          return;
        }

        if (d["is_ref"]) {
          var action = d["is_book"] ? "Search Box Navigation - Book" : "Search Box Navigation - Citation";
          Sefaria.track.event("Search", action, query);
          this.clearSearchBox();
          this.handleRefClick(d["ref"]);  //todo: pass an onError function through here to the panel onError function which redirects to search
        } else if (!!d["topic_slug"]) {
          Sefaria.track.event("Search", "Search Box Navigation - Topic", query);
          this.clearSearchBox();
          this.props.openTopic(d["topic_slug"]);
        } else if (d["type"] === "Group" || d["type"] === "TocCategory") {
          this.redirectToObject(d["type"], d["key"]);
        } else {
          Sefaria.track.event("Search", "Search Box Search", query);
          this.closeSearchAutocomplete();
          this.showSearch(query);
        }
      });
  }
  closeSearchAutocomplete() {
    $(ReactDOM.findDOMNode(this)).find("input.search").sefaria_autocomplete("close");
  }
  clearSearchBox() {
    $(ReactDOM.findDOMNode(this)).find("input.search").val("").sefaria_autocomplete("close");
  }
  handleRefClick(ref, currVersions) {
    if (this.props.headerMode) {
      window.location.assign("/" + ref);
      return;
    }
    this.props.onRefClick(ref, currVersions);
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
  handleFirstTab(e) {
    if (e.keyCode === 9) { // tab (i.e. I'm using a keyboard)
      document.body.classList.add('user-is-tabbing');
      window.removeEventListener('keydown', this.handleFirstTab);
    }
  }
  render() {
    var viewContent = this.state.menuOpen ?
                        (<ReaderPanel
                          initialState={this.state}
                          interfaceLang={this.props.interfaceLang}
                          setCentralState={this.props.setCentralState}
                          multiPanel={true}
                          onNavTextClick={this.props.onRefClick}
                          onSearchResultClick={this.props.onRefClick}
                          onRecentClick={this.props.onRecentClick}
                          setDefaultOption={this.props.setDefaultOption}
                          onQueryChange={this.props.onQueryChange}
                          updateSearchTab={this.props.updateSearchTab}
                          updateTopicsTab={this.props.updateTopicsTab}
                          updateSearchFilter={this.props.updateSearchFilter}
                          updateSearchOptionField={this.props.updateSearchOptionField}
                          updateSearchOptionSort={this.props.updateSearchOptionSort}
                          registerAvailableFilters={this.props.registerAvailableFilters}
                          searchInCollection={this.props.searchInCollection}
                          setUnreadNotificationsCount={this.props.setUnreadNotificationsCount}
                          hideNavHeader={true}
                          layoutWidth={100}
                          analyticsInitialized={this.props.analyticsInitialized}
                          getLicenseMap={this.props.getLicenseMap}
                          toggleSignUpModal={this.props.toggleSignUpModal}
                        />) : null;

    // Header should not show box-shadow over panels that have color line
    const hasColorLine = ["sheets", "sheets meta"];
    const hasBoxShadow = (!!this.state.menuOpen && hasColorLine.indexOf(this.state.menuOpen) === -1);
    const headerInnerClasses = classNames({headerInner: 1, boxShadow: hasBoxShadow});
    const inputClasses = classNames({search: 1, serif: 1, keyboardInput: this.props.interfaceLang === "english", hebrewSearch: this.props.interfaceLang === "hebrew"});
    const searchBoxClasses = classNames({searchBox: 1, searchFocused: this.state.searchFocused});
    return (<div className="header" role="banner">
              <div className={headerInnerClasses}>
                <div className="headerNavSection">
                    <a href="/texts" aria-label={this.state.menuOpen === "navigation" && this.state.navigationCategories.length == 0 ? "Return to text" : "Open the Sefaria Library Table of Contents" } className="library"><i className="fa fa-bars"></i></a>
                    <div id="searchBox" className={searchBoxClasses}>
                      <ReaderNavigationMenuSearchButton onClick={this.handleSearchButtonClick} />
                      <input className={inputClasses}
                             id="searchInput"
                             placeholder={Sefaria._("Search")}
                             onKeyUp={this.handleSearchKeyUp}
                             onFocus={this.focusSearch}
                             onBlur={this.blurSearch}
                             maxLength={75}
                      title={Sefaria._("Search for Texts or Keywords Here")}/>
                    </div>
                </div>
                <div className="headerHomeSection">
                    { Sefaria._siteSettings.TORAH_SPECIFIC ? <a className="home" href="/?home" ><img src="/static/img/logo.svg" alt="Sefaria Logo"/></a> : null }
                </div>
                <div className="headerLinksSection">
                  { Sefaria._uid ?
                      <LoggedInButtons headerMode={this.props.headerMode}/>
                      :
                      <LoggedOutButtons headerMode={this.props.headerMode}/>
                  }
                  { !Sefaria._uid && Sefaria._siteSettings.TORAH_SPECIFIC ? <HelpButton/>: null}
                  { !Sefaria._uid && Sefaria._siteSettings.TORAH_SPECIFIC ? <InterfaceLanguageMenu currentLang={Sefaria.interfaceLang} /> : null}
                </div>
              </div>
              { viewContent ?
                (<div className="headerNavContent">
                  {viewContent}
                 </div>) : null}
              <GlobalWarningMessage />
            </div>);
  }
}
Header.propTypes = {
  initialState:                PropTypes.object.isRequired,
  headerMode:                  PropTypes.bool,
  setCentralState:             PropTypes.func,
  interfaceLang:               PropTypes.string,
  onRefClick:                  PropTypes.func,
  onRecentClick:               PropTypes.func,
  showLibrary:                 PropTypes.func,
  showSearch:                  PropTypes.func,
  setDefaultOption:            PropTypes.func,
  onQueryChange:               PropTypes.func,
  updateSearchFilter:          PropTypes.func,
  updateSearchOptionField:     PropTypes.func,
  updateSearchOptionSort:      PropTypes.func,
  registerAvailableFilters:    PropTypes.func,
  searchInCollection:          PropTypes.func,
  setUnreadNotificationsCount: PropTypes.func,
  headerMesssage:              PropTypes.string,
  panelsOpen:                  PropTypes.number,
  analyticsInitialized:        PropTypes.bool,
  getLicenseMap:               PropTypes.func.isRequired,
  toggleSignUpModal:           PropTypes.func.isRequired,
  openTopic:                   PropTypes.func.isRequired,
};


function LoggedOutButtons({headerMode}) {
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
    <div className="accountLinks anon">
      <a className="login loginLink" href={loginLink} key={`login${isClient}`}>
         <span className="int-en">Log in</span>
         <span className="int-he">התחבר</span>
       </a>
      <a className="login signupLink" href={registerLink} key={`register${isClient}`}>
         <span className="int-en">Sign up</span>
         <span className="int-he">הרשם</span>
      </a>
    </div>
  );
}


function LoggedInButtons({headerMode}) {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    if(headerMode){
      setIsClient(true);
    }
  }, []);
  const unread = headerMode ? ((isClient && Sefaria.notificationCount > 0) ? 1 : 0) : Sefaria.notificationCount > 0 ? 1 : 0
  const notificationsClasses = classNames({notifications: 1, unread: unread});
  return(
    <div className="accountLinks">
      <a href="/notifications" aria-label="See New Notifications" key={`notificationCount-C-${unread}`} className={notificationsClasses}>{Sefaria.notificationCount}</a>
      <ProfilePicMenu len={24} url={Sefaria.profile_pic_url} name={Sefaria.full_name} key={`profile-${isClient}-${Sefaria.full_name}`}/>
    </div>
  );
}


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
    <div ref={wrapperRef}>
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
              <div><a className="interfaceLinks-row" id="account-settings-link" href="/settings/account">
                <InterfaceText>Account Settings</InterfaceText>
              </a></div>
              <div className="interfaceLinks-row languages">
                <a className={`${(Sefaria.interfaceLang == 'hebrew') ? 'active':''}`} href={`/interface/hebrew?next=${getCurrentPage()}`} id="select-hebrew-interface-link">עברית</a>
                <a className={`${(Sefaria.interfaceLang == 'english') ? 'active':''}`} href={`/interface/english?next=${getCurrentPage()}`} id="select-english-interface-link">English</a>
              </div>
              <div><a className="interfaceLinks-row bottom" id="help-link" href="/collections/sefaria-faqs">
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


const HelpButton = () => (
    //hard-coding /help re-direct, also re-directs exist in sites/sefaria/urls.py
  <div className="help">
    {Sefaria.interfaceLang === "hebrew" ?
    <span className="int-he">
      <a href="/collections/%D7%A9%D7%90%D7%9C%D7%95%D7%AA-%D7%A0%D7%A4%D7%95%D7%A6%D7%95%D7%AA-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90">
        <img src="/static/img/help.svg" alt="עזרה" />
      </a>
    </span>
    :
    <span className="int-en">
      <a href="/collections/sefaria-faqs">
        <img src="/static/img/help.svg" alt="Help" />
      </a>
    </span>}
  </div>
);


export default Header;