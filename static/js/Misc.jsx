//const React      = require('react');
import React, { useState, useEffect } from 'react';
const ReactDOM   = require('react-dom');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
import Component      from 'react-class';


/* flexible profile picture that overrides the default image of gravatar with text with the user's initials */
class ProfilePic extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showDefault: true,
    };
  }
  showNonDefaultPic() {
    this.setState({ showDefault: false });
  }
  render() {
    const { url, name, len, outerStyle, hideOnDefault } = this.props;
    const nameArray = !!name.trim() ? name.split(/\s/) : [];
    const initials = nameArray.length > 0 ? (nameArray.length === 1 ? nameArray[0][0] : nameArray[0][0] + nameArray[nameArray.length-1][0]) : "--";
    const defaultViz = this.state.showDefault ? 'flex' : 'none';
    const profileViz = this.state.showDefault ? 'none' : 'block';
    const imageSrc = url.replace(/d=.+?(?=&|$)/, 'd=thisimagedoesntexistandshouldfail');  // replace default with non-existant image to force onLoad to fail
    return (
      <div style={outerStyle}>
        <div
          className={classNames({'default-profile-img': 1, noselect: 1, invisible: hideOnDefault})}
          style={{display: defaultViz,  width: len, height: len, fontSize: len/2}}
        >
          { `${initials}` }
        </div>
        <img
          className="img-circle profile-img"
          style={{display: profileViz, width: len, height: len, fontSize: len/2}}
          src={imageSrc}
          alt="User Profile Picture"
          onLoad={this.showNonDefaultPic}
        />
      </div>
    );
  }
}
ProfilePic.propTypes = {
  url:     PropTypes.string,
  initials:PropTypes.string,
  len:     PropTypes.number,
  hideOnDefault: PropTypes.bool,  // hide profile pic if you have are displaying default pic
};


class FilterableList extends Component {
  constructor(props) {
    super(props);
    this.state = {
      currFilter: '',
      currSortOption: props.sortOptions[0],
      displaySort: false,
      loading: true,
      data: [],
    };
  }
  componentDidMount() {
    this._isMounted = true;
    this.load();
  }
  componentWillUnmount() {
    this._isMounted = false;
  }
  load(ignoreCache) {
    this.props.getData(ignoreCache).then(data => {
      if (this._isMounted) {
        this.setState({ loading: false, data });
      }
    });
  }
  reload() {
    this.setState({ loading: true, data: [] }, () => this.load(true));
  }
  closeSort() {
    this.setState({ displaySort: false });
  }
  toggleSort() {
    this.setState({ displaySort: !this.state.displaySort });
  }
  filterFunc(item) {
    if (!this.state.currFilter) { return true; }
    return this.props.filterFunc(this.state.currFilter, item);
  }
  sortFunc(itemA, itemB) {
    return this.props.sortFunc(this.state.currSortOption, itemA, itemB);
  }
  onFilterChange(e) {
    this.setState({currFilter: e.target.value});
  }
  onSortChange(sortOption) {
    if (sortOption === this.props.currSortOption) {
      return;
    }
    this.setState({currSortOption: sortOption});
    this.closeSort();
  }
  render() {
    const { sortOptions, renderItem, renderEmptyList, renderHeader, renderFooter } = this.props;
    const { loading, currFilter, displaySort, currSortOption, data } = this.state;
    const newData = data.filter(this.filterFunc).sort(this.sortFunc);
    return (
      <div className="filterable-list">
        <div className="filter-bar">
          <div>
            <ReaderNavigationMenuSearchButton />
            <input
              type="text"
              placeholder={Sefaria._("Search")}
              name="filterableListInput"
              value={currFilter}
              onChange={this.onFilterChange}
            />
          </div>
          <div>
            { sortOptions.length ?
              <DropdownModal close={this.closeSort} isOpen={displaySort}>
                <DropdownButton
                  isOpen={displaySort}
                  toggle={this.toggleSort}
                  enText={"Sort"}
                  heText={"מיון"}
                />
                <DropdownOptionList
                  isOpen={displaySort}
                  options={sortOptions.map(option => ({type: option, name: option, heName: Sefaria._(option)}))}
                  currOptionSelected={currSortOption}
                  handleClick={this.onSortChange}
                />
              </DropdownModal>
              : null
            }
          </div>
        </div>
        {
          loading ? <LoadingMessage /> :
          ( data.length ?
            (
              <div className="filter-content">
                { !!renderHeader ? renderHeader() : null }
                { data.filter(this.filterFunc).sort(this.sortFunc).map(renderItem) }
                { !!renderFooter ? renderFooter() : null }
              </div>
            ) : ( !!renderEmptyList ? renderEmptyList() : null )
          )
        }
      </div>
    )
  }
}
FilterableList.propTypes = {
  filterFunc:  PropTypes.func.isRequired,
  sortFunc:    PropTypes.func.isRequired,
  renderItem:  PropTypes.func.isRequired,
  sortOptions: PropTypes.array.isRequired,
  getData:     PropTypes.func.isRequired,
  renderEmptyList: PropTypes.func,
  renderHeader: PropTypes.func,
  renderFooter: PropTypes.func,
};

class TabView extends Component {
  constructor(props) {
    super(props);
    this.state = {
      openTabIndex: 0,
    };
  }
  openTab(index) {
    this.setState({openTabIndex: index});
  }
  onClickTab(e) {
    let target = $(event.target);
    while (!target.attr("data-tab-index")) { target = target.parent(); }
    const tabIndex = target.attr("data-tab-index");
    this.openTab(parseInt(tabIndex));
  }
  renderTab(tab, index) {
    return (
      <div className={classNames({active: this.state.openTabIndex === index})} key={tab.text} data-tab-index={index} onClick={this.onClickTab}>
        {this.props.renderTab(tab, index)}
      </div>
    );
  }
  render() {
    return (
      <div className="tab-view">
        <div className="tab-list">
          {this.props.tabs.map(this.renderTab)}
          {this.props.tail && this.props.tail}
        </div>
        { React.Children.toArray(this.props.children)[this.state.openTabIndex] }
      </div>
    );
  }
}
TabView.propTypes = {
  tabs: PropTypes.array.isRequired,
  renderTab: PropTypes.func.isRequired,
    //tail: html/jsx
};

class DropdownOptionList extends Component {
  render() {
    return (
      <div className={(this.props.isOpen) ? "dropdown-option-list" :"dropdown-option-list hidden"}>
        <table>
          <tbody>
            {
              this.props.options.map( (option, iSortTypeObj) => {
                const tempClasses = classNames({'filter-title': 1, unselected: this.props.currOptionSelected !== option.type});
                return (
                  <tr key={option.type} className={tempClasses} onClick={()=>{ this.props.handleClick(option.type); }} tabIndex={`${iSortTypeObj}`} onKeyPress={e => {e.charCode == 13 ? this.props.handleClick(option.type) : null}} aria-label={`Sort by ${option.name}`}>
                    <td>
                      <img className="dropdown-option-check" src="/static/img/check-mark.svg" alt={`${option.name} sort selected`}/>
                    </td>
                    <td>
                      <span className="int-en">{option.name}</span>
                      <span className="int-he" dir="rtl">{option.heName}</span>
                    </td>
                  </tr>
                );
              })
            }
          </tbody>
        </table>
      </div>
    );
  }
}
DropdownOptionList.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  options: PropTypes.array.isRequired,
  currOptionSelected: PropTypes.string.isRequired,
  handleClick: PropTypes.func.isRequired,
};


