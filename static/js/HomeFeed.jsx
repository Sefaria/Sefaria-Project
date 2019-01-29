const React      = require('react');
const ReactDOM   = require('react-dom');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
const Footer     = require('./Footer');
import Component from 'react-class';


class HomeFeed extends Component {
  constructor(props) {
    super(props);

    this.state = {
      page: 0,
      loadedToEnd: false,
      loading: false,
      updates: [],
      submitting: false,
      submitCount: 0,
      error: null
    };
  }
  componentDidMount() {
    $(ReactDOM.findDOMNode(this)).find(".content").bind("scroll", this.handleScroll);
    this.getMoreStories();
  }
  handleScroll() {
    if (this.state.loadedToEnd || this.state.loading) { return; }
    var $scrollable = $(ReactDOM.findDOMNode(this)).find(".content");
    var margin = 100;
    if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
      this.getMoreStories();
    }
  }
  getMoreStories() {
    $.getJSON("/api/updates?page=" + this.state.page, this.loadMoreStories);
    this.setState({loading: true});
  }
  loadMoreStories(data) {
    if (data.count < data.page_size) {
      this.setState({loadedToEnd: true});
    }
    this.setState({page: data.page + 1, loading: false, updates: this.state.updates.concat(data.updates)});
  }
  /*
  onDelete(id) {
    $.ajax({
        url: '/api/updates/' + id,
        type: 'DELETE',
        success: function(result) {
          if (result.status == "ok") {
              this.setState({updates: this.state.updates.filter(u => u._id != id)});
          }
        }.bind(this)
    });
  }
  */


  Story(props) {
    const components = {
      newContent: NewContentStory,
      newIndex:   NewIndexStory,
      newVersion: NewVersionStory
    };
    const SpecificStory = components[props.storyForm];
    return <SpecificStory data={props.data} />;
  }

  render() {
    const classes = {};
    const classStr = classNames(classes);

    return (
      <div className={classStr}>
        <div className="content hasFooter">
          <div className="contentInner">

            <div className="notificationsList">
            {this.state.updates.map(u =>
                <Story
                    type={u.type}
                    content={u.content}
                    date={u.date}
                    key={u._id}
                    id={u._id}
                    onDelete={this.onDelete}
                    submitting={this.state.submitting}
                />
            )}
            </div>
          </div>
          <footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
            <Footer />
          </footer>
        </div>
      </div>);
  }
}
HomeFeed.propTypes = {
  interfaceLang:  PropTypes.string
};



class Story extends Component {

  onDelete() {
    // this.props.onDelete(this.props.id);
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

        {this.props.type == "index"?
        <div>
            <span className="int-en">New Text: <a href={url}>{title}</a></span>
            <span className="int-he">טקסט חדש זמין: <a href={url}>{heTitle}</a></span>
        </div>
        :""}

        {this.props.type == "version"?
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

Story.propTypes = {
  data:      PropTypes.object,
};

class NewContentStory extends Story {
    render() {
    }
}
class NewIndexStory extends Story {
    render() {
    }
}
class NewVersionStory extends Story {
    render() {
    }
}

module.exports = HomeFeed;
