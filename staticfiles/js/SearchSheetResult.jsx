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
      // var s = this.props.data._source;
      var s = this.props.data;
      if (this.props.onResultClick) {
        e.preventDefault()
        this.props.onResultClick("Sheet " + s.sheetId);
      }
      Sefaria.track.event("Search", "Search Result Sheet Click", `${this.props.query} - ${s.sheetId}`);
    }
    handleProfileClick(e) {
      const s = this.props.data._source;
      Sefaria.track.event("Search", "Search Result Sheet Owner Click", `${this.props.query} - ${s.sheetId} - ${s.ownerId}`);
    }
    get_snippet_markup(data) {
      let snippet = data.highlight.content.join("..."); // data.highlight ? data.highlight.content.join("...") : s.content;
      snippet = snippet.replace(/^[ .,;:!-)\]]+/, "");
      const lang = Sefaria.hebrew.isHebrew(snippet) ? "he" : "en";
      return { markup: {__html: snippet}, lang };
    }
    highight(data, query) {

      let lang = Object.keys(data)[0] // he or en
      
      return { markup: {__html: data[lang].split(query).join(` <b>${query}</b> `)}, lang: lang };
    }
    render() {
        const data = this.props.data;
        const s = data;
        var clean_title = $("<span>" + s.title + "</span>").text();
        var href = "/sheets/" + s.sheetId;
        const snippetMarkup = this.highight(s.sources, this.props.query);
        const snippetClasses = classNames({snippet: 1, en: snippetMarkup.lang === "en", he: snippetMarkup.lang === "he"});
        // const ownerIsHe = Sefaria.hebrew.isHebrew(s.owner_name);
        const titleIsHe = Sefaria.hebrew.isHebrew(clean_title);
        const tags = s.tags && s.tags.length ? Sefaria.util.zip(s.tags, s.topic_slugs, s.topics_he) : [];
        return (
            <div className='result sheetResult'>
                <a href={href} onClick={this.handleSheetClick}>
                    <div className={classNames({'result-title': 1, 'in-en': !titleIsHe, 'in-he': titleIsHe})}>
                        <span dir={titleIsHe ? "ltr" : "ltr"}>{clean_title}</span>
                    </div>
                    <ColorBarBox tref={"Sheet 1"}>
                      <div className={snippetClasses}>
                          <span dir={snippetMarkup.lang === 'he' ? "ltr" : "ltr"} dangerouslySetInnerHTML={snippetMarkup.markup} ></span>
                      </div>
                    </ColorBarBox>
                </a>
                <div className="sheetData sans-serif">
                    {/* <a className="ownerData sans-serif" href={s.profile_url} onClick={this.handleProfileClick}> */}
                    <a className="ownerData sans-serif" onClick={this.handleProfileClick}>
                        {/* <ProfilePic
                            url={s.owner_image}
                            name={s.owner_name}
                            len={30}
                        /> */}
                        {/* <span className={classNames({'ownerName': 1, 'in-en': !ownerIsHe, 'in-he': ownerIsHe})}>{s.owner_name}</span> */}
                    </a>
                    <span className='tagsViews'>
                    {tags.map((topic, i) => {
                        return (
                          <a href={`/topics/${topic[1]}`} target="_blank" key={`link${topic[1]}${i}`}>
                              <InterfaceText text={{en: topic[0], he: topic[2]}} />
                          </a>
                        );
                      })}
                    </span>
                </div>
            </div>
        );
    }
}
SearchSheetResult.propTypes = {
  query: PropTypes.string,
  data: PropTypes.object,
  onResultClick: PropTypes.func
};


export default SearchSheetResult;
