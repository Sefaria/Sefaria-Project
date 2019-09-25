import React  from 'react';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import {
  ProfilePic,
} from './Misc';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Component      from 'react-class';


class SearchSheetResult extends Component {
    handleSheetClick(e) {
      var href = e.target.closest('a').getAttribute("href");
      e.preventDefault();
      var s = this.props.data._source;
      Sefaria.track.event("Search", "Search Result Sheet Click", `${this.props.query} - ${s.sheetId}`,
          {hitCallback: () => window.location = href}
      );
    }
    handleProfileClick(e) {
      e.preventDefault();
      const href = e.target.closest('a').getAttribute("href");
      const slugMatch = href.match(/profile\/(.+)$/);
      const slug = !!slugMatch ? slugMatch[1] : '';
      const s = this.props.data._source;
      Sefaria.track.event("Search", "Search Result Sheet Owner Click", `${this.props.query} - ${s.sheetId} - ${s.owner_name}`);
      this.props.openProfile(slug, s.owner_name);
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
        const snippetClasses = classNames({contentText: 1, snippet: 1, en: snippetMarkup.lang == "en", he: snippetMarkup.lang == "he"});
        const ownerIsHe = Sefaria.hebrew.isHebrew(s.owner_name);
        const titleIsHe = Sefaria.hebrew.isHebrew(clean_title);
        return (
            <div className='result sheet_result'>
                <a href={href} onClick={this.handleSheetClick}>
                    <div className={classNames({'result-title': 1, 'in-en': !titleIsHe, 'in-he': titleIsHe})}>{clean_title}</div>
                    <div className={snippetClasses} dangerouslySetInnerHTML={snippetMarkup.markup}></div>
                </a>
              <a href={s.profile_url} onClick={this.handleProfileClick}>
                <div className="version">
                  <ProfilePic
                    url={s.owner_image}
                    name={s.owner_name}
                    len={30}
                  />
                  <span className="owner-metadata">
                    <div className={classNames({'owner_name': 1, 'in-en': !ownerIsHe, 'in-he': ownerIsHe})}>{s.owner_name}</div>
                    <div className='tags-views'>
                      <div className='int-en'>{`${s.views} ${Sefaria._('Views')}${(!!s.tags && s.tags.length) ? ' • ' : ''}${!!s.tags ? s.tags.join(', ') : ''}`}</div>
                      <div className='int-he'>{`${s.views} ${Sefaria._('Views')}${(!!s.tags && s.tags.length) ? ' • ' : ''}${!!s.tags ? s.tags.map( t => !!Sefaria.terms[t] ? Sefaria.terms[t].he : t).join(', ') : ''}`}</div>
                    </div>
                  </span>
                </div>
              </a>
            </div>
        );
    }
}
SearchSheetResult.propTypes = {
  query: PropTypes.string,
  data: PropTypes.object,
  openProfile: PropTypes.func.isRequired,
};


export default SearchSheetResult;
