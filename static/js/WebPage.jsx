import PropTypes from 'prop-types';
import {InterfaceText} from "./Misc";
import Sefaria from "./sefaria/sefaria";
import React from "react";

const WebPage = ({authors, isHebrew, favicon, url, domain, title, description, articleSource, anchorRef}) => {
  const authorsNum = authors?.length;
  const author = authorsNum > 1 ? 'Authors' : 'Author';
  function getAuthorsString(lang, authors) {
    const finalJoiner = (lang === 'he') ? ' ו' : ' and ';
    function arrangeAuthorName(authorName) {
      return authorName.split(', ').reverse().join(' ');
    }
    function addAuthorToString(accumulator, author, i) {
      let joiner = i === 0 ? '' : i === authorsNum - 1 ? finalJoiner : ', ';
      return `${accumulator}${joiner}${arrangeAuthorName(author)}`;
    }
    return authors?.reduce((accumulator, author, i) => addAuthorToString(accumulator, author, i), '');
  }
  const authorsNames = getAuthorsString(isHebrew ? 'he' : 'en', authors);
  return (<div className={"webpage" + (isHebrew ? " hebrew" : "")} key={url}>
    <img className="icon" src={favicon} />
    <a className="title" href={url} target="_blank">{title}</a>
    <div className="domain">{domain}</div>
    {description ? <div className="description">{description}</div> : null}
    <div className="webpageMetadata">
      {authorsNames ? <div className="authors">
        <InterfaceText>{author}</InterfaceText>: {authorsNames}
      </div> : null}
      {articleSource ? <div className="articleSource">
        <InterfaceText>Source</InterfaceText>: {articleSource.title}{articleSource.related_parts ? ` ${articleSource.related_parts}`: ''}
      </div> : null}
      <div className="citing">
        <InterfaceText>Citing</InterfaceText>: {Sefaria._r(anchorRef)}
      </div>
    </div>
  </div>);
}
WebPage.propTypes = {
  authors: PropTypes.array, //array of strings
  isHebrew: PropTypes.bool,
  favicon: PropTypes.string,
  url: PropTypes.string,
  domain: PropTypes.string,
  title: PropTypes.string,
  articleSource: PropTypes.object,
  anchorRef: PropTypes.string,
};

export default WebPage;