class DropdownButton extends Component {
  render() {
    const { isOpen, toggle, enText, heText } = this.props;
    const filterTextClasses = classNames({ "dropdown-button": 1, active: isOpen });
    return (
      <div className={ filterTextClasses } tabIndex="0" onClick={toggle} onKeyPress={(e) => {e.charCode == 13 ? toggle(e):null}}>
        <span className="int-en">{enText}</span>
        <span className="int-he">{heText}</span>
        {isOpen ? <img src="/static/img/arrow-up.png" alt=""/> : <img src="/static/img/arrow-down.png" alt=""/>}
      </div>
    )
  }
}
DropdownButton.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  toggle: PropTypes.func.isRequired,
  enText: PropTypes.string.isRequired,
  heText: PropTypes.string.isRequired,
}

class DropdownModal extends Component {
  componentDidMount() {
    document.addEventListener('mousedown', this.handleClickOutside, false);
  }
  componentWillUnmount() {
    document.removeEventListener('mousedown', this.handleClickOutside, false);
  }
  handleClickOutside(event) {
    const domNode = ReactDOM.findDOMNode(this);
    if ((!domNode || !domNode.contains(event.target)) && this.props.isOpen) {
      this.props.close();
    }
  }
  render() {
    return (
      <div className={classNames({"dropdown-modal": 1, "position-unset": this.props.positionUnset})}>
        { this.props.children }
      </div>
    );
  }
}
DropdownModal.propTypes = {
  close:   PropTypes.func.isRequired,
  isOpen:  PropTypes.bool.isRequired,
  positionUnset: PropTypes.bool,  // for search filters
};

class Link extends Component {
  handleClick(e) {
    e.preventDefault();
    this.props.onClick();
  }
  render() {
    return <a
              className={this.props.className}
              href={this.props.href}
              onClick={this.handleClick}
              title={this.props.title}>{this.props.children}</a>
  }
}
Link.propTypes = {
  href:    PropTypes.string.isRequired,
  onClick: PropTypes.func,
  title:   PropTypes.string.isRequired,
};


class GlobalWarningMessage extends Component {
  close() {
    Sefaria.globalWarningMessage = null;
    this.forceUpdate();
  }
  render() {
    return Sefaria.globalWarningMessage ?
      <div id="globalWarningMessage">
        <i className='close fa fa-times' onClick={this.close}></i>
        <div dangerouslySetInnerHTML={ {__html: Sefaria.globalWarningMessage} }></div>
      </div>
      : null;
  }
}


class ReaderNavigationMenuSection extends Component {
  render() {
    if (!this.props.content) { return null; }
    let idstr = this.props.enableAnchor ? "navigation-" + this.props.title.toLowerCase() : "";
    return (
      <div className="readerNavSection" id={idstr}>

        {this.props.title ? (<h2>
          <span className="int-en">{this.props.title}</span>
          <span className="int-he">{this.props.heTitle}</span>
        </h2>) : null }
        {this.props.content}
      </div>
      );
  }
}
ReaderNavigationMenuSection.propTypes = {
  title:   PropTypes.string,
  heTitle: PropTypes.string,
  content: PropTypes.object,
  enableAnchor: PropTypes.bool
};
ReaderNavigationMenuSection.defaultProps = {
  enableAnchor: false
};


class TextBlockLink extends Component {
  // Monopoly card style link with category color at top
  // This component is seriously overloaded :grimacing:
  render() {
    let { book, category, title, heTitle, showSections, sref, heRef, displayValue, heDisplayValue, position, url_string, recentItem, currVersions, sideColor, saved, sheetTitle, sheetOwner, timeStamp } = this.props;
    const index    = Sefaria.index(book);
    category = category || (index ? index.primary_category : "Other");
    const style    = {"borderColor": Sefaria.palette.categoryColor(category)};
    title    = title   || (showSections ? sref : book);
    heTitle  = heTitle || (showSections ? heRef : index.heTitle);
    let byLine;
    if (!!sheetOwner && sideColor) {
      title = sheetTitle.stripHtml();
      heTitle = title;
      byLine = sheetOwner;
    }
    const subtitle = displayValue ? (
        <span className="blockLinkSubtitle">
            <span className="en">{displayValue}</span>
            <span className="he">{heDisplayValue}</span>
        </span>
    ) : null;

    position = position || 0;
    const isSheet = book === 'Sheet';
    const classes  = classNames({refLink: !isSheet, sheetLink: isSheet, blockLink: 1, recentItem, calendarLink: (subtitle != null), saved });
    url_string = url_string ? url_string : sref;
    let url;
    if (isSheet) {
      url = `/sheets/${Sefaria.normRef(url_string).replace('Sheet.','')}`
    } else {
      url = "/" + Sefaria.normRef(url_string) + Object.keys(currVersions)
        .filter(vlang=>!!currVersions[vlang])
        .map(vlang=>`&v${vlang}=${currVersions[vlang]}`)
        .join("")
        .replace("&","?");
    }

    if (sideColor) {
      return (
        <a href={url} className={classes} data-ref={sref} data-ven={currVersions.en} data-vhe={currVersions.he} data-position={position}>
          <div className="sideColorLeft" data-ref-child={true}>
            <div className="sideColor" data-ref-child={true} style={{backgroundColor: Sefaria.palette.categoryColor(category)}} />
            <div className="sideColorInner" data-ref-child={true}>
              <span className="en" data-ref-child={true}>{title}{!!sheetOwner ? (<i className="byLine">{byLine}</i>) : null}</span>
              <span className="he" data-ref-child={true}>{heTitle}{!!sheetOwner ? (<i className="byLine">{byLine}</i>) : null}</span>
            </div>
          </div>
          <div className="sideColorRight">
            { saved ? <SaveButton historyObject={{ ref: sref, versions: currVersions }} /> : null }
            { !saved && timeStamp ?
              <span>
                <span className="int-en">{ Sefaria.util.naturalTime(timeStamp) }</span>
                <span className="int-he">&rlm;{ Sefaria.util.naturalTime(timeStamp) }</span>
              </span>: null
            }
          </div>
        </a>
      );
    }
    return (<a href={url} className={classes} data-ref={sref} data-ven={currVersions.en} data-vhe={currVersions.he} data-position={position} style={style}>
              <span className="en">{title}</span>
              <span className="he">{heTitle}</span>
                {subtitle}
             </a>);
  }
}
TextBlockLink.propTypes = {
  sref:            PropTypes.string.isRequired,
  currVersions:    PropTypes.object.isRequired,
  heRef:           PropTypes.string,
  book:            PropTypes.string,
  category:        PropTypes.string,
  title:           PropTypes.string,
  heTitle:         PropTypes.string,
  displayValue:    PropTypes.string,
  heDisplayValue:  PropTypes.string,
  url_string:      PropTypes.string,
  showSections:    PropTypes.bool,
  recentItem:      PropTypes.bool,
  position:        PropTypes.number,
  sideColor:       PropTypes.bool,
  saved:           PropTypes.bool,
  sheetTitle:      PropTypes.string,
  sheetOwner:      PropTypes.string,
  timeStamp:       PropTypes.number,
};
TextBlockLink.defaultProps = {
  currVersions: {en:null, he:null},
};


