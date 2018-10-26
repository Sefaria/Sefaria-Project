const React      = require('react');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const PropTypes  = require('prop-types');
import Component      from 'react-class';


class SearchSheetResult extends Component {
    handleSheetClick(e) {
      var href = e.target.getAttribute("href");
      e.preventDefault();
      var s = this.props.data._source;
      Sefaria.track.event("Search", "Search Result Sheet Click", `${this.props.query} - ${s.sheetId}`,
          {hitCallback: () => window.location = href}
      );
    }
    handleProfileClick(e) {
      var href = e.target.getAttribute("href");
      e.preventDefault();
      var s = this.props.data._source;
      Sefaria.track.event("Search", "Search Result Sheet Owner Click", `${this.props.query} - ${s.sheetId} - ${s.owner_name}`,
          {hitCallback: () => window.location = href}
      );
    }
    render() {
        var data = this.props.data;
        var s = data._source;

        var snippet = data.highlight.content.join("..."); // data.highlight ? data.highlight.content.join("...") : s.content;
        snippet = $("<div>" + snippet.replace(/^[ .,;:!-)\]]+/, "") + "</div>").text();

        function get_version_markup() {
            return {__html: s.version};
        }
        var clean_title = $("<span>" + s.title + "</span>").text();
        var href = "/sheets/" + s.sheetId;
        return (
            <div className='result sheet_result'>
                <a href={href} onClick={this.handleSheetClick}>
                    <div className='result-title'>{clean_title}</div>
                    <div className="snippet">{snippet}</div>
                </a>
              <a href={s.profile_url} onClick={this.handleProfileClick}><div className="version"><img className='img-circle owner_image' src={s.owner_image} alt={s.owner_name} /><span className='owner_name'>{s.owner_name}</span></div></a>
            </div>
        );
    }
}
SearchSheetResult.propTypes = {
  query: PropTypes.string,
  data: PropTypes.object
};


module.exports = SearchSheetResult;
