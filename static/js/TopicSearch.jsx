import React  from 'react';
import ReactDOM  from 'react-dom';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import Component from 'react-class'
import {Autocompleter, InterfaceText} from "./Misc";
import {TopicEditor} from "./TopicEditor";


class TopicSearch extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showTopicEditor: false,
      selected: false
    };
  }

  async getSuggestions(input) {
    const word = input.trim();
    const callback = (d) => {
        let topics = [];
        if (d[1].length > 0) {
          topics = d[1].map(function (e) {
                return {title: e.title, key: e.key}
              });
            }
        topics.push({title: "Create new topic: "+word, key: ""})
        return topics;
     };
    const result = await Sefaria._cachedApiPromise({url: Sefaria.apiHost + "/api/topic/completion/" + word, key: word,
                              store: Sefaria._topicCompletions, processor: callback});
    return [result, {}];
  }
  validate(input, suggestions) {
    let match = false;
    suggestions.map(topic => {
      if (topic.name.toLowerCase() === input.toLowerCase()) {
        this.post(topic.key);
        match = true;
      }
    })
    if (!match) {
      alert("Please select an option through the dropdown menu.");
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
        }
      }).fail(function (xhr, status, errorThrown) {
        alert("Unfortunately, there may have been an error saving this topic information: " + errorThrown);
      });
  }

  showAddButtonFxFilter = (d, input, completion_objects) => {
    const results = completion_objects.some(x => {return input === x.title; });
    return !!results;
  }
  onClickSuggestions = (title) => {
    if (title.startsWith("Create new topic:")) {
      this.setState({showTopicEditor: true});
    }
  }
  render() {
    return (
        <Autocompleter selectedRefCallback={this.validate}
                 getSuggestions={this.getSuggestions}
                 onClickSuggestion={this.onClickSuggestions}
                showSuggestionsFx={(d) => {return true;}}
                showPreviewFx={(d) => {return false;}}
                showAddressCompletionsFx={(d) => {return false;}}
                showAddButtonFx={(d) => {return true;}}
                 borderColorFx={(d) => "#ffffff"}
                 limit={11}
                searchForStr="Search for a Text or Commentator."/>
    );
  }
}
TopicSearch.propTypes = {
  contextSelector:  PropTypes.string.isRequired, // CSS Selector for uniquely identifiable context that this is in.
  srefs: PropTypes.array.isRequired, //srefs of TopicList
  update: PropTypes.func.isRequired //used to add topic to TopicList
};


export default TopicSearch;