class LanguageToggleButton extends Component {
  toggle(e) {
    e.preventDefault();
    this.props.toggleLanguage();
  }
  render() {
    var url = this.props.url || "";
    return (<a href={url} className="languageToggle" onClick={this.toggle}>
              <span className="en"><img src="/static/img/aleph.svg" alt="Hebrew Language Toggle Icon" /></span>
              <span className="he"><img src="/static/img/aye.svg" alt="English Language Toggle Icon" /></span>
            </a>);
  }
}
LanguageToggleButton.propTypes = {
  toggleLanguage: PropTypes.func.isRequired,
  url:            PropTypes.string,
};


const DangerousInterfaceBlock = ({en, he, classes}) => (
        <div className={classes}>
          <span className="int-en" dangerouslySetInnerHTML={ {__html: en } } />
          <span className="int-he" dangerouslySetInnerHTML={ {__html: he } } />
        </div>
    );
DangerousInterfaceBlock.propTypes = {
    en: PropTypes.string,
    he: PropTypes.string,
    classes: PropTypes.string
};

const SimpleInterfaceBlock = ({en, he, classes}) => (
        <div className={classes}>
            <span className="int-en">{en}</span>
            <span className="int-he">{he}</span>
        </div>
    );
SimpleInterfaceBlock.propTypes = {
    en: PropTypes.string,
    he: PropTypes.string,
    classes: PropTypes.string
};

const SimpleContentBlock = ({en, he, classes}) => (
        <div className={classes}>
          <span className="he" dangerouslySetInnerHTML={ {__html: he } } />
          <span className="en" dangerouslySetInnerHTML={ {__html: en } } />
        </div>
    );
SimpleContentBlock.propTypes = {
    en: PropTypes.string,
    he: PropTypes.string,
    classes: PropTypes.string
};


const SimpleLinkedBlock = ({en, he, url, classes, aclasses, children, onClick}) => (
        <div className={classes} onClick={onClick}>
            <a href={url} className={aclasses}>
              <span className="int-en">{en}</span>
              <span className="int-he">{he}</span>
            </a>
            {children}
        </div>
    );
SimpleLinkedBlock.propTypes = {
    en: PropTypes.string,
    he: PropTypes.string,
    url: PropTypes.string,
    classes: PropTypes.string,
    aclasses: PropTypes.string
};


class BlockLink extends Component {
  render() {
    var interfaceClass = this.props.interfaceLink ? 'int-' : '';
    var cn = {blockLink: 1, inAppLink: this.props.inAppLink};
    var linkClass = this.props.title.toLowerCase().replace(" ", "-") + "-link";
    cn[linkClass] = 1;
    var classes = classNames(cn);
      return (<a className={classes} href={this.props.target}>
              {this.props.image ? <img src={this.props.image} alt="" /> : null}
              <span className={`${interfaceClass}en`}>{this.props.title}</span>
              <span className={`${interfaceClass}he`}>{this.props.heTitle}</span>
           </a>);
  }
}
BlockLink.propTypes = {
  title:         PropTypes.string,
  heTitle:       PropTypes.string,
  target:        PropTypes.string,
  image:         PropTypes.string,
  inAppLink:     PropTypes.bool,
  interfaceLink: PropTypes.bool
};
BlockLink.defaultProps = {
  interfaceLink: false
};


class ToggleSet extends Component {
  // A set of options grouped together.
  render() {
    var classes = {toggleSet: 1, separated: this.props.separated };
    classes[this.props.name] = 1;
    classes = classNames(classes);
    var value = this.props.name === "layout" ? this.props.currentLayout() : this.props.settings[this.props.name];
    var width = 100.0 - (this.props.separated ? (this.props.options.length - 1) * 3 : 0);
    var style = {width: (width/this.props.options.length) + "%"};
    var label = this.props.label ? (<span className="toggle-set-label">{this.props.label}</span>) : null;
    return (
      <div className={classes} role={this.props.role} aria-label={this.props.ariaLabel}>
          {label}
          <div>
        {
          this.props.options.map(function(option) {
            return (
              <ToggleOption
                name={option.name}
                key={option.name}
                set={this.props.name}
                role={option.role}
                ariaLable={option.ariaLabel}
                on={value == option.name}
                setOption={this.props.setOption}
                style={style}
                image={option.image}
                fa={option.fa}
                content={option.content} />);
          }.bind(this))
        }
          </div>
      </div>);
  }
}
ToggleSet.propTypes = {
  name:          PropTypes.string.isRequired,
  label:         PropTypes.string,
  setOption:     PropTypes.func.isRequired,
  currentLayout: PropTypes.func,
  settings:      PropTypes.object.isRequired,
  options:       PropTypes.array.isRequired,
  separated:     PropTypes.bool,
  role:          PropTypes.string,
  ariaLabel:     PropTypes.string
};


class ToggleOption extends Component {
  // A single option in a ToggleSet

  handleClick() {
    this.props.setOption(this.props.set, this.props.name);
    if (Sefaria.site) { Sefaria.track.event("Reader", "Display Option Click", this.props.set + " - " + this.props.name); }
  }
  checkKeyPress(e){
    if (e.keyCode === 39  || e.keyCode === 40) { //39 is right arrow -- 40 is down
        $(e.target).siblings(".toggleOption").attr("tabIndex","-1");
        $(e.target).attr("tabIndex","-1");
        $(e.target).next(".toggleOption").focus().attr("tabIndex","0");
    }
    else if (e.keyCode === 37 || e.keyCode === 38) { //37 is left arrow -- 38 is up
        $(e.target).siblings(".toggleOption").attr("tabIndex","-1");
        $(e.target).attr("tabIndex","-1");
        $(e.target).prev(".toggleOption").focus().attr("tabIndex","0");
    }
    else if (e.keyCode === 13) { //13 is enter
        $(e.target).trigger("click");
    }
    else if (e.keyCode === 9) { //9 is tab
        var lastTab = $("div[role='dialog']").find(':tabbable').last();
        var firstTab = $("div[role='dialog']").find(':tabbable').first();
        if (e.shiftKey) {
          if ($(e.target).is(firstTab)) {
            $(lastTab).focus();
            e.preventDefault();
          }
        }
        else {
          if ($(e.target).is(lastTab)) {
            $(firstTab).focus();
            e.preventDefault();
          }
        }
    }
    else if (e.keyCode === 27) { //27 is escape
        e.stopPropagation();
        $(".mask").trigger("click");
    }
  }
  render() {
    var classes = {toggleOption: 1, on: this.props.on };
    var tabIndexValue = this.props.on ? 0 : -1;
    var ariaCheckedValue = this.props.on ? "true" : "false";
    classes[this.props.name] = 1;
    classes = classNames(classes);
    var content = this.props.image ? (<img src={this.props.image} alt=""/>) :
                    this.props.fa ? (<i className={"fa fa-" + this.props.fa}></i>) :
                      (<span dangerouslySetInnerHTML={ {__html: this.props.content} }></span>);
    return (
      <div
        role={this.props.role}
        aria-label= {this.props.ariaLabel}
        tabIndex = {this.props.role == "radio"? tabIndexValue : "0"}
        aria-checked={ariaCheckedValue}
        className={classes}
        style={this.props.style}
        onKeyDown={this.checkKeyPress}
        onClick={this.handleClick}>
        {content}
      </div>);
  }
}


class ReaderNavigationMenuSearchButton extends Component {
  render() {
    return (<span className="readerNavMenuSearchButton" onClick={this.props.onClick}>
      <img src="/static/icons/iconmonstr-magnifier-2.svg" />
    </span>);
  }
}


