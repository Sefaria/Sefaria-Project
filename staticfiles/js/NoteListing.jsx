import React  from 'react';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import TextRange  from './TextRange';
import { AddToSourceSheetWindow } from './AddToSourceSheet';
import { Note } from './Misc';
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
    if (!confirm(Sefaria._("note_confirm_delete_request"))) { return; }
    const resolve = this.props.onDeleteNote || (()=>{});
    Sefaria.deleteNote(this.props.data._id).then(resolve);
  }
  render() {
    var data = this.props.data;
    var url  = "/" + Sefaria.normRef(data.ref) + "?with=Notes";

    return (<div className="noteListing">
              <div className="actionButtons">
                <img src="/static/icons/sheet.svg" onClick={this.showSheetModal} />
                <img src="/static/icons/circled-x.svg" onClick={this.deleteNote} />
              </div>
              <a href={url}>
                {this.props.showText ?
                  <TextRange sref={data.ref} /> :
                  <span className="textRange placeholder">
                    <span className="title">
                      {data.ref}
                    </span>
                  </span> }
              </a>
              <Note text={data.text} />
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
  showText:     PropTypes.bool,
  onDeleteNote: PropTypes.func,
};
NoteListing.defaultProps = {
  showText: true
};

export default NoteListing;
