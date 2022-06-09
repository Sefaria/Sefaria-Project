import React  from 'react';
import ReactDOM  from 'react-dom';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import Component from 'react-class'

class TopicSearch extends Component {
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
    if (this.state.val != current) {
      if (document.getElementById('keyboardInputMaster')) {
        // If the keyboard is open, place autocomplete results below it
        $(ReactDOM.findDOMNode(this)).find("input.search").autocomplete("option", "position", {my: "left+15 top+180", at: "left bottom",of: this.props.contextSelector + ' .TopicSearchBox'});
      } else {
        // Otherwise results are below input box
        $(ReactDOM.findDOMNode(this)).find("input.search").autocomplete("option", "position", {my: "left top", at: "left bottom", of: this.props.contextSelector + ' .TopicSearchBox'});
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
    const inputElement = document.querySelector(this.props.contextSelector + ' .TopicSearchBox .keyboardInput');
    if (inputElement && (!inputElement.VKI_attached)) {
      VKI_attach(inputElement);
    }
  }
  initAutocomplete() {
    $(ReactDOM.findDOMNode(this)).find("input.search").autocomplete({
      position: {
        my: "left top",
        at: "left bottom",
        of: this.props.contextSelector + ' .TopicSearchBox'
      },
      open: function(e) {
        const searchBoxWidth = $(this.props.contextSelector + " .TopicSearchBox").width();
        $(this.props.contextSelector + " .topic-toc-autocomplete").width(searchBoxWidth);
      }.bind(this),
      close: function(event) {
        this.setState({
          val: $(ReactDOM.findDOMNode(this)).find("input.search").val()
        });
        this.checkIfChanged()
      }.bind(this),
      classes: {
        "ui-autocomplete": "topic-toc-autocomplete"  
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
  render() {
    let inputClasses = classNames({search: 1, keyboardInput: Sefaria.interfaceLang == 'english'});

    return (
        <div className = "searchBox TopicSearchBox ui-front">
          <input className={inputClasses}
            id="searchInput"
            placeholder={Sefaria._("Search Topics")}
            onKeyUp={this.handleSearchKeyUp}
            maxLength={100}
            title={Sefaria._("Search for Topics Here.")}
          />
        </div>
    );
  }
}
TopicSearch.propTypes = {
  lexiconName:      PropTypes.string,    // req. for redirect to text - e.g. TOC case.
  title:            PropTypes.string,    // req. for redirect to text - e.g. TOC case.
  showBaseText:     PropTypes.func,      // req. for redirect to text - e.g. TOC case.
  showWordList:     PropTypes.func,      // req. for sidebar case
  currVersions:     PropTypes.object,    // req. for redirect to text - e.g. TOC case.
  contextSelector:  PropTypes.string.isRequired // CSS Selector for uniquely identifiable context that this is in.
};


export default TopicSearch;