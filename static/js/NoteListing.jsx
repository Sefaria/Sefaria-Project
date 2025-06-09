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
  render() {
    var data = this.props.data;
    var url  = "/" + Sefaria.normRef(data.ref) + "?with=Notes";

    return (<div className="noteListing">
              <div className="actionButtons">
                <img src="/static/icons/circled-x.svg" onClick={this.deleteNote} />
              </div>
              <a className="noteRefTitle" href={url}>
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
