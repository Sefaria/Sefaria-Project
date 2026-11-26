import Component from 'react-class';
import classNames from 'classnames';
import Sefaria from '../sefaria/sefaria';
import React from 'react';
import sheetsSanitize from '../sheetsSanitize';

class SheetSource extends Component {
  render() {
    const sectionClasses = classNames(
      'SheetSource',
      this.props.source.options ? this.props.source.options.indented : null,
      this.props.highlighted && 'highlight'
    );
    const containerClasses = classNames(
      'sheetItem',
      'segment',
      (this.props.source.text && this.props.source.text.en && this.props.source.text.en.stripHtml() === '...') ||
        (this.props.source.text && (!this.props.source.text.en || !this.props.source.text.en.stripHtml()))
        ? 'heOnly'
        : null,
      (this.props.source.text && this.props.source.text.he && this.props.source.text.he.stripHtml() === '...') ||
        (this.props.source.text && (!this.props.source.text.he || !this.props.source.text.he.stripHtml()))
        ? 'enOnly'
        : null,
      this.props.source.options && this.props.source.options.refDisplayPosition
        ? 'ref-display-' + this.props.source.options.refDisplayPosition
        : null
    );
    return (
      <section
        className={sectionClasses}
        style={{ borderInlineStart: `4px solid ${Sefaria.palette.refColor(this.props.source.ref)}` }}
      >
        <div
          className={containerClasses}
          onClick={this.props.sheetSourceClick}
          data-node={this.props.source.node}
          aria-label={'Click to see connections to this source'}
          tabIndex="0"
          onKeyDown={this.props.handleKeyDown}
        >
          {this.props.source.title ? (
            <div className="customSourceTitle" role="heading" aria-level="3">
              <div className="titleBox">{this.props.source.title.stripHtml()}</div>
            </div>
          ) : null}
          {this.props.source.text && this.props.source.text.he && this.props.source.text.he !== '' ? (
            <div className="he">
              {this.props.source.options &&
              this.props.source.options.sourcePrefix &&
              this.props.source.options.sourcePrefix != '' ? (
                <sup className="sourcePrefix">{this.props.source.options.sourcePrefix}</sup>
              ) : null}
              <div className="ref">
                {this.props.source.options && this.props.source.options.PrependRefWithHe
                  ? this.props.source.options.PrependRefWithHe
                  : null}
                <a
                  href={Sefaria.util.fullURL('/' + Sefaria.normRef(this.props.source.ref), Sefaria.LIBRARY_MODULE)}
                  data-target-module={Sefaria.LIBRARY_MODULE}
                >
                  {this.props.source.heRef}
                </a>
              </div>
              <div
                className="sourceContentText"
                dangerouslySetInnerHTML={{ __html: Sefaria.util.cleanHTML(this.props.source.text.he) }}
              ></div>
            </div>
          ) : null}
          {this.props.source.text && this.props.source.text.en && this.props.source.text.en !== '' ? (
            <div className="en">
              {this.props.source.options &&
              this.props.source.options.sourcePrefix &&
              this.props.source.options.sourcePrefix != '' ? (
                <sup className="sourcePrefix">{this.props.source.options.sourcePrefix}</sup>
              ) : null}
              <div className="ref">
                {this.props.source.options && this.props.source.options.PrependRefWithEn
                  ? this.props.source.options.PrependRefWithEn
                  : null}
                <a
                  href={Sefaria.util.fullURL('/' + Sefaria.normRef(this.props.source.ref), Sefaria.LIBRARY_MODULE)}
                  data-target-module={Sefaria.LIBRARY_MODULE}
                >
                  {this.props.source.ref}
                </a>
              </div>
              <div
                className="sourceContentText"
                dangerouslySetInnerHTML={{ __html: Sefaria.util.cleanHTML(this.props.source.text.en) }}
              ></div>
            </div>
          ) : null}
          <div className="clearFix"></div>
          {this.props.source.addedBy ? (
            <div className="addedBy">
              <small>
                <em>
                  {Sefaria._('sheet_content_segments.added_by')}:{' '}
                  <span dangerouslySetInnerHTML={{ __html: Sefaria.util.cleanHTML(this.props.source.userLink) }}></span>
                </em>
              </small>
            </div>
          ) : null}
        </div>
        {this.props.addToSheetButton}
      </section>
    );
  }
}
class SheetComment extends Component {
  render() {
    const lang = Sefaria.hebrew.isHebrew(this.props.source.comment.stripHtml().replace(/\s+/g, ' ')) ? 'he' : 'en';
    const sectionClasses = classNames('SheetComment', this.props.highlighted && 'highlight');
    const containerClasses = classNames(
      'sheetItem',
      'segment',
      lang === 'he' ? 'heOnly' : 'enOnly',
      this.props.source.options ? this.props.source.options.indented : null
    );
    return (
      <section className={sectionClasses}>
        <div
          className={containerClasses}
          data-node={this.props.source.node}
          onClick={this.props.sheetSourceClick}
          aria-label={'Click to see ' + this.props.linkCount + ' connections to this source'}
          tabIndex="0"
          onKeyPress={this.props.handleKeyPress}
        >
          <div className={lang}>
            <div
              className="sourceContentText"
              dangerouslySetInnerHTML={{ __html: Sefaria.util.cleanHTML(this.props.source.comment) }}
            ></div>
          </div>
          <div className="clearFix"></div>
          {this.props.source.addedBy ? (
            <div className="addedBy">
              <small>
                <em>
                  {Sefaria._('sheet_content_segments.added_by')}:{' '}
                  <span dangerouslySetInnerHTML={{ __html: Sefaria.util.cleanHTML(this.props.source.userLink) }}></span>
                </em>
              </small>
            </div>
          ) : null}
        </div>
        {this.props.addToSheetButton}
      </section>
    );
  }
}
class SheetHeader extends Component {
  render() {
    const lang = Sefaria.hebrew.isHebrew(this.props.source.outsideText.stripHtml().replace(/\s+/g, ' ')) ? 'he' : 'en';
    const containerClasses = classNames(
      'sheetItem',
      'segment',
      lang == 'he' ? 'heOnly' : 'enOnly',
      this.props.highlighted && 'highlight',
      this.props.source.options ? this.props.source.options.indented : null
    );
    return (
      <div
        className={containerClasses}
        data-node={this.props.source.node}
        onClick={this.props.sheetSourceClick}
        aria-label={'Click to see ' + this.props.linkCount + ' connections to this source'}
        tabIndex="0"
        onKeyPress={this.props.handleKeyPress}
      >
        <div className={lang}>
          <div className="sourceContentText">
            <h1>
              <span>{this.props.source.outsideText.stripHtml()}</span>
            </h1>
          </div>
        </div>
        {this.props.addToSheetButton}
      </div>
    );
  }
}
class SheetOutsideText extends Component {
  shouldPassClick(e) {
    const target = e.target.closest('a');
    if (target) {
      return;
    } else {
      this.props.sheetSourceClick(this.props.source);
    }
  }
  render() {
    const lang = Sefaria.hebrew.isHebrew(this.props.source.outsideText.stripHtml().replace(/\s+/g, ' ')) ? 'he' : 'en';
    const sectionClasses = classNames('SheetOutsideText', this.props.highlighted && 'highlight');
    const containerClasses = classNames(
      'sheetItem',
      'segment',
      lang == 'he' ? 'heOnly' : 'enOnly',
      this.props.source.options ? this.props.source.options.indented : null
    );
    const paragraphsToBreaks = (html) => {
      return html
        .replace(/<\/p>\s*<p>/g, '<br/>')
        .replace(/<p( [^>]*)?>/g, '')
        .replace(/<\/p>/g, '<br/>');
    };

    const outsideHTML = paragraphsToBreaks(Sefaria.util.cleanHTML(this.props.source.outsideText));
    return (
      <section className={sectionClasses}>
        <div
          className={containerClasses}
          data-node={this.props.source.node}
          onClick={(e) => this.shouldPassClick(e)}
          aria-label={'Click to see ' + this.props.linkCount + ' connections to this source'}
          tabIndex="0"
          onKeyPress={this.props.handleKeyPress}
        >
          <div className={lang}>
            {this.props.source.options &&
            this.props.source.options.sourcePrefix &&
            this.props.source.options.sourcePrefix != '' ? (
              <sup className="sourcePrefix">{this.props.source.options.sourcePrefix}</sup>
            ) : null}
            <div className="sourceContentText" dangerouslySetInnerHTML={{ __html: outsideHTML }}></div>
          </div>
          <div className="clearFix"></div>
          {this.props.source.addedBy ? (
            <div className="addedBy">
              <small>
                <em>
                  {Sefaria._('sheet_content_segments.added_by')}:{' '}
                  <span dangerouslySetInnerHTML={{ __html: Sefaria.util.cleanHTML(this.props.source.userLink) }}></span>
                </em>
              </small>
            </div>
          ) : null}
        </div>
        {this.props.addToSheetButton}
      </section>
    );
  }
}
class SheetOutsideBiText extends Component {
  render() {
    const sectionClasses = classNames(
      'SheetOutsideBiText',
      this.props.highlighted && 'highlight',
      this.props.source.options ? this.props.source.options.indented : null
    );
    const containerClasses = classNames(
      'sheetItem',
      'segment',
      (this.props.source.outsideBiText.en && this.props.source.outsideBiText.en.stripHtml() === '...') ||
        !this.props.source.outsideBiText.en.stripHtml()
        ? 'heOnly'
        : null,
      (this.props.source.outsideBiText.he && this.props.source.outsideBiText.he.stripHtml() === '...') ||
        !this.props.source.outsideBiText.he.stripHtml()
        ? 'enOnly'
        : null
    );
    return (
      <section className={sectionClasses}>
        <div
          className={containerClasses}
          data-node={this.props.source.node}
          onClick={this.props.sheetSourceClick}
          aria-label={'Click to see ' + this.props.linkCount + ' connections to this source'}
          tabIndex="0"
          onKeyPress={this.props.handleKeyPress}
        >
          <div className="he">
            {this.props.source.options &&
            this.props.source.options.sourcePrefix &&
            this.props.source.options.sourcePrefix !== '' ? (
              <sup className="sourcePrefix">{this.props.source.options.sourcePrefix}</sup>
            ) : null}
            <div
              className="sourceContentText outsideBiText"
              dangerouslySetInnerHTML={{ __html: Sefaria.util.cleanHTML(this.props.source.outsideBiText.he) }}
            ></div>
          </div>
          <div className="en">
            {this.props.source.options &&
            this.props.source.options.sourcePrefix &&
            this.props.source.options.sourcePrefix !== '' ? (
              <sup className="sourcePrefix">{this.props.source.options.sourcePrefix}</sup>
            ) : null}
            <div
              className="sourceContentText outsideBiText"
              dangerouslySetInnerHTML={{ __html: Sefaria.util.cleanHTML(this.props.source.outsideBiText.en) }}
            ></div>
          </div>
          <div className="clearFix"></div>
          {this.props.source.addedBy ? (
            <div className="addedBy">
              <small>
                <em>
                  {Sefaria._('sheet_content_segments.added_by')}:{' '}
                  <span dangerouslySetInnerHTML={{ __html: Sefaria.util.cleanHTML(this.props.source.userLink) }}></span>
                </em>
              </small>
            </div>
          ) : null}
        </div>
        {this.props.addToSheetButton}
      </section>
    );
  }
}
class SheetMedia extends Component {
  makeMediaEmbedContent() {
    var mediaLink;
    var mediaCaption = '';
    var mediaClass = 'media fullWidth';
    var caption = this.props.source.caption;
    // Only allowlisted https media is turned into markup; the URL is attribute-escaped and every src is quoted.
    const parsedMedia = sheetsSanitize.parseMediaUrl(this.props.source.media);
    const mediaURL = parsedMedia ? sheetsSanitize.escapeHtml(parsedMedia.url) : '';
    const mediaKind = parsedMedia ? parsedMedia.kind : null;

    if (mediaKind === 'image') {
      mediaLink =
        '<img class="addedMedia" src="' +
        mediaURL +
        '" alt="' +
        sheetsSanitize.escapeHtml(Sefaria._('sheet_content_segments.user_uploaded_image')) +
        '" />';
    } else if (mediaKind === 'youtube') {
      mediaLink =
        '<div class="youTubeContainer"><iframe width="100%" height="100%" src="' +
        mediaURL +
        '" frameborder="0" allowfullscreen></iframe></div>';
    } else if (mediaKind === 'vimeo') {
      mediaLink =
        '<div class="youTubeContainer"><iframe width="100%" height="100%" src="' +
        mediaURL +
        '" frameborder="0"  allow="autoplay; fullscreen" allowfullscreen></iframe></div>';
    } else if (mediaKind === 'soundcloud') {
      mediaLink = '<iframe width="100%" height="166" scrolling="no" frameborder="no" src="' + mediaURL + '"></iframe>';
    } else if (mediaKind === 'spotify') {
      const [, , type] = new URL(parsedMedia.url).pathname.split('/');

      // Spotify embed heights are fixed by Spotify's player design.
      // DO NOT change these values — reducing them will cut off content.
      const SPOTIFY_IFRAME_HEIGHT_WITH_METADATA = 152; // episode
      const SPOTIFY_IFRAME_HEIGHT_COMPACT = 80; // music tracks
      const height = type === 'episode' ? SPOTIFY_IFRAME_HEIGHT_WITH_METADATA : SPOTIFY_IFRAME_HEIGHT_COMPACT;
      return `<iframe 
        src="${mediaURL}"
        width="100%"
        height="${height}"
        frameborder="0"
        allow="autoplay; encrypted-media" 
        loading="lazy">
      </iframe>`;
    } else if (mediaKind === 'audio') {
      mediaLink =
        '<audio src="' +
        mediaURL +
        '" type="audio/mpeg" controls>Your browser does not support the audio element.</audio>';
    } else {
      mediaLink = 'Error loading media...';
    }

    if (caption && (caption.en || caption.he)) {
      var cls = caption.en && caption.he ? '' : caption.en ? 'enOnly' : 'heOnly';
      mediaCaption =
        "<div class='mediaCaption " +
        cls +
        "'><div class='mediaCaptionInner'>" +
        "<div class='en'>" +
        Sefaria.util.cleanHTML(caption.en || '') +
        '</div>' +
        "<div class='he'>" +
        Sefaria.util.cleanHTML(caption.he || '') +
        '</div>' +
        '</div></div>';
    }
    return "<div class='" + mediaClass + "'>" + mediaLink + mediaCaption + '</div>';
  }
  isImage() {
    const parsedMedia = sheetsSanitize.parseMediaUrl(this.props.source.media);
    return parsedMedia !== null && parsedMedia.kind === 'image';
  }
  render() {
    const sectionClasses = classNames('SheetMedia', this.props.highlighted && 'highlight');
    const containerClasses = classNames(
      'sheetItem',
      'segment',
      this.props.source.options ? this.props.source.options.indented : null
    );
    return (
      <section className={sectionClasses}>
        <div
          className={containerClasses}
          data-node={this.props.source.node}
          onClick={this.props.sheetSourceClick}
          aria-label={'Click to  ' + this.props.linkCount + ' connections to this source'}
          tabIndex="0"
          onKeyPress={this.props.handleKeyPress}
        >
          <div
            className="sourceContentText centeredSheetContent"
            dangerouslySetInnerHTML={{ __html: this.makeMediaEmbedContent() }}
          ></div>
          <div className="clearFix"></div>
          {this.props.source.addedBy ? (
            <div className="addedBy">
              <small>
                <em>
                  {Sefaria._('sheet_content_segments.added_by')}:{' '}
                  <span dangerouslySetInnerHTML={{ __html: Sefaria.util.cleanHTML(this.props.source.userLink) }}></span>
                </em>
              </small>
            </div>
          ) : null}
        </div>
        {this.isImage() && this.props.addToSheetButton}
      </section>
    );
  }
}
export { SheetMedia, SheetSource, SheetComment, SheetOutsideText, SheetHeader, SheetOutsideBiText };
