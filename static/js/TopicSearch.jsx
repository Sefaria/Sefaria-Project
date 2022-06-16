import React  from 'react';
import ReactDOM  from 'react-dom';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import Component from 'react-class'
import {InterfaceText} from "./Misc";
import TopicEditor from "./TopicEditor";


class TopicSearch extends Component {
  constructor(props) {
    super(props);

    this.state = {
      label: "", // what the user sees in drop down menu. e.g. topic title
      timer: null,
      slug: "", //topic slug
      topics: [], //current list of autocomplete topics based on query
      autocomplete: null,
      showTopicEditor: false,
      selected: false
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
    if (this.state.label != current) {
      $(ReactDOM.findDOMNode(this)).find("input.search").autocomplete("option", "position", {my: "left top", at: "left bottom", of: this.props.contextSelector + ' .TopicSearchBox'});
      $(ReactDOM.findDOMNode(this)).find("input.search").autocomplete("search");
    }
    this.setState({
      label: current,
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
        const menuItems = ReactDOM.findDOMNode(this).getElementsByClassName("ui-menu-item");
        const lastItem = menuItems[menuItems.length-1];
        $(lastItem).toggleClass("ui-menu-last-item");
      }.bind(this),
      close: function(event) {
        this.setState({
          label: $(ReactDOM.findDOMNode(this)).find("input.search").val()
        });
        this.checkIfChanged();
      }.bind(this),
      classes: {
        "ui-autocomplete": "topic-toc-autocomplete"
      },
      minLength: 1,
      focus: e => clearTimeout(this.state.timer),
      select: function( event, ui ) {
        if (ui.item.value == "__invalid") { return false; }
        $(ReactDOM.findDOMNode(this)).find("input.search").val(ui.item.label);  // This will disappear when the next line executes, but the eye can sometimes catch it.
        this.setState({slug: ui.item.value, showTopicEditor: ui.item.value === "", selected: true});
        return false;
      }.bind(this),

      source: function(request, response) {
        this.setState({slug: ""});
        Sefaria.topicCompletion(
            request.term,
            function(d) {
                    let topics = [];
                    if (d[1].length > 0) {
                      topics = d[1].map(function (e) {
                        return {label: e.title, value: e.key}
                      });
                    }
                    topics.push({"label": "Create new topic: "+this.state.label, "value": ""})
                    this.setState({topics: topics, selected: false});
                    response(topics);
            }.bind(this)
        );
      }.bind(this)
    });
  }

  validate() {
    if (this.state.slug === "") {
      let match = false;
      this.state.topics.map(topic => {
        if (topic.label.toLowerCase() === this.state.label.toLowerCase()) {
          this.post(topic.value);
          match = true;
        }
      })
      if (!match) {
        alert("Please select an option through the dropdown menu.");
      }
    } else {
      this.post(this.state.slug);
    }
  }

  post(slug) {
      const postJSON = JSON.stringify({"topic": slug});
      const srefs = this.props.srefs;
      const update = this.props.update;
      const reset = this.reset;
      $.post("/api/ref-topic-links/" + Sefaria.normRef(this.props.srefs), {"json": postJSON}, async function (data) {
        if (data.error) {
          alert(data.error);
        } else {
          const sectionRef = await Sefaria.getRef(Sefaria.normRef(srefs)).sectionRef;
          srefs.map(sref => {
            if (!Sefaria._refTopicLinks[sref]) {
              Sefaria._refTopicLinks[sref] = []
            }
            Sefaria._refTopicLinks[sref].push(data)
          });
          if (!Sefaria._refTopicLinks[sectionRef]) {
            Sefaria._refTopicLinks[sectionRef] = []
          }
          Sefaria._refTopicLinks[sectionRef].push(data);
          update();
          alert("Topic added.");
          reset();
        }
      }).fail(function (xhr, status, errorThrown) {
        alert("Unfortunately, there may have been an error saving this topic information: " + errorThrown);
      });
  }
  reset() {
    $(ReactDOM.findDOMNode(this)).find("input.search").val("");
    this.setState({showTopicEditor: false, label: "", selected: false, slug: "", topics: []});
  }
  render() {
    let inputClasses = classNames({search: 1, selected: this.state.selected});

    return (
        <div className = "searchBox TopicSearchBox ui-front">
          {this.state.showTopicEditor ? <TopicEditor origEn={this.state.label} close={this.reset} redirect={false}/> : null}
          <input className={inputClasses}
            id="searchInput"
            placeholder={Sefaria._("Search for Topics Here.")}
            onKeyUp={this.handleSearchKeyUp}
            maxLength={100}
            title={Sefaria._("Topic Search")}
          />
          <div onClick={this.validate} id="submit" className="button small addTopic" tabIndex="0" role="button">
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