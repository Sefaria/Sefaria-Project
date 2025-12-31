import React  from 'react';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import { AddToSourceSheetWindow } from './AddToSourceSheet';
import { Note, LoadingMessage } from './Misc';
import PropTypes  from 'prop-types';
import Component      from 'react-class';

class NoteListing extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showSheetModal: false
    };
  }
  componentDidUpdate(prevProps, prevState) {
    if (!prevState.showSheetModal && this.state.showSheetModal) {
      this.positionSheetModal();
    }
  }
  showSheetModal() {
    this.setState({showSheetModal: true});
  }
  hideSheetModal() {
    this.setState({showSheetModal: false});
  }
  positionSheetModal() {
    $(".addToSourceSheetModal").position({my: "center center-40", at: "center center", of: window});
  }
  deleteNote() {
    if (!confirm(Sefaria._("Are you sure you want to delete this note?"))) { return; }
    const resolve = this.props.onDeleteNote || (()=>{});
    Sefaria.deleteNote(this.props.data._id).then(resolve);
  }
  getNoteURL(ref) {
    // This helper function returns the a tag linking to the given ref of the note  When the URL is to a ref in the library, 
    // returning the appropriate a tag is very simple, but when the ref is to a sheet, we need to modify the ref and set the data-target-module attribute to the voices module.
    // If the ref is to a sheet, the ref will be something like "Sheet 3.4" but it needs to link to "/sheets/3.4" in the voices module.
    const isSheet = Sefaria.isSheetRef(ref);
    let path, noteURL;
    const module = isSheet ? Sefaria.VOICES_MODULE : Sefaria.LIBRARY_MODULE;
    if (isSheet) {
      const parsedRef = Sefaria.parseRef(ref);
      path = `/sheets/${parsedRef.sections.join('.')}`;
      noteURL = new URL(path, Sefaria.getModuleURL(module));
    }
    else {
      path = `/${ref}`;
      noteURL = new URL(path, Sefaria.getModuleURL(module));
      noteURL.searchParams.set('with', 'Notes');  // side panel should only open to show notes in Library module
    }
    return <a className="noteRefTitle" href={noteURL.toString()} data-target-module={module}>
            <span>{ref}</span>
          </a>
  }
  render() {
    const noteLink = this.getNoteURL(this.props.data.ref);
    var data = this.props.data;
    return (<div className="noteListing">
              <div className="actionButtons">
                <img src="/static/icons/circled-x.svg" onClick={this.deleteNote} alt={Sefaria._("Delete note")} />
              </div>
              {noteLink}
              <span className="noteText"><Note text={data.text}/></span>
              {this.state.showSheetModal &&
                <div>
                  <AddToSourceSheetWindow
                    srefs={[data.ref]}
                    note={data.text}
                    close={this.hideSheetModal} />
                  <div className="mask" onClick={this.hideSheetModal}></div>
                </div>
              }
            </div>);
  }
}
NoteListing.propTypes = {
  data:         PropTypes.object.isRequired,
  onDeleteNote: PropTypes.func,
};

const NotesList = ({notes}) => {  
  return (
    notes && notes.length ? 
      notes.map((item, i) => (
        <NoteListing data={item} key={i} />
      ))
    : <LoadingMessage message="You haven't written any notes yet." heMessage="טרם הוספת רשומות משלך" />)};


export default NoteListing;
export { NotesList };
