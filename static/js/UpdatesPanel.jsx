const React      = require('react');
import Component from 'react-class';


class UpdatesPanel extends Component {
  render() {
    return (
      <div>
        <span>Retired!</span>
      </div>);
  }
}

/*
class SingleUpdate extends Component {

  onDelete() {
    this.props.onDelete(this.props.id);
  }
  render() {
    var title = this.props.content.index;
    if (title) {
      var heTitle = Sefaria.index(title)?Sefaria.index(title).heTitle:"";
    }

    var url = Sefaria.ref(title)?"/" + Sefaria.normRef(Sefaria.ref(title).book):"/" + Sefaria.normRef(title);

    var d = new Date(this.props.date);

    return (
      <div className="notification">
        <div className="date">
          <span className="int-en">{d.toLocaleDateString("en")}</span>
          <span className="int-he">{d.toLocaleDateString("he")}</span>
          {Sefaria.is_moderator?<i className="fa fa-times-circle delete-update-button" onClick={this.onDelete} aria-hidden="true"/>:""}
        </div>

        {this.props.type == "newIndex"?
        <div>
            <span className="int-en">New Text: <a href={url}>{title}</a></span>
            <span className="int-he">טקסט חדש זמין: <a href={url}>{heTitle}</a></span>
        </div>
        :""}

        {this.props.type == "newVersion"?
        <div>
            <span className="int-en">New { this.props.content.language == "en"?"English":"Hebrew"} version of <a href={url}>{title}</a>: {this.props.content.version}</span>
            <span className="int-he">גרסה חדשה של <a href={url}>{heTitle}</a> ב{ this.props.content.language == "en"?"אנגלית":"עברית"} : {this.props.content.version}</span>
        </div>
        :""}

        <div>
            <span className="int-en" dangerouslySetInnerHTML={ {__html: this.props.content.en } } />
            <span className="int-he" dangerouslySetInnerHTML={ {__html: this.props.content.he } } />
        </div>


      </div>);
  }
}
SingleUpdate.propTypes = {
  id:         PropTypes.string,
  type:         PropTypes.string,
  content:      PropTypes.object,
  onDelete:     PropTypes.func,
  date:         PropTypes.string
};

*/
module.exports = UpdatesPanel;
