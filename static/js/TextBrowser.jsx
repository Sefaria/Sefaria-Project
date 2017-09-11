const React       = require('react');
const ReactDOM    = require('react-dom');
const $           = require('./sefaria/sefariaJquery');
const Sefaria     = require('./sefaria/sefaria');
const ReaderPanel = require('./ReaderPanel');
const classNames  = require('classnames');
const PropTypes   = require('prop-types');
import Component from 'react-class';


class TextBrowser extends Component {
  constructor(props) {
    super(props);
    this.state = {ref: null}
  }
  handleRefSelection(ref) {
    this.setState({ref: Sefaria.humanRef(ref)});
  }
  acceptRef() {
    this.props.onSuccess(this.state.ref);
  }
  render() {
    var message = this.state.ref ? this.state.ref :
      <div>
        <div className="int-en">Select a text above.</div>
        <div className="int-he">Select a text above.</div>
      </div>;

    return (
      <div className="textBrowser">
        <ReaderPanel
          initialMenu="compare"
          onSegmentClick={this.handleRefSelection}
          setTextListHighlight={this.handleRefSelection}
          closePanel={this.props.onClose} />
        <div className="textBrowserStatus">
          <div className="message">{message}</div>
          <div className="buttons">
            {this.state.ref ? 
            <div className="button small" onClick={this.acceptRef}>
              <span className="int-en">OK</span>
              <span className="int-he">OK</span>
            </div>
            : null }
            <div className="button small" onClick={this.props.onClose}>
              <span className="int-en">Cancel</span>
              <span className="int-he">Cancel</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
TextBrowser.propTypes = {
  onSuccess: PropTypes.func.isRequired,
  onClose:   PropTypes.func.isRequired,
};


const openTextBrowserWidget = function(callback) {
	// Manages TextBrowser rendered as a modal in a non-react context
    var closeWidget = function() {
        var container = document.getElementById('textBrowserModal');
        ReactDOM.unmountComponentAtNode(container); 
        $("#textBrowserModalBox").remove();    	
    }
    $("#textBrowserModalBox").remove();
    $("#content").append("<div id='textBrowserModalBox'>" +
              "<div class='overlay'></div>" +
              "<div id='textBrowserModal'></div>" + 
            "</div>");

    $(".overlay").click(closeWidget);
    var container = document.getElementById('textBrowserModal');
    var component = React.createElement(TextBrowser, {
      onSuccess: function(ref) { 
      	callback(ref);
      	closeWidget();
      },
      onClose: closeWidget,
    });
    ReactDOM.render(component, container);
    $("#textBrowserModal").position({of: window});
  }


module.exports.TextBrowser           = TextBrowser;
module.exports.openTextBrowserWidget = openTextBrowserWidget;