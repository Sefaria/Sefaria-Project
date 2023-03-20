import {
  LoadingMessage,
} from './Misc';

import React  from 'react';
import PropTypes  from 'prop-types';
import Component   from 'react-class';
import Sefaria from "./sefaria/sefaria";

class ExtendedNotes extends Component {
  constructor(props) {
    super(props);
    this.state = {'notesLanguage': Sefaria.interfaceLang, 'extendedNotes': '', 'langToggle': false};
  }
  getVersionData(versionList){
    const versionTitle = this.props.currVersions['en'] ? this.props.currVersions['en'] : this.props.currVersions['he'];
    const thisVersion = versionList.filter(x=>x.versionTitle===versionTitle)[0];
    let extendedNotes = {'english': thisVersion.extendedNotes, 'hebrew': thisVersion.extendedNotesHebrew};

    if (extendedNotes.english && extendedNotes.hebrew){
      this.setState({'extendedNotes': extendedNotes, 'langToggle': true});
    }
    else if (extendedNotes.english && !extendedNotes.hebrew) {
      this.setState({'extendedNotes': extendedNotes, 'notesLanguage': 'english'});
    }
    else if (extendedNotes.hebrew && !extendedNotes.english) {
      this.setState({'extendedNotes': extendedNotes, 'notesLanguage': 'hebrew'});
    }
    else{
      this.props.backFromExtendedNotes();
    }
  }
  componentDidMount() {
    // use Sefaria.getVersions(ref, cb), where cb will invoke setState
    Sefaria.getVersions(this.props.title).then(versions => {
      this.getVersionData(Object.values(versions).flat());
    });
  }
  goBack(event) {
    event.preventDefault();
    this.props.backFromExtendedNotes();
  }
  changeLanguage(event) {
    event.preventDefault();
    if (this.state.notesLanguage==='english') {
      this.setState({'notesLanguage': 'hebrew'});
    }
    else {
      this.setState({'notesLanguage': 'english'});
    }
  }
  render() {
    let notes = '';
    if (this.state.extendedNotes) {
      notes = this.state.extendedNotes[this.state.notesLanguage];
      if (this.state.notesLanguage==='hebrew' && !notes){
        notes = 'לא קיימים רשימות מורחבות בשפה העברית עבור גרסה זו';
      }
      else if (this.state.notesLanguage==='english' && !notes){
        notes = 'Extended notes in English do not exist for this version';
      }
    }
      return <div className="extendedNotes">
        {this.props.backFromExtendedNotes ?<a onClick={this.goBack} href={`${this.props.title}`}>
          {Sefaria.interfaceLang==="hebrew" ? "חזור" : "Back"}
        </a> : ""}
        {this.state.extendedNotes
          ? <div className="extendedNotesText" dangerouslySetInnerHTML={ {__html: notes} }></div>
        : <LoadingMessage/>}
        {this.state.langToggle ? <a onClick={this.changeLanguage} href={`${this.props.title}`}>
          {this.state.notesLanguage==='english' ? 'עברית' : 'English'}
        </a> : ''}
      </div>
  }
}

ExtendedNotes.PropTypes = {
  currVersions:          PropTypes.object.isRequired,
  title:                 PropTypes.string.isRequired,
  backFromExtendedNotes: PropTypes.func,

};

export default ExtendedNotes;
