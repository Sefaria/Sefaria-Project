import React from 'react';
// import TopicSearch from "../TopicSearch";
import {TopicEditor} from "../TopicEditor";
import PropTypes  from 'prop-types';
import Sefaria from "../sefaria/sefaria";
import Component from 'react-class'
import {Autocompleter, InterfaceText} from "../Misc";

// class TopicSearch extends Component {
//   constructor(props) {
//     super(props);
//     this.state = {
//       showAdminEditor: false,
//       value: "",
//     };
//   }
//
//   getSuggestions = async (input) => {
//     let results = {"currentSuggestions": null,
//                         "showAddButton": false};
//     this.changeInputValue(input);
//     if (input === "") {
//       return results;
//     }
//     const word = input.trim();
//     const callback = (d) => {
//         let topics = [];
//         if (d[1].length > 0) {
//           topics = d[1].slice(0, 4).map(function (e) {
//                 return {title: e.title, key: e.key}
//               });
//             }
//         topics.push({title: this.props.createNewTopicStr+word, key: ""})
//         return topics;
//      };
//     const completion_objects = await Sefaria.getTopicCompletions(word, callback);
//     results.currentSuggestions = completion_objects
//         .map(suggestion => ({
//           name: suggestion.title,
//           key: suggestion.key,
//           type: suggestion.type,
//           border_color: "#ffffff"
//         }))
//
//     results.showAddButton = true;
//     return results;
//   }
//
//   validate(input, suggestions) {
//     let match = false;
//     suggestions.map(topic => {
//       if (topic.name.toLowerCase() === input.toLowerCase()) {
//         this.post(topic.key);
//         match = true;
//         this.changeInputValue("");
//       }
//     })
//     if (!match) {
//       alert("Please select an option through the dropdown menu.");
//     }
//   }
//
//   post(slug) {
//       const postJSON = {"topic": slug, 'interface_lang': Sefaria.interfaceLang};
//       const srefs = this.props.srefs;
//       const update = this.props.update;
//       const reset = this.reset;
//       Sefaria.postRefTopicLink(Sefaria.normRef(this.props.srefs), postJSON).then(async () => {
//           const sectionRef = await Sefaria.getRef(Sefaria.normRef(srefs)).sectionRef;
//           srefs.map(sref => {
//               if (!Sefaria._refTopicLinks[sref]) {
//                   Sefaria._refTopicLinks[sref] = [];
//               }
//               Sefaria._refTopicLinks[sref].push(data);
//           });
//           if (!Sefaria._refTopicLinks[sectionRef]) {
//               Sefaria._refTopicLinks[sectionRef] = [];
//           }
//           Sefaria._refTopicLinks[sectionRef].push(data);
//           update();
//           reset();
//           alert("Topic added.");
//       });
//   }
//
//   changeInputValue = (newValue) => {
//     if (newValue.startsWith(this.props.createNewTopicStr)) {
//         this.setState({showAdminEditor: true, value: newValue.replace(this.props.createNewTopicStr, "")});
//     }
//     else {
//         this.setState({value: newValue});
//     }
//   }
//
//   reset = () => {
//       this.setState({showAdminEditor: false, value: ""});
//   }
//
//
//   render() {
//         if (this.state.showAdminEditor) {
//             const topicData = {origEnTitle: this.state.value};
//             return <TopicEditor origData={topicData} close={this.reset} onCreateSuccess={this.post}/>;
//         }
//         else {
//             return (<Autocompleter selectedCallback={this.validate}
//                  getSuggestions={this.getSuggestions}
//                  inputPlaceholder={Sefaria.translation(this.props.contentLang, "Search for a Topic")}
//                  buttonTitle={Sefaria.translation(this.props.contentLang, "Add Topic")}
//                  inputValue={this.state.value}
//                  changeInputValue={this.changeInputValue}
//                  showSuggestionsOnSelect={false}
//                  autocompleteClassNames="topicSearch addInterfaceInput"
//             />)
//         }
//   }
// }
// TopicSearch.propTypes = {
//   contextSelector:  PropTypes.string.isRequired, // CSS Selector for uniquely identifiable context that this is in.
//   srefs: PropTypes.array.isRequired, //srefs of TopicList
//   update: PropTypes.func.isRequired, //used to add topic to TopicList
//   createNewTopicStr: PropTypes.string.isRequired, // string that should be displayed when there's an option to create new topic
//   contentLang: PropTypes.string.isRequired //
// };
import { useState } from 'react';

const TopicSearch = (props) => {
  const [showAdminEditor, setShowAdminEditor] = useState(false);
  const [value, setValue] = useState("");

  const getSuggestions = async (input) => {
    let results = {
      currentSuggestions: null,
      showAddButton: false,
    };
    changeInputValue(input);
    if (input === "") {
      return results;
    }
    const word = input.trim();
    const callback = (d) => {
      let topics = [];
      if (d[1].length > 0) {
        topics = d[1].slice(0, 4).map((e) => ({
          title: e.title,
          key: e.key,
        }));
      }
      return topics;
    };
    // const completionObjects = await Sefaria.getTopicCompletions(word, callback());
    let returnValue = await Sefaria.getTopicCompletions(word);
    const completionObjects = callback(returnValue)
    results.currentSuggestions = completionObjects.map((suggestion) => ({
      name: suggestion.title,
      key: suggestion.key,
      type: suggestion.type,
      border_color: "#ffffff",
    }));

    results.showAddButton = true;
    return results;
  };

  const selectedCallback = (input, suggestion) => {
    console.log(input, suggestion)
  }
  const changeInputValue = (newValue) => {
    setValue(newValue);
  }

  return (
      <Autocompleter
        selectedCallback={selectedCallback}
        getSuggestions={getSuggestions}
        inputPlaceholder={Sefaria.translation(props.contentLang, "Search for a Topic")}
        buttonTitle={Sefaria.translation(props.contentLang, "Add Topic")}
        inputValue={value}
        changeInputValue={changeInputValue}
        showSuggestionsOnSelect={false}
        autocompleteClassNames="topicSearch addInterfaceInput"
      />
    );
};

export const TopicsSearchAutocomplete = ({}) => {
    return (<TopicSearch/>);
};
