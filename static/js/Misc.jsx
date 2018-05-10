const React      = require('react');
const ReactDOM   = require('react-dom');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
import Component      from 'react-class';


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
}


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
    return (
      <div className="readerNavSection">

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
  content: PropTypes.object
};


class TextBlockLink extends Component {
  // Monopoly card style link with category color at top
  render() {
    var index    = Sefaria.index(this.props.book);
    var category = this.props.category || (index ? index.primary_category : "Other");
    var style    = {"borderColor": Sefaria.palette.categoryColor(category)};
    var title    = this.props.title   || (this.props.showSections ? this.props.sref : this.props.book);
    var heTitle  = this.props.heTitle || (this.props.showSections ? this.props.heRef : index.heTitle);
    var subtitle = this.props.displayValue ? (
        <span className="blockLinkSubtitle">
            <span className="en">{this.props.displayValue}</span>
            <span className="he">{this.props.heDisplayValue}</span>
        </span>
    ) : null;

    var position = this.props.position || 0;
    var classes  = classNames({refLink: 1, blockLink: 1, recentItem: this.props.recentItem, calendarLink: (subtitle != null)});
    var url = "/" + Sefaria.normRef(this.props.sref);
    url += Object.keys(this.props.currVersions)
            .filter(vlang=>!!this.props.currVersions[vlang])
            .map((vlang)=>`&v${vlang}=${this.props.currVersions[vlang]}`)
            .join("")
            .replace("&","?");
    return (<a href={url} className={classes} data-ref={this.props.sref} data-ven={this.props.currVersions.en} data-vhe={this.props.currVersions.he} data-position={position} style={style}>
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
  showSections:    PropTypes.bool,
  recentItem:      PropTypes.bool,
  position:        PropTypes.number,
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
    return (<span className="readerNavMenuSearchButton" onClick={this.props.onClick}><i className="fa fa-search"></i></span>);
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
    return (<div
              className="readerOptions"
              tabIndex="0"
              role="button"
              aria-haspopup="true"
              style={style}
              onClick={this.props.onClick}
              onKeyPress={function(e) {e.charCode == 13 ? this.props.onClick(e):null}.bind(this)}>
                <img src="/static/img/stacked.png" alt="Toggle Reader Menu Display Settings" style={style} />
            </div>);
  }
}
ReaderNavigationMenuDisplaySettingsButton.propTypes = {
  onClick: PropTypes.func,
  placeholder: PropTypes.bool,
};


class CategoryColorLine extends Component {
  render() {
    var style = {backgroundColor: Sefaria.palette.categoryColor(this.props.category)};
    return (<div className="categoryColorLine" style={style}></div>);
  }
}


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


class InterruptingMessage extends Component {
  constructor(props) {
    super(props);
    this.displayName = 'InterruptingMessage';
    this.state = {
      timesUp: false,
      animationStarted: false
    };
  }
  componentDidMount() {
    this.delayedShow();
  }
  delayedShow() {
    setTimeout(function() {
      this.setState({timesUp: true});
      $("#interruptingMessage .button").click(this.close);
      $("#interruptingMessage .trackedAction").click(this.trackAction);
      this.delayedFadeIn();
    }.bind(this), 1000);
  }
  delayedFadeIn() {
    setTimeout(function() {
      this.setState({animationStarted: true});
      this.trackOpen();
    }.bind(this), 50);
  }
  close() {
    this.markAsRead();
    this.props.onClose();
  }
  trackOpen() {
    Sefaria.track.event("Interrupting Message", "open", this.props.messageName, { nonInteraction: true });
  }
  trackAction() {
    Sefaria.track.event("Interrupting Message", "action", this.props.messageName, { nonInteraction: true });
  }
  markAsRead() {
    Sefaria._api("/api/interrupting-messages/read/" + this.props.messageName, function (data) {});
    var cookieName = this.props.messageName + "_" + this.props.repetition;
    $.cookie(cookieName, true, { path: "/", expires: 14 });
    Sefaria.track.event("Interrupting Message", "read", this.props.messageName, { nonInteraction: true });
    Sefaria.interruptingMessage = null;
  }
  render() {
    return this.state.timesUp ?
      <div id="interruptingMessageBox" className={this.state.animationStarted ? "" : "hidden"}>
        <div id="interruptingMessageOverlay" onClick={this.close}></div>
        <div id="interruptingMessage">
          <div id="interruptingMessageContentBox">
            <div id="interruptingMessageClose" onClick={this.close}>×</div>
            <div id="interruptingMessageContent" dangerouslySetInnerHTML={ {__html: this.props.messageHTML} }></div>
          </div>
        </div>
      </div>
      : null;
  }
}
InterruptingMessage.propTypes = {
  messageName: PropTypes.string.isRequired,
  messageHTML: PropTypes.string.isRequired,
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
  // Wrap a list of elements into a three column table
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
                          </span>
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
}


class SheetTagLink extends Component {
  handleTagClick(e) {
    e.preventDefault();
    this.props.setSheetTag(this.props.tag);
  }
  render() {
    return (<a href={`/sheets/tags/${this.props.tag}`} onClick={this.handleTagClick}>{this.props.tag}</a>);
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


module.exports.BlockLink                                 = BlockLink;
module.exports.CategoryColorLine                         = CategoryColorLine;
module.exports.CategoryAttribution                       = CategoryAttribution;
module.exports.Dropdown                                  = Dropdown;
module.exports.GlobalWarningMessage                      = GlobalWarningMessage;
module.exports.InterruptingMessage                       = InterruptingMessage;
module.exports.LanguageToggleButton                      = LanguageToggleButton;
module.exports.Link                                      = Link;
module.exports.LoadingMessage                            = LoadingMessage;
module.exports.LoginPrompt                               = LoginPrompt;
module.exports.Note                                      = Note;
module.exports.ReaderNavigationMenuCloseButton           = ReaderNavigationMenuCloseButton;
module.exports.ReaderNavigationMenuDisplaySettingsButton = ReaderNavigationMenuDisplaySettingsButton;
module.exports.ReaderNavigationMenuMenuButton            = ReaderNavigationMenuMenuButton;
module.exports.ReaderNavigationMenuSection               = ReaderNavigationMenuSection;
module.exports.ReaderNavigationMenuSearchButton          = ReaderNavigationMenuSearchButton;
module.exports.SheetAccessIcon                           = SheetAccessIcon;
module.exports.SheetTagLink                              = SheetTagLink;
module.exports.TextBlockLink                             = TextBlockLink;
module.exports.TestMessage                               = TestMessage;
module.exports.ThreeBox                                  = ThreeBox;
module.exports.ToggleSet                                 = ToggleSet;
module.exports.TwoBox                                    = TwoBox;
module.exports.TwoOrThreeBox                             = TwoOrThreeBox;
