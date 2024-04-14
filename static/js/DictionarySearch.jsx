import React  from 'react';
import ReactDOM  from 'react-dom';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
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
    let current;
    try {
      current = $(ReactDOM.findDOMNode(this)).find("input.search").val();
    }
    catch(e) {
      // The component is unmounted
      return;
    }
    if (this.state.val !== current) {
      if (document.getElementById('keyboardInputMaster')) {
        // If the keyboard is open, place autocomplete results below it
        $(ReactDOM.findDOMNode(this)).find("input.search").autocomplete("option", "position", {my: "left+15 top+180", at: "left bottom",of: this.props.contextSelector + ' .dictionarySearchBox'});
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
    const inputElement = document.querySelector(this.props.contextSelector + ' .dictionarySearchBox .keyboardInput');
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
        const searchBoxWidth = $(this.props.contextSelector + " .dictionarySearchBox").width();

        if (document.getElementById('keyboardInputMaster')) {
          // If the keyboard is open, set width to whichever is less of width of input box and width of keyboard
          const keyboardWidth = $('#keyboardInputMaster').width() + 10;
          $(this.props.contextSelector + " .dictionary-toc-autocomplete").width(Math.min(searchBoxWidth, keyboardWidth));
        } else {
          // Otherwise width of input box
          $(this.props.contextSelector + " .dictionary-toc-autocomplete").width(searchBoxWidth);
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
        if (ui.item.value === "__invalid") { return false; }
        $(ReactDOM.findDOMNode(this)).find("input.search").val(ui.item.value);  // This will disappear when the next line executes, but the eye can sometimes catch it.
        this.submitSearch(ui.item.label);
        return false;
      }.bind(this),

      source: function(request, response) {
        if (Sefaria.hebrew.containsEnglish(request.term)) {
          response([{label: Sefaria._("Invalid entry.  Please type a Hebrew word.") , value: "__invalid"}]);
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
    const query = $(ReactDOM.findDOMNode(this)).find(".search").val();
    if (query) {
      this.submitSearch(query, true);
    }
  }
  handleSearchKeyUp(event) {
    if (event.keyCode === 13) {
      const query = $(event.target).val();
      if (query) {
        $(ReactDOM.findDOMNode(this)).find("input.search").autocomplete("close");
        this.submitSearch(query, true);
      }
    }
  }
  displayWord(word) {
    // Either show results in sidebar, or show word in reader, depending on which mode we're in.
    console.log(word)
    if (this.props.showWordList) {
      this.props.showWordList(word);
    } else if (this.props.navigatePanel || this.props.showBaseText) {
      const ref = this.props.title + ", " + word;
      Sefaria.getText(ref).then(data => {
        // Check that this ref exists first before trying to open a panel
        if ("error" in data) {
          return;
        }
        this.props.navigatePanel ? this.props.navigatePanel(ref, this.props.currVersions) : this.props.showBaseText(ref, false, this.props.currVersions);
      })
    }
  }
  submitSearch(word, needsResolution) {
    if (needsResolution) {
      // Get the dotted form of this word, or the nearest match
      Sefaria.lexiconCompletion(word, this.props.lexiconName,
        d => {
          const resolvedWord = (d.length > 0) ? d[0][1] : word;
          this.displayWord(resolvedWord)
          });
    } else {
      this.displayWord(word);
    }
  }
  showVirtualKeyboardIcon(show){
      if(document.getElementById('keyboardInputMaster')) { // if keyboard is open, ignore.
        return; //this prevents the icon from flashing on every key stroke.
      }
      if(Sefaria.interfaceLang === 'english'){
          const opacity = show ? 0.4 : 0;
          $(ReactDOM.findDOMNode(this)).find(".keyboardInputInitiator").css({"opacity": opacity});
      }
  }
  render() {
    let inputClasses = classNames({search: 1, keyboardInput: Sefaria.interfaceLang === 'english'});

    return (
        <div className = "searchBox dictionarySearchBox ui-front">
          <img className="dictionarySearchButton" src="/static/icons/magnifier.svg" onClick={this.handleSearchButtonClick} role="button" alt="image of maginfying glass"/>
          <input className={inputClasses}
            id="searchInput"
            placeholder={Sefaria._("Search Dictionary")}
            onKeyUp={this.handleSearchKeyUp}
            onFocus={this.showVirtualKeyboardIcon.bind(this, true)}
            onBlur={this.showVirtualKeyboardIcon.bind(this, false)}
            maxLength={75}
            title={Sefaria._("Search for Texts or Keywords Here")}
          />
        </div>
    );
  }
}
DictionarySearch.propTypes = {
  lexiconName:      PropTypes.string,    // req. for redirect to text - e.g. TOC case.
  title:            PropTypes.string,    // req. for redirect to text - e.g. TOC case.
  showBaseText:     PropTypes.func,      // req. for redirect to text - e.g. TOC case.
  showWordList:     PropTypes.func,      // req. for sidebar case
  currVersions:     PropTypes.object,    // req. for redirect to text - e.g. TOC case.
  contextSelector:  PropTypes.string.isRequired // CSS Selector for uniquely identifiable context that this is in.
};


export default DictionarySearch;
