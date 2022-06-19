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
      slug: "", //topic slug
      topics: [], //current list of autocomplete topics based on query
      autocomplete: null,
      showTopicEditor: false,
      selected: false
    };
  }
  componentDidMount() {
    this.initAutocomplete();
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
      classes: {
        "ui-autocomplete": "topic-toc-autocomplete"
      },
      minLength: 1,
      focus: function (event, ui) {
        this.setState({label: ui.item.label});
        $(ReactDOM.findDOMNode(this)).find("input.search").val(this.state.label);
      }.bind(this),
      select: function( event, ui ) {
        if (ui.item.key == "__invalid") { return false; }
        if (ui.item.key === "") {  //selected Create new topic
          this.setState({slug: ui.item.key, label: ui.item.label.replace("Create new topic: ", ""), selected: true, showTopicEditor: true});
        }
        else {
          this.setState({slug: ui.item.key, label: ui.item.label, selected: true, showTopicEditor: false});
        }
        $(ReactDOM.findDOMNode(this)).find("input.search").val(this.state.label);
        return false;
      }.bind(this),

      source: function(request, response) {
        this.setState({slug: "", label: request.term});
        Sefaria.topicCompletion(
            request.term,
            function(d) {
                    let topics = [];
                    if (d[1].length > 0) {
                      topics = d[1].map(function (e) {
                        return {label: e.title, value: e.title, key: e.key}
                      });
                    }
                    topics.push({"label": "Create new topic: "+request.term, "value": "", key: ""})
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
              Sefaria._refTopicLinks[sref] = [];
            }
            Sefaria._refTopicLinks[sref].push(data);
          });
          if (!Sefaria._refTopicLinks[sectionRef]) {
            Sefaria._refTopicLinks[sectionRef] = [];
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
    this.setState({showTopicEditor: false, label: "", selected: false, slug: "", topics: []});
    $(ReactDOM.findDOMNode(this)).find("input.search").val(this.state.label);
  }
  render() {
    let inputClasses = classNames({search: 1, selected: this.state.selected});

    return (
        <div className = "searchBox TopicSearchBox ui-front">
          {this.state.showTopicEditor ? <TopicEditor origEn={this.state.label} close={this.reset} redirect={this.post}/> : null}
          <input className={inputClasses}
            id="searchInput"
            placeholder={Sefaria._("Search for Topics Here.")}
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