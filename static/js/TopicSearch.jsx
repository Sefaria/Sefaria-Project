import React  from 'react';
import ReactDOM  from 'react-dom';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import Component from 'react-class'
import {InterfaceText} from "./Misc";

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
        $(ReactDOM.findDOMNode(this)).find("input.search").val(ui.item.label);  // This will disappear when the next line executes, but the eye can sometimes catch it.
        this.submitSearch(ui.item.value);
        return false;
      }.bind(this),

      source: function(request, response) {
        Sefaria.topicCompletion(
            request.term,
            d => {
              if (d[1].length > 0) {
                response(d[1].map(function(e) { return {label: e.title, value: e.key}}));
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
  submitSearch(topic) {

    const postJSON = JSON.stringify( {"topic": topic})
    $.post("/api/ref-topic-links/"+Sefaria.normRef(this.props.srefs), {"json": postJSON}, function(data) {
        if (data.error) {
          alert(data.error);
        } else {
          this._refTopicLinks[this.props.srefs] = data;
          this.props.update();
        }
        }).fail( function(xhr, status, errorThrown) {
          alert("Unfortunately, there may have been an error saving this topic information: "+errorThrown);
        });
  }
  render() {
    let inputClasses = classNames({search: 1});

    return (
        <div className = "searchBox TopicSearchBox ui-front">
          <input className={inputClasses}
            id="searchInput"
            placeholder={Sefaria._("Search for Topics Here.")}
            onKeyUp={this.handleSearchKeyUp}
            maxLength={100}
            title={Sefaria._("Topic Search")}
          />
          <div onClick={this.submitSearch} id="submitSearch" className="button small addTopic" tabIndex="0" role="button">
            <InterfaceText>Add Topic</InterfaceText>
          </div>
        </div>
    );
  }
}
TopicSearch.propTypes = {
  contextSelector:  PropTypes.string.isRequired, // CSS Selector for uniquely identifiable context that this is in.
  srefs: PropTypes.array.isRequired, //srefs of TopicList
  update: PropTypes.func.isRequired //used to add topic to TopicList
};


export default TopicSearch;