class ReaderNavigationMenuMenuButton extends Component {
  render() {
    var isheb = this.props.interfaceLang == "hebrew";
    var icon = this.props.compare ? (isheb ?
      <i className="fa fa-chevron-right"></i> : <i className="fa fa-chevron-left"></i>) :
        (<i className="fa fa-bars"></i>);
    return (<span className="readerNavMenuMenuButton" onClick={this.props.onClick}>{icon}</span>);
  }
}
ReaderNavigationMenuMenuButton.propTypes = {
  onClick: PropTypes.func,
  compare: PropTypes.bool,
  interfaceLang: PropTypes.string
};


class ReaderNavigationMenuCloseButton extends Component {
  onClick(e) {
    e.preventDefault();
    this.props.onClick();
  }
  render() {
    if (this.props.icon == "circledX"){
      var icon = <img src="/static/img/circled-x.svg" />;
    } else if (this.props.icon == "chevron") {
      var icon = <i className="fa fa-chevron-left"></i>
    } else {
      var icon = "×";
    }
    var classes = classNames({readerNavMenuCloseButton: 1, circledX: this.props.icon === "circledX"});
    var url = this.props.url || "";
    return (<a href={url} className={classes} onClick={this.onClick}>{icon}</a>);
  }
}


class ReaderNavigationMenuDisplaySettingsButton extends Component {
  render() {
    var style = this.props.placeholder ? {visibility: "hidden"} : {};
    var icon = Sefaria._siteSettings.TORAH_SPECIFIC ?
      <img src="/static/img/ayealeph.svg" alt="Toggle Reader Menu Display Settings" style={style} /> :
      <span className="textIcon">Aa</span>;
    return (<a
              className="readerOptions"
              tabIndex="0"
              role="button"
              aria-haspopup="true"
              aria-label="Toggle Reader Menu Display Settings"
              style={style}
              onClick={this.props.onClick}
              onKeyPress={function(e) {e.charCode == 13 ? this.props.onClick(e):null}.bind(this)}>
              {icon}
            </a>);
  }
}
ReaderNavigationMenuDisplaySettingsButton.propTypes = {
  onClick: PropTypes.func,
  placeholder: PropTypes.bool,
};

// const [mounted, setMounted] = React.useState(true);
// useEffect(() => {return () => {setMounted(false)}}, []);
function SaveButton({historyObject, placeholder, tooltip, toggleSignUpModal}) {
  const isSelected = () => !!Sefaria.getSavedItem(historyObject);
  const [selected, setSelected] = useState(placeholder || isSelected());
  useEffect(() => {
    if (placeholder) { return; }
    setSelected(isSelected())
  }, [historyObject && historyObject.ref]);

  const [isPosting, setPosting] = useState(false);

  const style = placeholder ? {visibility: 'hidden'} : {};
  const classes = classNames({saveButton: 1, "tooltip-toggle": tooltip});
  const altText = placeholder ? '' :
      `${Sefaria._(selected ? "Remove" : "Save")} '${historyObject.sheet_title ?
          historyObject.sheet_title.stripHtml() : Sefaria._r(historyObject.ref)}'`;

  function onClick() {
    if (isPosting) { return; }
    setPosting(true);
    Sefaria.track.event("Saved", "saving", historyObject.ref);
    Sefaria.toggleSavedItem(historyObject)
        .then(() => { setSelected(isSelected()); }) // since request is async, check if it's selected from data
        .catch(e => { if (e == 'notSignedIn') { toggleSignUpModal(); }})
        .finally(() => { setPosting(false); });
  }

  return (
      <div aria-label={altText} tabIndex="0"
        className={classes} role="button"
        style={style} onClick={onClick}
        onKeyPress={e => {e.charCode == 13 ? onClick(e): null}}>
        { selected ? <img src="/static/img/filled-star.png" alt={altText}/> :
          <img src="/static/img/star.png" alt={altText}/> }
      </div>
    );
}
SaveButton.propTypes = {
  historyObject: PropTypes.shape({
    ref: PropTypes.string,
    versions: PropTypes.object,
  }),
  placeholder: PropTypes.bool,
  tooltip: PropTypes.bool,
  toggleSignUpModal: PropTypes.func,
};


class FollowButton extends Component {
  constructor(props) {
    super(props);
    this.state = {
      following: props.following, // Deal w/ case where we don't know?
      hovering: false
    }
  }
  _post_follow() {
    $.post("/api/follow/" + this.props.uid, {}, data => {
      Sefaria.following.push(this.props.uid);  // keep local following list up-to-date
      Sefaria.track.event("Following", "New Follow", this.props.uid);
    });
  }
  _post_unfollow() {
    $.post("/api/unfollow/" + this.props.uid, {}, data => {
      Sefaria.following = Sefaria.following.filter(i => i !== this.props.uid);  // keep local following list up-to-date
      Sefaria.track.event("Following", "Unfollow", this.props.uid);
    });
  }
  onMouseEnter() {
    this.setState({hovering: true});
  }
  onMouseLeave() {
    this.setState({hovering: false});
  }
  onClick(e) {
    e.stopPropagation();
    if (!Sefaria._uid) {
        this.props.toggleSignUpModal();
        return;
    }
    if (this.state.following) {
      this._post_unfollow();
      this.setState({following: false});
    } else {
      this._post_follow();
      this.setState({following: true, hovering: false});  // hovering:false keeps the "unfollow" from flashing.
    }
  }
  render() {
    const classes = classNames({
      largeFollowButton: this.props.large,
      smallFollowButton: !this.props.large,
      following: this.state.following,
      hovering: this.state.hovering,
      smallText: true,
    });
    const en_text = this.state.following ? this.state.hovering ? "Unfollow":"Following":"Follow";
    const he_text = this.state.following ? this.state.hovering ? "הפסק לעקוב":"עוקב":"עקוב";
    return <div className={classes} onMouseEnter={this.onMouseEnter} onMouseLeave={this.onMouseLeave} onClick={this.onClick}>
            <span className="int-en">
                {en_text}
            </span>
            <span className="int-he">
                {he_text}
            </span>
          </div>
  }
}
FollowButton.propTypes = {
  uid: PropTypes.number.isRequired,
  following: PropTypes.bool,  // is this person followed already?
  large: PropTypes.bool,
  toggleSignUpModal: PropTypes.func,
};

const SinglePanelNavHeader = (props) =>
      <div className="readerNavTop searchOnly">
          <CategoryColorLine category={props.colorLineCategory || "Other"} />
          <ReaderNavigationMenuMenuButton onClick={props.navHome} />
          <h2>
            <span className="int-en">{props.enTitle}</span>
            <span className="int-he">{props.heTitle || Sefaria.hebrewTerm(props.enTitle)}</span>
          </h2>
          {props.showDisplaySettings ?
            <ReaderNavigationMenuDisplaySettingsButton onClick={props.openDisplaySettings} />
            : <div className="readerOptions"></div> }
      </div>;
SinglePanelNavHeader.propTypes = {
  navHome:             PropTypes.func.isRequired,
  enTitle:             PropTypes.string,
  heTitle:             PropTypes.string,
  showDisplaySettings: PropTypes.bool,
  openDisplaySettings: PropTypes.func,
  colorLineCategory:   PropTypes.string,
};


const CategoryColorLine = ({category}) =>
  <div className="categoryColorLine" style={{background: Sefaria.palette.categoryColor(category)}}/>;


