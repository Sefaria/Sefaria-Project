const React      = require('react');
const ReactDOM   = require('react-dom');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
const Footer     = require('./Footer');
const {
  SaveButton
}                                = require('./Misc');
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
    const storyForms = {
      newContent:   NewContentStory,
      newIndex:     NewIndexStory,
      newVersion:   NewVersionStory,
      publishSheet: PublishSheetStory,
      author:       AuthorStory
    };
    const StoryForm = storyForms[props.storyForm];
    return <StoryForm
                storyForm={props.storyForm}
                data={props.data}
                timestamp={props.timestamp}
                natural_time={props.natural_time}
                is_global={props.is_global}
                key={props.timestamp} />;
  }

  render() {
    const classes = {"readerNavMenu": 1};
    const classStr = classNames(classes);

    return (
      <div className={classStr}>
        <div className="content hasFooter">
          <div className="contentInner">
            <div className="storyFeed">
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



class AbstractStory extends Component {
  heTitle(title) {
    return title && Sefaria.index(title)?Sefaria.index(title).heTitle:"";
  }
  url(title) {
    return title && Sefaria.ref(title)?"/" + Sefaria.normRef(Sefaria.ref(title).book):"/" + Sefaria.normRef(title);
  }
  indexColor(title) {
      return title && Sefaria.index(title) ?
      Sefaria.palette.categoryColor(Sefaria.index(title).categories[0]):
      Sefaria.palette.categoryColor("Other");
  }
  naturalTimeBlock() {
      return (
        <div className="timeBlock smallText">
          <span className="int-en">{ Sefaria.util.naturalTime(this.props.timestamp) } ago</span>
          <span className="int-he">&rlm;לפני { Sefaria.util.naturalTime(this.props.timestamp) }</span>
        </div>);
  }
  learnMoreLink(url) {
      return (
        <div className="learnMoreLink smallText"><a href={url}>Learn More ›</a></div>
      );
  }
  /*
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
  } */
  render() {}
}

AbstractStory.propTypes = {
  storyForm: PropTypes.string,
  timestamp: PropTypes.number,
  natural_time: PropTypes.object,
  is_global: PropTypes.bool,
  data:      PropTypes.object,
};

class NewContentStory extends AbstractStory {
    render() {
      const cardStyle = {"borderColor": "#18345D"};

      return (
        <div className="story" style={cardStyle}>
            <div className="storyTypeBlock sectionTitleText">
                <span className="int-en">New Content</span>
                <span className="int-he">תוכן חדש</span>
            </div>
            {this.naturalTimeBlock()}

            <div className="storyBody systemText">
              <span className="int-en" dangerouslySetInnerHTML={ {__html: this.props.data.en } } />
              <span className="int-he" dangerouslySetInnerHTML={ {__html: this.props.data.he } } />
            </div>
        </div>);
    }
}
class NewIndexStory extends AbstractStory {
    render() {
      const title = this.props.data.index;
      const heTitle = this.heTitle(title);
      const url = this.url(title);
      const cardStyle = {"borderColor": this.indexColor(title)};

      return (
        <div className="story" style={cardStyle}>
            <div className="storyTypeBlock sectionTitleText">
                <span className="int-en">New Text</span>
                <span className="int-he">טקסט חדש</span>
            </div>
            {this.naturalTimeBlock()}
            <div className="storyTitle pageTitle">
                <span className="int-en">{title}</span>
                <span className="int-he">{heTitle}</span>
            </div>
            <div className="storyBody systemText">
              <span className="int-en" dangerouslySetInnerHTML={ {__html: this.props.data.en } } />
              <span className="int-he" dangerouslySetInnerHTML={ {__html: this.props.data.he } } />
            </div>
        </div>);
    }
}
class NewVersionStory extends AbstractStory {
    render() {
      const title = this.props.data.index;
      const heTitle = this.heTitle(title);
      const url = this.url(title);
      const cardStyle = {"borderColor": this.indexColor(title)};

      /*
         <div>
              <span className="int-en">New { this.props.data.language == "en"?"English":"Hebrew"} version of <a href={url}>{title}</a>: {this.props.data.version}</span>
              <span className="int-he">גרסה חדשה של <a href={url}>{heTitle}</a> ב{ this.props.data.language == "en"?"אנגלית":"עברית"} : {this.props.data.version}</span>
          </div>
      */
      return (
        <div className="story" style={cardStyle}>
            <div className="storyTypeBlock sectionTitleText">
                <span className="int-en">New Version</span>
                <span className="int-he">גרסה חדשה</span>
            </div>
            {this.naturalTimeBlock()}
            <div className="storyTitle pageTitle">
                <span className="int-en">{title}</span>
                <span className="int-he">{heTitle}</span>
            </div>
            <div className="storyBody systemText">
                <span className="int-en" dangerouslySetInnerHTML={ {__html: this.props.data.en } } />
                <span className="int-he" dangerouslySetInnerHTML={ {__html: this.props.data.he } } />
            </div>
        </div>);
    }
}


class AuthorStory extends AbstractStory {
    /*
       props.data: {
         "author_key"
         "example_work"
         "author_names": {
             "en"
             "he"
         }
         "author_bios": {
             "en"
             "he"
         }
       }
    */
    render() {
      const cardStyle = {"borderColor": this.indexColor(this.props.data.example_work)};
      const url = "/person/" + this.props.data.author_key;

        return (
        <div className="story" style={cardStyle}>
            <div className="storyTypeBlock sectionTitleText">
                <span className="int-en">Author</span>
                <span className="int-he">מחבר</span>
            </div>
            {this.naturalTimeBlock()}
            <div className="storyTitle pageTitle">
                <a href={url}>
                    <span className="int-en">{this.props.data.author_names.en}</span>
                    <span className="int-he">{this.props.data.author_names.he}</span>
                </a>
            </div>
            <div className="storyBody systemText">
                <span className="int-en">{this.props.data.author_bios.en}</span>
                <span className="int-he">{this.props.data.author_bios.he}</span>
            </div>
            <div className="bottomLine">
                {this.learnMoreLink(url)}
            </div>
        </div>);
    }
}
class PublishSheetStory extends AbstractStory {
  /* props.data: {
      publisher_id
      publisher_name
      publisher_url
      publisher_image
      sheet_id
      sheet_title
      sheet_summary
    }
   */
  render() {
      const cardStyle = {"borderColor": "#18345D"};
      const historyObject = {
          ref: "Sheet " + this.props.data.sheet_id,
          sheet_title: this.props.data.sheet_title,
          versions: {} };

      return (
        <div className="story" style={cardStyle}>
            <div className="storyTypeBlock sectionTitleText">
                <span className="int-en">New Sheet</span>
                <span className="int-he">דף מקורות חדש</span>
            </div>
            {this.naturalTimeBlock()}
            <div className="storyTitle pageTitle">
                <a href={"/sheets/" + this.props.data.sheet_id}>
                    <span className="int-en">{this.props.data.sheet_title}</span>
                    <span className="int-he">{this.props.data.sheet_title}</span>
                </a>
            </div>
            {this.props.data.sheet_summary?
                <div className="storyBody systemText">
                    <span className="int-en">{this.props.data.sheet_summary}</span>
                    <span className="int-he">{this.props.data.sheet_summary}</span>
                </div>:""}
            <div className="bottomLine">
                <div className="storyByLine systemText">
                    <a href={this.props.data.publisher_url}>
                        <img src={this.props.data.publisher_image} alt={this.props.data.publisher_name}/>
                        <span className="int-en">by {this.props.data.publisher_name}</span>
                        <span className="int-he">{this.props.data.publisher_name}מאת </span>
                    </a>
                </div>
                <SaveButton
                    historyObject={historyObject}
                    tooltip={true}
                    toggleSignUpModal={this.props.toggleSignUpModal}
                />
            </div>
        </div>
      );
  }
}

module.exports = HomeFeed;
