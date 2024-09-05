import PropTypes from 'prop-types';
import {InterfaceText} from "./Misc";
import Sefaria from "./sefaria/sefaria";
import React from "react";


function arrangeAuthorName(authorName) {
  return authorName.split(', ').reverse().join(' ');
}

function addAuthorToString(finalJoiner, accumulator, author, i, authors) {
  const authorsNum = authors?.length;
  let joiner = i === 0 ? '' : i === authorsNum - 1 ? finalJoiner : ', ';
  return `${accumulator}${joiner}${arrangeAuthorName(author)}`;
}

function getAuthorsAsString(isHebrew, authors) {
  const finalJoiner = isHebrew ? ' ו' : ' and ';
  return authors?.reduce((...reduceArgs) => addAuthorToString(finalJoiner, ...reduceArgs), '');
}

const AuthorString = ({authors, isHebrew}) => {
  const authorsNum = authors?.length;
  const author = authorsNum > 1 ? 'Authors' : 'Author';
  const authorsNames = getAuthorsAsString(isHebrew, authors);
  return (
     authorsNames ? <div className="authors">
             <InterfaceText>{author}</InterfaceText>: {authorsNames}
         </div> : null
  );
}
AuthorString.propTypes = {
  authors: PropTypes.array, //array of strings
  isHebrew: PropTypes.bool,
};

const WebPage = ({authors, isHebrew, favicon, url, domain, title, description, articleSource, anchorRef}) => {
  return (<div className={"webpage" + (isHebrew ? " hebrew" : "")} key={url}>
    <img className="icon" src={favicon} />
    <a className="title" href={url} target="_blank">{title}</a>
    <div className="domain">{domain}</div>
    {description ? <div className="description">{description}</div> : null}
    <div className="webpageMetadata">
      <AuthorString authors={authors} isHebrew={isHebrew} />
      {articleSource ? <div className="articleSource">
        <InterfaceText>text.versions.source</InterfaceText>: {articleSource.title}{articleSource.related_parts ? ` ${articleSource.related_parts}`: ''}
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