class ProfileListing extends Component {
  openProfile(e) {
    if (this.props.openProfile) {
      e.preventDefault();
      this.props.openProfile(this.props.slug, this.props.name);
    }
  }
  render() {
    const { url, image, name, uid, is_followed, toggleSignUpModal, organization } = this.props;
    return (
      <div className="authorByLine">
        <div className="authorByLineImage">
          <a href={url} onClick={this.openProfile}>
            <ProfilePic
              len={40}
              url={image}
              name={name}
            />
          </a>
        </div>
        <div className="authorByLineText">
          <SimpleLinkedBlock
            classes="authorName"
            aclasses="systemText"
            url={url}
            en={name}
            he={name}
            onClick={this.openProfile}
          >
            <FollowButton large={false} uid={uid} following={is_followed} toggleSignUpModal={toggleSignUpModal}/>
          </SimpleLinkedBlock>
          {
            !!organization ? <SimpleInterfaceBlock
              classes="systemText authorOrganization"
              en={organization}
              he={organization}
            />:null
          }
        </div>
      </div>
    );
  }
}
ProfileListing.propTypes = {
  uid:         PropTypes.number.isRequired,
  url:         PropTypes.string.isRequired,
  image:       PropTypes.string.isRequired,
  name:        PropTypes.string.isRequired,
  is_followed: PropTypes.bool,
  toggleSignUpModal: PropTypes.func,

};


class SheetListing extends Component {
  // A source sheet listed in the Sidebar
  handleSheetClick(e) {
      Sefaria.track.sheets("Opened via Connections Panel", this.props.connectedRefs.toString())
      //console.log("Sheet Click Handled");
    if (Sefaria._uid == this.props.sheet.owner) {
      Sefaria.track.event("Tools", "My Sheet Click", this.props.sheet.sheetUrl);
    } else {
      Sefaria.track.event("Tools", "Sheet Click", this.props.sheet.sheetUrl);
    }
    this.props.handleSheetClick(e, this.props.sheet, null, this.props.connectedRefs);
  }
  handleSheetOwnerClick(e) {
    e.preventDefault();
    Sefaria.track.event("Tools", "Sheet Owner Click", this.props.sheet.ownerProfileUrl);
    const slugMatch = this.props.sheet.ownerProfileUrl.match(/profile\/(.+)$/);
    const slug = !!slugMatch ? slugMatch[1] : '';
    this.props.openProfile(slug, this.props.sheet.ownerName);
  }
  handleSheetTagClick(tag) {
    Sefaria.track.event("Tools", "Sheet Tag Click", tag);
  }
  handleSheetDelete() {
    if (confirm(Sefaria._("Are you sure you want to delete this sheet? There is no way to undo this action."))) {
      Sefaria.sheets.deleteSheetById(this.props.sheet.id).then(this.props.handleSheetDelete);
    }
  }
  render() {
    var sheet = this.props.sheet;
    var viewsIcon = sheet.public ?
      <div className="sheetViews sans"><i className="fa fa-eye" title={sheet.views + " views"}></i> {sheet.views}</div>
      : <div className="sheetViews sans"><i className="fa fa-lock" title="Private"></i></div>;

    var sheetInfo = this.props.hideAuthor ? null :
        <div className="sheetInfo">
          <div className="sheetUser">
            <a href={sheet.ownerProfileUrl} target="_blank" onClick={this.handleSheetOwnerClick}>
              <ProfilePic
                outerStyle={{display: "inline-block"}}
                name={sheet.ownerName}
                url={sheet.ownerImageUrl}
                len={26}
              />
            </a>
            <a href={sheet.ownerProfileUrl} target="_blank" className="sheetAuthor" onClick={this.handleSheetOwnerClick}>{sheet.ownerName}</a>
          </div>
          {viewsIcon}
        </div>

    const sheetTags = sheet.tags.map((tag, i) => {
      const separator = i == sheet.tags.length -1 ? null : <span className="separator">,</span>;
      return (<a href={`/sheets/tags/${tag}`}
                  target="_blank"
                  className="sheetTag"
                  key={tag}
                  onClick={this.handleSheetTagClick.bind(null, tag)}>{Sefaria._v(tag)}{separator}</a>)
    });
    const locale = Sefaria.interfaceLang === 'english' ? 'en-US' : 'iw-IL';
    const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    const created = (new Date(sheet.created)).toLocaleDateString(locale, dateOptions).replace(',', '');  // remove comma from english date
    const underInfo = this.props.infoUnderneath ? [
        sheet.status !== 'public' ? (<span className="unlisted"><img src="/static/img/eye-slash.svg"/><span>{Sefaria._("Unlisted")}</span></span>) : undefined,
        `${sheet.views} ${Sefaria._('Views')}`,
        created,
        sheet.tags.length ? sheetTags : undefined,
        !!sheet.group ? (<a href={`/groups/${sheet.group}`} target="_blank">{sheet.group}</a>) : undefined,
      ].filter(x => x !== undefined) : [sheetTags];

    return (
      <div className="sheet" key={sheet.sheetUrl}>
        <div className="sheetLeft">
          {sheetInfo}
          <a href={sheet.sheetUrl} target="_blank" className="sheetTitle" onClick={this.handleSheetClick}>
            <img src="/static/img/sheet.svg" className="sheetIcon"/>
            <span className="sheetTitleText">{sheet.title}</span>
          </a>
          <div className="sheetTags">
            {
              underInfo.map((i, ii) => (
                <span key={ii}>
                  { ii !== 0 ? <span className="bullet">{'\u2022'}</span> : null }
                  {i}
                </span>
              ))
            }
          </div>
        </div>
        <div className="sheetRight">
          {
            this.props.editable ?
            <a href={`/sheets/${sheet.id}?editor=1`}><img src="/static/img/circled-edit.svg"/></a>
              : null
          }
          {
            this.props.deletable ?
              <img src="/static/img/circled-x.svg" onClick={this.handleSheetDelete}/>
              : null
          }
          {
            this.props.saveable ?
              <SaveButton historyObject={{ ref: `Sheet ${sheet.id}`, versions: {}  }} />
              : null
          }
        </div>
      </div>);
  }
}
SheetListing.propTypes = {
  sheet:            PropTypes.object.isRequired,
  connectedRefs:    PropTypes.array.isRequired,
  handleSheetClick: PropTypes.func.isRequired,
  handleSheetDelete:PropTypes.func,
  openProfile:      PropTypes.func,
  handleSheetEdit:  PropTypes.func,
  deletable:        PropTypes.bool,
  saveable:         PropTypes.bool,
  hideAuthor:       PropTypes.bool,
  infoUnderneath:   PropTypes.bool,
};


class Note extends Component {
  // Public or private note in the Sidebar.
  render() {
    var authorInfo = this.props.ownerName && !this.props.isMyNote ?
        (<div className="noteAuthorInfo">
          <a href={this.props.ownerProfileUrl}>
            <img className="noteAuthorImg" src={this.props.ownerImageUrl} />
          </a>
          <a href={this.props.ownerProfileUrl} className="noteAuthor">{this.props.ownerName}</a>
        </div>) : null;

      var buttons = this.props.isMyNote ?
                    (<div className="noteButtons">
                      <i className="editNoteButton fa fa-pencil" title="Edit Note" onClick={this.props.editNote} ></i>
                    </div>) : null;

      var text = Sefaria.util.linkify(this.props.text);
      text = text.replace(/\n/g, "<br />");

      return (<div className="note">
                {buttons}
                {authorInfo}
                <div className="noteContent">
                  <span className="noteText" dangerouslySetInnerHTML={{__html:text}}></span>
                </div>
              </div>);
  }
}

