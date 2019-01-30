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
      stories: [],
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
    $.getJSON("/api/stories?page=" + this.state.page, this.loadMoreStories);
    this.setState({loading: true});
  }
  loadMoreStories(data) {
    if (data.count < data.page_size) {
      this.setState({loadedToEnd: true});
    }
    this.setState({page: data.page + 1, loading: false, stories: this.state.stories.concat(data.stories)});
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

  //This is a pseudo Component.  It uses "storyForm" to determine the component to render.
  Story(props) {
    const components = {
      newContent: NewContentStory,
      newIndex:   NewIndexStory,
      newVersion: NewVersionStory
    };
    const SpecificStory = components[props.storyForm];
    return <SpecificStory
                storyForm={props.storyForm}
                data={props.data}
                timestamp={props.timestamp}
                is_global={props.is_global}
                key={props.timestamp} />;
  }

  render() {
    const classes = {};
    const classStr = classNames(classes);

    return (
      <div className={classStr}>
        <div className="content hasFooter">
          <div className="contentInner">

            <div className="notificationsList">
            {this.state.stories.map(s => this.Story(s))}
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
  heTitle(title) {
    return title && Sefaria.index(title)?Sefaria.index(title).heTitle:"";
  }
  url(title) {
    return title && Sefaria.ref(title)?"/" + Sefaria.normRef(Sefaria.ref(title).book):"/" + Sefaria.normRef(title);
  }
  date() {
    return new Date(this.props.timestamp * 1000)
  }

  dateBlock() {
    const d = this.date();
    return (
      <div className="date">
          <span className="int-en">{d.toLocaleDateString("en")}</span>
          <span className="int-he">{d.toLocaleDateString("he")}</span>
      </div>
    );
  }
  render() {}
}

Story.propTypes = {
  storyForm: PropTypes.string,
  timestamp: PropTypes.number,
  is_global: PropTypes.bool,
  data:      PropTypes.object,
};

class NewContentStory extends Story {
    render() {
      return (
        <div className="story">
          {this.dateBlock()}
          <div>
              <span className="int-en" dangerouslySetInnerHTML={ {__html: this.props.data.en } } />
              <span className="int-he" dangerouslySetInnerHTML={ {__html: this.props.data.he } } />
          </div>
        </div>);
    }
}
class NewIndexStory extends Story {
    render() {
      const title = this.props.data.index;
      const heTitle = this.heTitle(title);
      const url = this.url(title);

      return (
        <div className="story">
          {this.dateBlock()}
          <div>
              <span className="int-en">New Text: <a href={url}>{title}</a></span>
              <span className="int-he">טקסט חדש זמין: <a href={url}>{heTitle}</a></span>
          </div>
          <div>
              <span className="int-en" dangerouslySetInnerHTML={ {__html: this.props.data.en } } />
              <span className="int-he" dangerouslySetInnerHTML={ {__html: this.props.data.he } } />
          </div>
        </div>);
    }
}
class NewVersionStory extends Story {
    render() {
      const title = this.props.data.index;
      const heTitle = this.heTitle(title);
      const url = this.url(title);

      return (
        <div className="story">
          {this.dateBlock()}
          <div>
              <span className="int-en">New { this.props.data.language == "en"?"English":"Hebrew"} version of <a href={url}>{title}</a>: {this.props.data.version}</span>
              <span className="int-he">גרסה חדשה של <a href={url}>{heTitle}</a> ב{ this.props.data.language == "en"?"אנגלית":"עברית"} : {this.props.data.version}</span>
          </div>
          <div>
              <span className="int-en" dangerouslySetInnerHTML={ {__html: this.props.data.en } } />
              <span className="int-he" dangerouslySetInnerHTML={ {__html: this.props.data.he } } />
          </div>
        </div>);
    }
}

module.exports = HomeFeed;
