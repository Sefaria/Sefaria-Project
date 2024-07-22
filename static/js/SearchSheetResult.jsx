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


class SearchSheetResult extends Component {
    handleSheetClick(e) {
      const s = this.props.metadata;
      if (this.props.onResultClick) {
        e.preventDefault()
        this.props.onResultClick("Sheet " + s.sheetId);
      }
      Sefaria.track.event("Search", "Search Result Sheet Click", `${this.props.query} - ${s.sheetId}`);
    }
    handleProfileClick(e) {
      const s = this.props.metadata;
      Sefaria.track.event("Search", "Search Result Sheet Owner Click", `${this.props.query} - ${s.sheetId} - ${s.owner_name}`);
    }
    get_snippet_markup() {
      const snippet = this.props.snippet.replace(/^[ .,;:!-)\]]+/, "");
      const lang = Sefaria.hebrew.isHebrew(snippet) ? "he" : "en";
      return { markup: {__html: snippet}, lang };
    }
    formatDate(dateString) {
        const date = new Date(dateString);
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return new Intl.DateTimeFormat('en-US', options).format(date);
    }
    render() {
        const s = this.props.metadata;
        var clean_title = $("<span>" + s.title + "</span>").text();
        var href = "/sheets/" + s.sheetId;
        const snippetMarkup = this.get_snippet_markup();
        const snippetClasses = classNames({snippet: 1, en: snippetMarkup.lang === "en", he: snippetMarkup.lang === "he"});
        const ownerIsHe = Sefaria.hebrew.isHebrew(s.owner_name);
        const titleIsHe = Sefaria.hebrew.isHebrew(clean_title);
        const dateString = this.formatDate(this.props.metadata.dateCreated);
        return (
            <div className='result sheetResult'>
                <div className="sheetData sans-serif">
                    <a className="ownerData sans-serif" href={s.profile_url} onClick={this.handleProfileClick}>
                        <ProfilePic
                            url={s.owner_image}
                            name={s.owner_name}
                            len={30}
                        />
                        <span className={classNames({
                            'ownerName': 1,
                            'in-en': !ownerIsHe,
                            'in-he': ownerIsHe
                        })}>{s.owner_name}</span>
                        <span className="bullet">{'\u2022'}</span>
                        <span className="date">
                                {dateString}
                            </span>
                    </a>
                </div>
                <a href={href} onClick={this.handleSheetClick}>
                    <div className={classNames({'result-title': 1, 'in-en': !titleIsHe, 'in-he': titleIsHe})}>
                        <span dir={titleIsHe ? "rtl" : "ltr"}>{clean_title}</span>
                    </div>
                    <div className={snippetClasses}>
                        <span dir={snippetMarkup.lang === 'he' ? "rtl" : "ltr"}
                              dangerouslySetInnerHTML={snippetMarkup.markup}></span>
                    </div>
                </a>
            </div>
        );
    }
}

SearchSheetResult.propTypes = {
    query: PropTypes.string,
    hit: PropTypes.object,
    onResultClick: PropTypes.func
};


export default SearchSheetResult;