Note.propTypes = {
  text:            PropTypes.string.isRequired,
  ownerName:       PropTypes.string,
  ownerImageUrl:   PropTypes.string,
  ownerProfileUrl: PropTypes.string,
  isPrivate:       PropTypes.bool,
  isMyNote:        PropTypes.bool,
  editNote:        PropTypes.func
};


function NewsletterSignUpForm(props) {
  const {contextName} = props;
  const [input, setInput] = useState('');
  const [subscribeMessage, setSubscribeMessage] = useState(null);

  function handleSubscribeKeyUp(e) {
    if (e.keyCode === 13) {
      handleSubscribe();
    }
  }

  function handleSubscribe() {
    var email = input;
    if (Sefaria.util.isValidEmailAddress(email)) {
      setSubscribeMessage("Subscribing...");
      var list = Sefaria.interfaceLang == "hebrew" ? "Announcements_General_Hebrew" : "Announcements_General"
      $.post("/api/subscribe/" + email + "?lists=" + list, function(data) {
        if ("error" in data) {
          setSubscribeMessage(data.error);
        } else {
          setSubscribeMessage("Subscribed! Welcome to our list.");
          Sefaria.track.event("Newsletter", "Subscribe from " + contextName, "");
        }
      }).error(data => setSubscribeMessage("Sorry, there was an error."));
    } else {
      setSubscribeMessage("Please enter a valid email address.");
    }
  }

  return (
    <div className="newsletterSignUpBox">
      <span className="int-en">
        <input 
          className="newsletterInput" 
          placeholder="Sign up for Newsletter" 
          value={input} 
          onChange={e => setInput(e.target.value)}
          onKeyUp={handleSubscribeKeyUp} />
      </span>
      <span className="int-he">
        <input 
          className="newsletterInput"
          placeholder="הצטרפו לרשימת התפוצה" 
          value={input} 
          onChange={e => setInput(e.target.value)}
          onKeyUp={handleSubscribeKeyUp} />
      </span>
      <img src="/static/img/circled-arrow-right.svg" onClick={handleSubscribe} />
      { subscribeMessage ? 
        <div className="subscribeMessage">{subscribeMessage}</div>
        : null }
    </div>);
}


class LoginPrompt extends Component {
  render() {
    var nextParam = "?next=" + Sefaria.util.currentPath();
    return (
      <div className="loginPrompt">
        <div className="loginPromptMessage">
          <span className="int-en">Please log in to use this feature.</span>
          <span className="int-he">עליך להיות מחובר בכדי להשתמש באפשרות זו.</span>
        </div>
        <a className="button" href={"/login" + nextParam}>
          <span className="int-en">Log In</span>
          <span className="int-he">התחבר</span>
        </a>
        <a className="button" href={"/register" + nextParam}>
          <span className="int-en">Sign Up</span>
          <span className="int-he">הרשם</span>
        </a>
      </div>);
  }
}
LoginPrompt.propTypes = {
  fullPanel: PropTypes.bool,
};


class SignUpModal extends Component {
  render() {
    const innerContent = [
      ["sheet-white.png", Sefaria._("Organize sources with sheets")],
      ["note-white.png", Sefaria._("Make notes")],
      ["star-white.png", Sefaria._("Save texts")],
      ["user-2-white.png", Sefaria._("Follow your favorite authors")],
      ["email-white.png", Sefaria._("Get updates on texts")],
    ].map(x => (
      <div key={x[0]}>
        <img src={`/static/img/${x[0]}`} alt={x[1]} />
        { x[1] }
      </div>
    ));
    const nextParam = "?next=" + encodeURIComponent(Sefaria.util.currentPath());

    return (
      this.props.show ? <div id="interruptingMessageBox" className="sefariaModalBox">
        <div id="interruptingMessageOverlay" onClick={this.props.onClose}></div>
        <div id="interruptingMessage" className="sefariaModalContentBox">
          <div id="interruptingMessageClose" className="sefariaModalClose" onClick={this.props.onClose}>×</div>
          <div className="sefariaModalContent">
            <h2>{Sefaria._("Join " + Sefaria._siteSettings.SITE_NAME.en + ".")}</h2>
            <div className="sefariaModalInnerContent">
              { innerContent }
            </div>
            <a className="button white control-elem" href={"/register" + nextParam}>
              { Sefaria._("Create Your Account")}
            </a>
            <div className="sefariaModalBottomContent">
              { Sefaria._("Already have an account?") + " "}
              <a href={"/login" + nextParam}>{ Sefaria._("Sign\u00A0in")}</a>
            </div>
          </div>
        </div>
      </div> : null
    );
  }
}
SignUpModal.propTypes = {
  show: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
};


class InterruptingMessage extends Component {
  constructor(props) {
    super(props);
    this.displayName = 'InterruptingMessage';
    this.state = {
      timesUp: false,
      animationStarted: false
    };
    this.settings = {
      "modal": {
        "trackingName": "Interrupting Message",
        "showDelay": 1000,
      },
      "banner": {
        "trackingName": "Banner Message",
        "showDelay": 1,
      }
    }[this.props.style];
  }
  componentDidMount() {
    this.delayedShow();
  }
  delayedShow() {
    setTimeout(function() {
      this.setState({timesUp: true});
      $("#interruptingMessage .button").click(this.close);
      $("#interruptingMessage .trackedAction").click(this.trackAction);
      this.animateOpen();
    }.bind(this), this.settings.showDelay);
  }
  animateOpen() {
    setTimeout(function() {
      if (this.props.style === "banner" && $("#s2").hasClass("headerOnly")) { $("body").addClass("hasBannerMessage"); }
      this.setState({animationStarted: true});
      this.trackOpen();
    }.bind(this), 50);
  }
  close() {
    this.markAsRead();
    this.props.onClose();
    if (this.props.style === "banner" && $("#s2").hasClass("headerOnly")) { $("body").removeClass("hasBannerMessage"); }
  }
  trackOpen() {
    Sefaria.track.event(this.settings.trackingName, "open", this.props.messageName, { nonInteraction: true });
  }
  trackAction() {
    Sefaria.track.event(this.settings.trackingName, "action", this.props.messageName, { nonInteraction: true });
  }
  markAsRead() {
    Sefaria._api("/api/interrupting-messages/read/" + this.props.messageName, function (data) {});
    var cookieName = this.props.messageName + "_" + this.props.repetition;
    $.cookie(cookieName, true, { path: "/", expires: 14 });
    Sefaria.track.event(this.settings.trackingName, "read", this.props.messageName, { nonInteraction: true });
    Sefaria.interruptingMessage = null;
  }
  render() {
    if (!this.state.timesUp) { return null; }

    if (this.props.style === "banner") {
      return  <div id="bannerMessage" className={this.state.animationStarted ? "" : "hidden"}>        
                <div id="bannerMessageContent" dangerouslySetInnerHTML={ {__html: this.props.messageHTML} }></div>
                <div id="bannerMessageClose" onClick={this.close}>×</div>
              </div>;

    } else if (this.props.style === "modal") {
      return  <div id="interruptingMessageBox" className={this.state.animationStarted ? "" : "hidden"}>
          <div id="interruptingMessageOverlay" onClick={this.close}></div>
          <div id="interruptingMessage">
            <div id="interruptingMessageContentBox">
              <div id="interruptingMessageClose" onClick={this.close}>×</div>
              <div id="interruptingMessageContent" dangerouslySetInnerHTML={ {__html: this.props.messageHTML} }></div>
            </div>
          </div>
        </div>;
    }
    return null;
  }
}
InterruptingMessage.propTypes = {
  messageName: PropTypes.string.isRequired,
  messageHTML: PropTypes.string.isRequired,
  style:       PropTypes.string.isRequired,
  repetition:  PropTypes.number.isRequired,
  onClose:     PropTypes.func.isRequired
};


