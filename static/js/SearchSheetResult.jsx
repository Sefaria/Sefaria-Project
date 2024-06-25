import React  from 'react';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Component      from 'react-class';
import {
    ColorBarBox, InterfaceText,
    ProfilePic,
} from './Misc';
import SheetResult from "./Sheets/SheetResult";


class SearchSheetResult extends Component {
    handleSheetClick(e) {
      var s = this.props.data._source;
      if (this.props.onResultClick) {
        e.preventDefault()
        this.props.onResultClick("Sheet " + s.sheetId);
      }
      Sefaria.track.event("Search", "Search Result Sheet Click", `${this.props.query} - ${s.sheetId}`);
    }
    handleProfileClick(e) {
      const s = this.props.data._source;
      Sefaria.track.event("Search", "Search Result Sheet Owner Click", `${this.props.query} - ${s.sheetId} - ${s.owner_name}`);
    }
    get_snippet_markup(data) {
      let snippet = data.highlight.content.join("..."); // data.highlight ? data.highlight.content.join("...") : s.content;
      snippet = snippet.replace(/^[ .,;:!-)\]]+/, "");
      const lang = Sefaria.hebrew.isHebrew(snippet) ? "he" : "en";
      return { markup: {__html: snippet}, lang };
    }
    render() {
        const data = this.props.data;
        const s = data._source;
        var clean_title = $("<span>" + s.title + "</span>").text();
        var href = "/sheets/" + s.sheetId;
        const snippetMarkup = this.get_snippet_markup(data);
        return <SheetResult href={href} clean_title={clean_title} handleSheetClick={this.handleSheetClick}
                snippetMarkup={snippetMarkup} profile_url={s.profile_url} owner_name={s.owner_name} owner_image={s.owner_image}/>;
    }
}
SearchSheetResult.propTypes = {
  query: PropTypes.string,
  data: PropTypes.object,
  onResultClick: PropTypes.func
};


export default SearchSheetResult;
