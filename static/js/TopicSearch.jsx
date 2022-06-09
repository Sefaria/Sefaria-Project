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
      $(ReactDOM.findDOMNode(this)).find("input.search").autocomplete("option", "position", {my: "left top", at: "left bottom", of: this.props.contextSelector + ' .TopicSearchBox'});
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
        Sefaria.topicCompletion(
            request.term,
            d => {
              if (d[0].length > 0) {
                response(d[0].map(function(e) { return {label: e, value: e}}));
              } else {
                response([])
              }
            }
        );
      }.bind(this)
    });
  }
  handleSearchKeyUp(event) {
    if (event.keyCode === 13) {
      const query = $(event.target).val();
      if (query) {
        $(ReactDOM.findDOMNode(this)).find("input.search").autocomplete("close");
        this.submitSearch(query);
      }
    }
  }
  submitSearch(word) {
    alert(Sefaria.topicCompletion(word));
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
  contextSelector:  PropTypes.string.isRequired // CSS Selector for uniquely identifiable context that this is in.
};


export default TopicSearch;