class ThreeBox extends Component {
  // Wrap a list of elements into a three column table
  render() {
      var content = this.props.content;
      var length = content.length;
      if (length % 3) {
          length += (3-length%3);
      }
      content.pad(length, "");
      var threes = [];
      for (var i=0; i<length; i+=3) {
        threes.push([content[i], content[i+1], content[i+2]]);
      }
      return (
        <table className="gridBox threeBox">
          <tbody>
          {
            threes.map(function(row, i) {
              return (
                <tr key={i}>
                  {row[0] ? (<td>{row[0]}</td>) : null}
                  {row[1] ? (<td>{row[1]}</td>) : null}
                  {row[2] ? (<td>{row[2]}</td>) : null}
                </tr>
              );
            })
          }
          </tbody>
        </table>
      );
  }
}


class TwoBox extends Component {
  // Wrap a list of elements into a two column table
  render() {
      var content = this.props.content;
      var length = content.length;
      if (length % 2) {
          length += (2-length%2);
      }
      content.pad(length, "");
      var twos = [];
      for (var i=0; i<length; i+=2) {
        twos.push([content[i], content[i+1]]);
      }
      return (
        <table className="gridBox twoBox">
          <tbody>
          {
            twos.map(function(row, i) {
              return (
                <tr key={i}>
                  {row[0] ? (<td>{row[0]}</td>) : <td className="empty"></td>}
                  {row[1] ? (<td>{row[1]}</td>) : <td className="empty"></td>}
                </tr>
              );
            })
          }
          </tbody>
        </table>
      );
  }
}
TwoBox.propTypes = {
  content: PropTypes.array.isRequired
};


class TwoOrThreeBox extends Component {
  // Wrap a list of elements into a two or three column table, depending on window width
  render() {
      var threshhold = this.props.threshhold;
      if (this.props.width > threshhold) {
        return (<ThreeBox content={this.props.content} />);
      } else {
        return (<TwoBox content={this.props.content} />);
      }
  }
}
TwoOrThreeBox.propTypes = {
  content:    PropTypes.array.isRequired,
  width:      PropTypes.number.isRequired,
  threshhold: PropTypes.number
};
TwoOrThreeBox.defaultProps = {
  threshhold: 500
};


class Dropdown extends Component {
  constructor(props) {
    super(props);
    this.state = {
      optionsOpen: false,
      selected: null
    };
  }
  select(option) {
    this.setState({selected: option, optionsOpen: false});
    this.props.onSelect && this.props.onSelect(option.value);
  }
  toggle() {
    this.setState({optionsOpen: !this.state.optionsOpen});
  }
  render() {
    return (
        <div className="dropdown sans">
          <div className="dropdownMain noselect" onClick={this.toggle}>
            <i className="dropdownOpenButton noselect fa fa-caret-down"></i>
            {this.state.selected ? this.state.selected.label : this.props.placeholder }
          </div>
          {this.state.optionsOpen ?
            <div className="dropdownListBox noselect">
              <div className="dropdownList noselect">
                {this.props.options.map(function(option) {
                  var onClick = this.select.bind(null, option);
                  var classes = classNames({dropdownOption: 1, selected: this.state.selected && this.state.selected.value == option.value});
                  return <div className={classes} onClick={onClick} key={option.value}>{option.label}</div>
                }.bind(this))}
              </div>
            </div>
          : null}
        </div>);
  }
}
Dropdown.propTypes = {
  options:     PropTypes.array.isRequired, // Array of {label, value}
  onSelect:    PropTypes.func,
  placeholder: PropTypes.string,
  selected:    PropTypes.string,
};


class LoadingMessage extends Component {
  render() {
    var message = this.props.message || "Loading...";
    var heMessage = this.props.heMessage || "טוען מידע...";
    var classes = "loadingMessage " + (this.props.className || "");
    return (<div className={classes}>
              <span className="int-en">{message}</span>
              <span className="int-he">{heMessage}</span>
            </div>);
  }
}
LoadingMessage.propTypes = {
  message:   PropTypes.string,
  heMessage: PropTypes.string,
  className: PropTypes.string
};


class TestMessage extends Component {
  // Modal explaining development status with links to send feedback or go back to the old site
  render() {
    return (
      <div className="testMessageBox">
        <div className="overlay" onClick={this.props.hide} ></div>
        <div className="testMessage">
          <div className="title">The new Sefaria is still in development.<br />Thank you for helping us test and improve it.</div>
          <a href="mailto:hello@sefaria.org" target="_blank" className="button">Send Feedback</a>
          <div className="button" onClick={null} >Return to Old Sefaria</div>
        </div>
      </div>);
  }
}
TestMessage.propTypes = {
  hide:   PropTypes.func
};


class CategoryAttribution extends Component {
  render() {
    var attribution = Sefaria.categoryAttribution(this.props.categories);
    if (!attribution) { return null; }
    var linkedContent = <a href={attribution.link} className="outOfAppLink">
                          <span className="en">{attribution.english}</span>
                          <span className="he">{attribution.hebrew}</span>
                        </a>;
    var unlinkedContent = <span>
                            <span className="en">{attribution.english}</span>
                            <span className="he">{attribution.hebrew}</span>
                          </span>;
    return <div className="categoryAttribution">
            {this.props.linked ? linkedContent : unlinkedContent}
           </div>;
  }
}
CategoryAttribution.propTypes = {
  categories: PropTypes.array.isRequired,
  linked:     PropTypes.bool,
};
CategoryAttribution.defaultProps = {
  linked:     true,
};


class SheetTagLink extends Component {
  handleTagClick(e) {
    e.preventDefault();
    this.props.setSheetTag(this.props.tag);
  }
  render() {
    return (<a href={`/sheets/tags/${this.props.tag}`} onClick={this.handleTagClick}>
        <span className="int-en">{this.props.tag}</span>
        <span className="int-he">{Sefaria.hebrewTerm(this.props.tag)}</span>
        </a>);
  }
}
SheetTagLink.propTypes = {
  tag:   PropTypes.string.isRequired,
  setSheetTag: PropTypes.func.isRequired
};


class SheetAccessIcon extends Component {
  render() {
    var sheet = this.props.sheet;
    var msg = "group" in sheet ? "Listed for Group members only" : "Private";
    return (sheet.status == "unlisted") ?
      (<i className="fa fa-lock" title={msg}></i>)
      : null;
  }
}
SheetAccessIcon.propTypes = {
  sheet: PropTypes.object.isRequired
};


