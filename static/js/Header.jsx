const {
  ReaderNavigationMenuSearchButton,
  GlobalWarningMessage,
  TestMessage,
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
    this._searchOverridePre = 'Search for: "';
    this._searchOverridePost = '"';
  }
  componentDidMount() {
    this.initAutocomplete();
    window.addEventListener('keydown', this.handleFirstTab);
    if (this.state.menuOpen == "search" && this.state.searchQuery === null) {
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
      _renderItem: function( ul, item) {
        var override = item.label.match(this._searchOverrideRegex());
		return $( "<li></li>" )
			.data( "item.autocomplete", item )
            .toggleClass("search-override", !!override)
			.append( $( "<a role='option'></a>" ).text( item.label ) )
			.appendTo( ul );
	  }.bind(this)
    });
    $(ReactDOM.findDOMNode(this)).find("input.search").sefaria_autocomplete({
      position: {my: "left-12 top+14", at: "left bottom"},
      minLength: 3,
      select: function( event, ui ) {
        $(ReactDOM.findDOMNode(this)).find("input.search").val(ui.item.value);  // This will disappear when the next line executes, but the eye can sometimes catch it.
        this.submitSearch(ui.item.value);
        return false;
      }.bind(this),

      source: function(request, response) {
        Sefaria.lookup(
            request.term,
            d => {
              if (d["completions"].length > 0) {
                response(d["completions"].concat([`${this._searchOverridePre}${request.term}${this._searchOverridePost}`]))
              } else {
                response([])
              }
            },
            e => response([])
        );
      }.bind(this)
    });
  }
  showVirtualKeyboardIcon(show){
      if(document.getElementById('keyboardInputMaster')){//if keyboard is open, ignore.
        return; //this prevents the icon from flashing on every key stroke.
      }
      if(this.props.interfaceLang == 'english'){
          var opacity = show ? 0.4 : 0;
          $(ReactDOM.findDOMNode(this)).find(".keyboardInputInitiator").css({"opacity": opacity});
      }
  }
  showDesktop() {
    if (this.props.panelsOpen == 0) {
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
  showAccount(e) {
    e.preventDefault();
    if (typeof sjs !== "undefined") {
      window.location = "/my/profile";
      return;
    }
    if (!this.state.profile || Sefaria._uid !== this.state.profile.id) {
      this.props.openProfile(Sefaria.slug, Sefaria.full_name);
    }
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
  submitSearch(query) {
    var override = query.match(this._searchOverrideRegex());
    if (override) {
      if (Sefaria.site) { Sefaria.track.event("Search", "Search Box Navigation - Book Override", override[1]); }
      this.closeSearchAutocomplete();
      this.showSearch(override[1]);
      return;
    }

    Sefaria.lookup(query, function(d) {
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
      } else if (d["type"] == "Person") {
        Sefaria.track.event("Search", "Search Box Navigation - Person", query);
        this.closeSearchAutocomplete();
        this.showPerson(d["key"]);
      } else if (d["type"] == "Group") {
        Sefaria.track.event("Search", "Search Box Navigation - Group", query);
        this.closeSearchAutocomplete();
        this.showGroup(d["key"]);
      } else if (d["type"] == "TocCategory") {
        Sefaria.track.event("Search", "Search Box Navigation - Category", query);
        this.closeSearchAutocomplete();
        this.showLibrary(d["key"]);  // "key" holds the category path
      } else {
        Sefaria.track.event("Search", "Search Box Search", query);
        this.closeSearchAutocomplete();
        this.showSearch(query);
      }
    }.bind(this));
  }
  closeSearchAutocomplete() {
    $(ReactDOM.findDOMNode(this)).find("input.search").sefaria_autocomplete("close");
  }
  clearSearchBox() {
    $(ReactDOM.findDOMNode(this)).find("input.search").val("").sefaria_autocomplete("close");
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
                          setUnreadNotificationsCount={this.props.setUnreadNotificationsCount}
                          handleInAppLinkClick={this.props.handleInAppLinkClick}
                          hideNavHeader={true}
                          analyticsInitialized={this.props.analyticsInitialized}
                          getLicenseMap={this.props.getLicenseMap}
                          translateISOLanguageCode={this.props.translateISOLanguageCode}
                          toggleSignUpModal={this.props.toggleSignUpModal}/>) : null;


    var notificationsClasses = classNames({notifications: 1, unread: this.state.notificationCount > 0});
    var nextParam = "?next=" + encodeURIComponent(Sefaria.util.currentPath());
    var headerMessage = this.props.headerMessage ?
                          (<div className="testWarning" onClick={this.showTestMessage} >{ this.props.headerMessage }</div>) :
                          null;
    var loggedInLinks  = (<div className="accountLinks">
                            <a href="/account" className="account" onClick={this.showAccount}><img src="/static/img/user-64.png" alt="My Account"/></a>
                            <a href="/notifications" aria-label="See New Notifications" className={notificationsClasses} onClick={this.showNotifications}>{this.state.notificationCount}</a>
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
