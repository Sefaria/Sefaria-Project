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
    // This helper function returns the URL of the note for the given ref.  When the URL is to a ref in the library, 
    // this is very simple, but when the ref is to a sheet, we need to modify the ref and change the link so that it sends the user to the voices module.
    // The ref will be something like "Sheet 3.4" but it needs to link to "/sheets/3.4" in the voices module.
    const isSheet = Sefaria.isSheetRef(ref);
    if (isSheet) {
      moduleURL = Sefaria.getModuleURL(Sefaria.VOICES_MODULE);
      const parsedRef = Sefaria.parseRef(ref);
      path = `/sheets/${parsedRef.sections.join('/')}`;
    }
    else {
      module = Sefaria.getModuleURL(Sefaria.LIBRARY_MODULE);
      path = `/${ref}`;
    }
    const noteURL = new URL(path, moduleURL);
    noteURL.searchParams.set('with', 'Notes');  
    return noteURL.toString();
  }
  render() {
    const noteURL = this.getNoteURL(this.props.data.ref);
    var data = this.props.data;
    return (<div className="noteListing">
              <div className="actionButtons">
                <img src="/static/icons/circled-x.svg" onClick={this.deleteNote} alt={Sefaria._("Delete note")} />
              </div>
              <a className="noteRefTitle" href={noteURL}>
                <span>{data.ref}</span>
              </a>
              <span className="noteText"><Note text={data.text}/></span>
              {this.state.showSheetModal ?
                <div>
                  <AddToSourceSheetWindow
                    srefs={[data.ref]}
                    note={data.text}
                    close={this.hideSheetModal} />
                  <div className="mask" onClick={this.hideSheetModal}></div>
                </div>
                : null }

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