class FeedbackBox extends Component {
  constructor(props) {
    super(props);
    this.state = {
      type: null,
      alertmsg: null,
      feedbackSent: false,
    };
  }
  sendFeedback() {
    if (!this.state.type) {
      this.setState({alertmsg: Sefaria._("Please select a feedback type")});
      return
    }

    if (!Sefaria._uid && !this.validateEmail($("#feedbackEmail").val())) {
      this.setState({alertmsg: Sefaria._("Please enter a valid email address")});
      return
    }

    var feedback = {
        refs: this.props.srefs || null,
        type: this.state.type,
        url: this.props.url || null,
        currVersions: this.props.currVersions,
        email: $("#feedbackEmail").val() || null,
        msg: $("#feedbackText").val(),
        uid: Sefaria._uid || null
    };
    var postData = {json: JSON.stringify(feedback)};
    var url = "/api/send_feedback";

    this.setState({feedbackSent: true});

    $.post(url, postData, function (data) {
        if (data.error) {
            alert(data.error);
        } else {
            console.log(data);
            Sefaria.track.event("Tools", "Send Feedback", this.props.url);
        }
    }.bind(this)).fail(function (xhr, textStatus, errorThrown) {
        alert(Sefaria._("Unfortunately, there was an error sending this feedback. Please try again or try reloading this page."));
        this.setState({feedbackSent: true});
    });
  }
  validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
  }
  setType(type) {
    this.setState({type: type});
  }
  render() {
    if (this.state.feedbackSent) {
        return (
            <div className="feedbackBox">
                <p className="int-en">Feedback sent!</p>
                <p className="int-he">משוב נשלח!</p>
            </div>
        )
    }
    return (
        <div className="feedbackBox">
            <p className="int-en">Have some feedback? We would love to hear it.</p>
            <p className="int-he">אנחנו מעוניינים במשוב ממך</p>

            {this.state.alertmsg ?
                <div>
                    <p className="int-en">{this.state.alertmsg}</p>
                    <p className="int-he">{this.state.alertmsg}</p>
                </div>
                : null
            }

            <Dropdown
              options={[
                        {value: "content_issue",   label: Sefaria._("Report an issue with the text")},
                        {value: "translation_request",   label: Sefaria._("Request translation")},
                        {value: "bug_report",      label: Sefaria._("Report a bug")},
                        {value: "help_request",    label: Sefaria._("Get help")},
                        {value: "feature_request", label: Sefaria._("Request a feature")},
                        {value: "good_vibes",      label: Sefaria._("Give thanks")},
                        {value: "other",           label: Sefaria._("Other")},
                      ]}
              placeholder={Sefaria._("Select Type")}
              onSelect={this.setType}
            />

            <textarea className="feedbackText" placeholder={Sefaria._("Describe the issue...")} id="feedbackText"></textarea>

            {!Sefaria._uid ?
                <div><input className="sidebarInput noselect" placeholder={Sefaria._("Email Address")} id="feedbackEmail" /></div>
                : null }

             <div className="button" role="button" onClick={() => this.sendFeedback()}>
                 <span className="int-en">Submit</span>
                 <span className="int-he">שלח</span>
             </div>
        </div>
    );
  }
}


class ReaderMessage extends Component {
  // Component for determining user feedback on new element
  constructor(props) {
    super(props)
    var showNotification = Sefaria._inBrowser && !document.cookie.includes(this.props.messageName+"Accepted");
    this.state = {showNotification: showNotification};
  }
  setFeedback(status) {
    Sefaria.track.uiFeedback(this.props.messageName+"Accepted", status);
    $.cookie((this.props.messageName+"Accepted"), 1, {path: "/"});
    this.setState({showNotification: false});
  }
  render() {
    if (!this.state.showNotification) { return null; }
    return (
      <div className="readerMessageBox">
        <div className="readerMessage">
          <div className="int-en">{this.props.message}</div>
          <div className="button small" role="button" onClick={() => this.setFeedback('Like')}>{this.props.buttonLikeText}</div>
          <div className="button small" role="button" onClick={() => this.setFeedback('Dislike')}>{this.props.buttonDislikeText}</div>
        </div>
      </div>);
  }
}
ReaderMessage.propTypes = {
  messageName: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
  buttonLikeText: PropTypes.string.isRequired,
  buttonDislikeText: PropTypes.string.isRequired,
};


class CookiesNotification extends Component {
  constructor(props) {
    super(props);
    var showNotification = !Sefaria._debug && Sefaria._inBrowser && !document.cookie.includes("cookiesNotificationAccepted");

    this.state = {showNotification: showNotification};
  }
  setCookie() {
    $.cookie("cookiesNotificationAccepted", 1, {path: "/", expires: 20*365});
    this.setState({showNotification: false});
  }
  render() {
    if (!this.state.showNotification) { return null; }
    return (
      <div className="cookiesNotification">

          <div>
            <span className="int-en">We use cookies to give you the best experience possible on our site. Click OK to continue using Sefaria. <a href="/privacy-policy">Learn More</a>.</span>
            <span className='int-en button small white' onClick={this.setCookie}>OK</span>
          </div>
          <div>
            <span className="int-he">אנחנו משתמשים בעוגיות כדי לתת למשתמשים את חווית השימוש הטובה ביותר. לחץ כאן לאישור. <a href="/privacy-policy">קרא עוד בנושא</a>.</span>
            <span className='int-he button small white' onClick={this.setCookie}>כאן</span>
          </div>

       </div>
    );
  }
}


module.exports.SimpleInterfaceBlock                      = SimpleInterfaceBlock;
module.exports.DangerousInterfaceBlock                   = DangerousInterfaceBlock;
module.exports.SimpleContentBlock                        = SimpleContentBlock;
module.exports.SimpleLinkedBlock                         = SimpleLinkedBlock;
module.exports.BlockLink                                 = BlockLink;
module.exports.CategoryColorLine                         = CategoryColorLine;
module.exports.CategoryAttribution                       = CategoryAttribution;
module.exports.CookiesNotification                       = CookiesNotification;
module.exports.Dropdown                                  = Dropdown;
module.exports.DropdownButton                            = DropdownButton;
module.exports.DropdownModal                             = DropdownModal;
module.exports.DropdownOptionList                        = DropdownOptionList;
module.exports.FeedbackBox                               = FeedbackBox;
module.exports.FilterableList                            = FilterableList;
module.exports.GlobalWarningMessage                      = GlobalWarningMessage;
module.exports.InterruptingMessage                       = InterruptingMessage;
module.exports.LanguageToggleButton                      = LanguageToggleButton;
module.exports.Link                                      = Link;
module.exports.LoadingMessage                            = LoadingMessage;
module.exports.LoginPrompt                               = LoginPrompt;
module.exports.NewsletterSignUpForm                      = NewsletterSignUpForm;
module.exports.Note                                      = Note;
module.exports.ProfileListing                            = ProfileListing;
module.exports.ProfilePic                                = ProfilePic;
module.exports.ReaderMessage                             = ReaderMessage;
module.exports.ReaderNavigationMenuCloseButton           = ReaderNavigationMenuCloseButton;
module.exports.ReaderNavigationMenuDisplaySettingsButton = ReaderNavigationMenuDisplaySettingsButton;
module.exports.ReaderNavigationMenuMenuButton            = ReaderNavigationMenuMenuButton;
module.exports.SaveButton                                = SaveButton;
module.exports.FollowButton                              = FollowButton;
module.exports.ReaderNavigationMenuSection               = ReaderNavigationMenuSection;
module.exports.ReaderNavigationMenuSearchButton          = ReaderNavigationMenuSearchButton;
module.exports.SinglePanelNavHeader                      = SinglePanelNavHeader;
module.exports.SignUpModal                               = SignUpModal;
module.exports.SheetListing                              = SheetListing;
module.exports.SheetAccessIcon                           = SheetAccessIcon;
module.exports.SheetTagLink                              = SheetTagLink;
module.exports.TabView                                   = TabView;
module.exports.TextBlockLink                             = TextBlockLink;
module.exports.TestMessage                               = TestMessage;
module.exports.ThreeBox                                  = ThreeBox;
module.exports.ToggleSet                                 = ToggleSet;
module.exports.TwoBox                                    = TwoBox;
module.exports.TwoOrThreeBox                             = TwoOrThreeBox;
