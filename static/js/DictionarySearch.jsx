const React      = require('react');
const ReactDOM   = require('react-dom');
const PropTypes  = require('prop-types');
const classNames = require('classnames');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
import Component from 'react-class'

class DictionarySearch extends Component {
  constructor(props) {
    super(props);

    this.state = {
      val: "",
      timer: null,
      autocomplete: null
    };
  }
  componentDidMount() {
    this.attachKeyboard();
    this.initAutocomplete();
    this.checkIfChanged();
  }
  /*
  shouldComponentUpdate(nextProps, nextState) {
    if (this.props.interfaceLang != nextProps.interfaceLang) { return true; }
    return false;
  } */
  componentWillUnmount() {
    clearTimeout(this.state.timer);
  }
  checkIfChanged() {
    try {
      var current = $(ReactDOM.findDOMNode(this)).find("input.search").val();
    }
    catch(e) {
      // The component is unmounted
      return;
    }
    if (this.state.val != current) {
      if (document.getElementById('keyboardInputMaster')) {
        // If the keyboard is open, place autocomplete results below it
        $(ReactDOM.findDOMNode(this)).find("input.search").autocomplete("option", "position", {my: "left+15 top-535", at: "left bottom",of: this.props.contextSelector + ' .dictionarySearchBox'});
      } else {
        // Otherwise results are below input box
        $(ReactDOM.findDOMNode(this)).find("input.search").autocomplete("option", "position", {my: "left top", at: "left bottom", of: this.props.contextSelector + ' .dictionarySearchBox'});
      }
      $(ReactDOM.findDOMNode(this)).find("input.search").autocomplete("search");
    }
    this.setState({
      val: current,
      timer: setTimeout(
          () => this.checkIfChanged(),
          330
      )
    });

  }
  attachKeyboard() {
    var inputElement = document.querySelector(this.props.contextSelector + ' .dictionarySearchBox .keyboardInput');
    if (inputElement && (!inputElement.VKI_attached)) {
      VKI_attach(inputElement);
    }
  }
  initAutocomplete() {
    $(ReactDOM.findDOMNode(this)).find("input.search").autocomplete({
      position: {
        my: "left top",
        at: "left bottom",
        of: this.props.contextSelector + ' .dictionarySearchBox'
      },
      open: function(e) {
        if (document.getElementById('keyboardInputMaster')) {
          // If the keyboard is open, set width to width of keyboard
          $(this.props.contextSelector + " .dictionary-toc-autocomplete").width($('#keyboardInputMaster').width()+10);
        } else {
          // Otherwise width of input box
          $(this.props.contextSelector + " .dictionary-toc-autocomplete").width($(this.props.contextSelector + " .dictionarySearchBox").width());
        }
      }.bind(this),
      close: function(event) {
        this.setState({
          val: $(ReactDOM.findDOMNode(this)).find("input.search").val()
        });
        this.checkIfChanged()
      }.bind(this),
      classes: {
        "ui-autocomplete": "dictionary-toc-autocomplete"  //todo: make unique identifier? 
      },
      minLength: 1,
      focus: e => clearTimeout(this.state.timer),
      select: function( event, ui ) {
        if (ui.item.value == "__invalid") { return false; }
        $(ReactDOM.findDOMNode(this)).find("input.search").val(ui.item.value);  // This will disappear when the next line executes, but the eye can sometimes catch it.
        this.submitSearch(ui.item.label);
        return false;
      }.bind(this),

      source: function(request, response) {
        if (Sefaria.hebrew.containsEnglish(request.term)) {
          response([{label: "Invalid entry.  Please type a Hebrew word.", value: "__invalid"}]);
          return
        }
        Sefaria.lexiconCompletion(
            request.term,
            this.props.lexiconName,
            d => {
              if (d.length > 0) {
                response(d.map(function(e) { return {label: e[1], value: e[0]}}));
              } else {
                response([])
              }
            }
        );
      }.bind(this)
    });
  }
  handleSearchButtonClick(event) {
    var query = $(ReactDOM.findDOMNode(this)).find(".search").val();
    if (query) {
      this.submitSearch(query, true);
    }
  }
  handleSearchKeyUp(event) {
    if (event.keyCode === 13) {
      var query = $(event.target).val();
      if (query) {
        this.submitSearch(query, true);
      }
    }
  }
  submitSearch(word, needsResolution) {
    if (needsResolution) {
      // Get the dotted form of this word, or the nearest match
      Sefaria.lexiconCompletion(word, this.props.lexiconName,
        d => {
          var resolvedWord = (d.length > 0) ? d[0][1] : word;
          var ref = this.props.title + ", " + resolvedWord;
          this.props.showBaseText(ref, false, this.props.currVersions);
          }
      )
    } else {
      var ref = this.props.title + ", " + word;
      this.props.showBaseText(ref, false, this.props.currVersions);
    }
  }
  showVirtualKeyboardIcon(show){
      if(document.getElementById('keyboardInputMaster')) { // if keyboard is open, ignore.
        return; //this prevents the icon from flashing on every key stroke.
      }
      if(this.props.interfaceLang == 'english'){
          var opacity = show ? 0.4 : 0;
          $(ReactDOM.findDOMNode(this)).find(".keyboardInputInitiator").css({"opacity": opacity});
      }
  }
  render() {
    var inputClasses = classNames({search: 1, keyboardInput: this.props.interfaceLang == 'english'});

    return (<div className = "searchBox dictionarySearchBox ui-front">
      <span className="dictionarySearchButton" onClick={this.handleSearchButtonClick}><i className="fa fa-search"></i></span>
                      <input className={inputClasses}
                             id="searchInput"
                             placeholder={Sefaria._("Search")}
                             onKeyUp={this.handleSearchKeyUp}
                             onFocus={this.showVirtualKeyboardIcon.bind(this, true)}
                             onBlur={this.showVirtualKeyboardIcon.bind(this, false)}
                             maxLength={75}
                      title={Sefaria._("Search for Texts or Keywords Here")}/>
    </div>);
  }
}

DictionarySearch.propTypes = {
  lexiconName:      PropTypes.string.isRequired,
  title:            PropTypes.string.isRequired,
  interfaceLang:    PropTypes.string,
  close:            PropTypes.func.isRequired,
  showBaseText:     PropTypes.func.isRequired,
  currVersions:     PropTypes.object.isRequired,
  contextSelector:  PropTypes.string.isRequired // CSS Selector for uniquely identifiable context that this is in. 
};

module.exports = DictionarySearch;
