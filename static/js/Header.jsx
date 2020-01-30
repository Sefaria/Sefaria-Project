const {
  ReaderNavigationMenuSearchButton,
  GlobalWarningMessage,
  TestMessage,
  ProfilePic,
}                = require('./Misc');
const React      = require('react');
const PropTypes  = require('prop-types');
const ReactDOM   = require('react-dom');
const classNames = require('classnames');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const ReaderPanel= require('./ReaderPanel');
import Component from 'react-class';


class Header extends Component {
  constructor(props) {
    super(props);

    this.state = props.initialState;
    this._searchOverridePre = Sefaria._('Search for') +': "';
    this._searchOverridePost = '"';
    this._type_icon_map = {
      "Group": "iconmonstr-share-6.svg",
      "Person": "iconmonstr-pen-17.svg",
      "TocCategory": "iconmonstr-view-6.svg",
      "Topic": "iconmonstr-hashtag-1.svg",
      "ref": "iconmonstr-book-15.svg",
      "search": "iconmonstr-magnifier-2.svg",
      "Term": "iconmonstr-script-2.svg",
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
    this.setState({notificationCount: Sefaria.notificationCount || 0});
  }
  _searchOverrideRegex() {
    return RegExp(`^${RegExp.escape(this._searchOverridePre)}(.*)${RegExp.escape(this._searchOverridePost)}`);
  }

  initAutocomplete() {
    $.widget( "custom.sefaria_autocomplete", $.ui.autocomplete, {
      _renderItem: function(ul, item) {
        const override = item.label.match(this._searchOverrideRegex());
        return $( "<li></li>" )
          .addClass('ui-menu-item')
          .data( "item.autocomplete", item )
          .toggleClass("search-override", !!override)
          .append(`<img alt="${item.type}" src="/static/icons/${this._type_icon_map[item.type]}">`)
          .append( $( "<a role='option' data-value='" + item.value + "'></a>" ).text( item.label ) )
          .appendTo( ul );
      }.bind(this)
    });
    const anchorSide = this.props.interfaceLang === "hebrew" ? "right+" : "left-";
    $(ReactDOM.findDOMNode(this)).find("input.search").sefaria_autocomplete({
      position: {my: anchorSide + "12 top+17", at: anchorSide + "0 bottom"},
      minLength: 3,
      select: ( event, ui ) => {
        debugger;
        $(ReactDOM.findDOMNode(this)).find("input.search").val(ui.item.value);  // This will disappear, but the eye can sometimes catch it.

        const override = ui.item.label.match(this._searchOverrideRegex());
        if (override) {
          if (Sefaria.site) { Sefaria.track.event("Search", "Search Box Navigation - Book Override", override[1]); }
          this.closeSearchAutocomplete();
          this.showSearch(override[1]);
          return false;
        }

        this.redirectToObject(ui.item.type, ui.item.key);
        return false;
      },
      focus: function( event, ui ) {
        $(".ui-state-focus").removeClass("ui-state-focus");
        $(".ui-menu-item a[data-value='" + ui.item.value + "']").addClass("ui-state-focus");
      },
      source: (request, response) => Sefaria.getName(request.term)
        .then(d => {
          const comps = d["completion_objects"].map(o => ({value: o["title"], label: o["title"], key: o["key"], type: o["type"]}));
          if (comps.length > 0) {
            const q = `${this._searchOverridePre}${request.term}${this._searchOverridePost}`;
            response(comps.concat([{value: q, label: q, type: "search"}]));
          } else {
            response([])
          }
        }, e => response([]))
    });
  }
  showVirtualKeyboardIcon(show){
      if(document.getElementById('keyboardInputMaster')){//if keyboard is open, ignore.
        return; //this prevents the icon from flashing on every key stroke.
      }
      if(this.props.interfaceLang === 'english'){
          var opacity = show ? 0.4 : 0;
          $(ReactDOM.findDOMNode(this)).find(".keyboardInputInitiator").css({"opacity": opacity});
      }
  }
  showDesktop() {
    if (this.props.panelsOpen === 0) {
      const { last_place } = Sefaria;
      if (last_place && last_place.length) {
        this.handleRefClick(last_place[0].ref, last_place[0].versions);
      }
    }
    this.props.setCentralState({menuOpen: null});
    this.clearSearchBox();
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
  openMyProfile(e) {
    e.preventDefault();
    if (typeof sjs !== "undefined") {
      window.location = "/my/profile";
      return;
    }
    //if (!this.state.profile || Sefaria._uid !== this.state.profile.id) {
      this.props.openProfile(Sefaria.slug, Sefaria.full_name);
    //}
    this.clearSearchBox();
  }
  showNotifications(e) {
    e.preventDefault();
    if (typeof sjs !== "undefined") {
      window.location = "/notifications";
      return;
    }
    this.props.setCentralState({menuOpen: "notifications"});
    this.clearSearchBox();
  }
  showUpdates() {
    // todo: not used yet
    if (typeof sjs !== "undefined") {
      window.location = "/updates";
      return;
    }
    this.props.setCentralState({menuOpen: "updates"});
    this.clearSearchBox();
  }
  showTestMessage() {
    this.props.setCentralState({showTestMessage: true});
  }
  hideTestMessage() {
    this.props.setCentralState({showTestMessage: false});
  }
  redirectToObject(type, key) {
      if (type === "Person") {
        Sefaria.track.event("Search", "Search Box Navigation - Person", key);
        this.closeSearchAutocomplete();
        this.showPerson(key);
      } else if (type === "Group") {
        Sefaria.track.event("Search", "Search Box Navigation - Group", key);
        this.closeSearchAutocomplete();
        this.showGroup(key);
      } else if (type === "TocCategory") {
        Sefaria.track.event("Search", "Search Box Navigation - Category", key);
        this.closeSearchAutocomplete();
        this.showLibrary(key);  // "key" holds the category path
      } else if (type === "Topic") {
        Sefaria.track.event("Search", "Search Box Navigation - Topic", key);
        this.closeSearchAutocomplete();
        this.showTopic(key);
      } else if (type === "ref") {
        Sefaria.track.event("Search", "Search Box Navigation - Book", key);
        this.closeSearchAutocomplete();
        this.clearSearchBox();
        this.handleRefClick(key);
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
        } else if (d["type"] === "Person" || d["type"] === "Group" || d["type"] === "TocCategory" || d["type"] === "Topic") {
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
  showTopic(slug) {
    //todo: This could be done in React
    window.location = "/topics/" + slug;
  }
  showPerson(key) {
    //todo: move people into React
    window.location = "/person/" + key;
  }
  showGroup(key) {
    //todo: move people into React
    key = key.replace(" ","-");
    window.location = "/groups/" + key;
  }
  handleLibraryClick(e) {
    e.preventDefault();
    if (typeof sjs !== "undefined") {
      window.location = "/texts";
      return;
    }
    if (this.state.menuOpen === "home") {
      return;
    } else if (this.state.menuOpen === "navigation" && this.state.navigationCategories.length == 0) {
      this.showDesktop();
    } else {
      this.showLibrary();
    }
    $(".wrapper").remove();
    $("#footer").remove();
  }
  handleRefClick(ref, currVersions) {
    if (this.props.headerMode) {
      window.location.assign("/" + ref);
      return;
    }
    this.props.onRefClick(ref, currVersions);
  }
  handleSearchKeyUp(event) {
    if (event.keyCode === 13) {
      var query = $(event.target).val();
      if (query) {
        this.submitSearch(query);
      }
    }
  }
  handleSearchButtonClick(event) {
    var query = $(ReactDOM.findDOMNode(this)).find(".search").val();
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
                          updateSearchFilter={this.props.updateSearchFilter}
                          updateSearchOptionField={this.props.updateSearchOptionField}
                          updateSearchOptionSort={this.props.updateSearchOptionSort}
                          registerAvailableFilters={this.props.registerAvailableFilters}
                          searchInGroup={this.props.searchInGroup}
                          setUnreadNotificationsCount={this.props.setUnreadNotificationsCount}
                          handleInAppLinkClick={this.props.handleInAppLinkClick}
                          hideNavHeader={true}
                          analyticsInitialized={this.props.analyticsInitialized}
                          getLicenseMap={this.props.getLicenseMap}
                          translateISOLanguageCode={this.props.translateISOLanguageCode}
                          toggleSignUpModal={this.props.toggleSignUpModal}
                          openProfile={this.props.openProfile}
                          showLibrary={this.showLibrary}
                        />) : null;


    var notificationsClasses = classNames({notifications: 1, unread: this.state.notificationCount > 0});
    var nextParam = "?next=" + encodeURIComponent(Sefaria.util.currentPath());
    var headerMessage = this.props.headerMessage ?
                          (<div className="testWarning" onClick={this.showTestMessage} >{ this.props.headerMessage }</div>) :
                          null;
    var loggedInLinks  = (<div className="accountLinks">
                            <a href="/notifications" aria-label="See New Notifications" className={notificationsClasses} onClick={this.showNotifications}>{this.state.notificationCount}</a>
                            <a href="/my/profile" className="my-profile" onClick={this.openMyProfile}><ProfilePic len={24} url={Sefaria.profile_pic_url} name={Sefaria.full_name} /></a>
                         </div>);
    var loggedOutLinks = (<div className="accountLinks">
                           <a className="login signupLink" href={"/register" + nextParam}>
                             <span className="int-en">Sign up</span>
                             <span className="int-he">הרשם</span>
                           </a>
                           <a className="login loginLink" href={"/login" + nextParam}>
                             <span className="int-en">Log in</span>
                             <span className="int-he">התחבר</span>
                           </a>
                         </div>);
    // Header should not show box-shadow over panels that have color line
    var hasColorLine = ["sheets", "sheets meta"];
    var hasBoxShadow = (!!this.state.menuOpen && hasColorLine.indexOf(this.state.menuOpen) == -1);
    var headerInnerClasses = classNames({headerInner: 1, boxShadow: hasBoxShadow});
    var inputClasses = classNames({search: 1, keyboardInput: this.props.interfaceLang == "english", hebrewSearch: this.props.interfaceLang == "hebrew"});
    return (<div className="header" role="banner">
              <div className={headerInnerClasses}>
                <div className="headerNavSection">
                    <a href="/texts" aria-label={this.state.menuOpen === "navigation" && this.state.navigationCategories.length == 0 ? "Return to text" : "Open the Sefaria Library Table of Contents" } className="library" onClick={this.handleLibraryClick}><i className="fa fa-bars"></i></a>
                    <div  className="searchBox">
                      <ReaderNavigationMenuSearchButton onClick={this.handleSearchButtonClick} />
                      <input className={inputClasses}
                             id="searchInput"
                             placeholder={Sefaria._("Search")}
                             onKeyUp={this.handleSearchKeyUp}
                             onFocus={this.showVirtualKeyboardIcon.bind(this, true)}
                             onBlur={this.showVirtualKeyboardIcon.bind(this, false)}
                             maxLength={75}
                      title={Sefaria._("Search for Texts or Keywords Here")}/>
                    </div>
                </div>
                <div className="headerHomeSection">
                    {Sefaria._siteSettings.TORAH_SPECIFIC ?
                      <a className="home" href="/?home" ><img src="/static/img/logo.svg" alt="Sefaria Logo"/></a> :
                      null }
                </div>
                <div className="headerLinksSection">
                  { headerMessage }
                  { Sefaria.loggedIn ? loggedInLinks : loggedOutLinks }
                </div>
              </div>
              { viewContent ?
                (<div className="headerNavContent">
                  {viewContent}
                 </div>) : null}
              { this.state.showTestMessage ? <TestMessage hide={this.hideTestMessage} /> : null}
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
  searchInGroup:               PropTypes.func,
  setUnreadNotificationsCount: PropTypes.func,
  handleInAppLinkClick:        PropTypes.func,
  headerMesssage:              PropTypes.string,
  panelsOpen:                  PropTypes.number,
  analyticsInitialized:        PropTypes.bool,
  getLicenseMap:               PropTypes.func.isRequired,
  toggleSignUpModal:           PropTypes.func.isRequired,
  openProfile:                 PropTypes.func.isRequired,
};


module.exports = Header;
