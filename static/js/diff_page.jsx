import "core-js/stable";
import "regenerator-runtime/runtime";
import $  from 'jquery';
import React  from 'react';
import ReactDOM  from 'react-dom';
import Sefaria  from './sefaria/sefaria';
import extend  from 'extend';
import PropTypes  from 'prop-types';
import DjangoCSRF  from './lib/django-csrf';
import DiffMatchPatch  from 'diff-match-patch';
    import Component from 'react-class';  //auto-bind this to all event-listeners. see https://www.npmjs.com/package/react-class
//TODO: fix the language selector to include any available language, not just English and Hebrew
function changePath(newPath) {
  const newUrl = window.location.origin + newPath;
  window.location.assign(newUrl);
}
DjangoCSRF.init();

class DiffStore {
  constructor (rawText) {
    this.rawText = rawText;
    this.FilterText();
    this.diffList = null;
  }

  FilterText () {
    var segList = this.rawText.split(/(<[^>]+>)/),
    mapping = [],
    filteredTextList = [],
    skipCount = 0;

    for (var [i, seg] of segList.entries()) {

      if (i%2 === 0) { // The odd elements are the text
        // The map contains the number of skipped characters for each character of the filtered text
        Array.prototype.push.apply(mapping, Array(seg.length).fill(skipCount));
        filteredTextList.push(seg);
      } else {
        if (seg.search(/^</) === -1 | seg.search(/>$/) === -1) {
          alert("Even item in filter not HTML");
          debugger;
        }
        skipCount += seg.length;
      }
    }
    this.filteredText = filteredTextList.join("");
    this.mapping = mapping;
  }

  ValidateDiff(proposedDiff) {
    /*
    * Compare each potential diff against mapping to ensure nothing was filtered
    * out. A diff is okay if the number of skipped characters in constant along the
    * length of the proposed change. This can be easily checked by asserting that
    * the value in the mapping that represents the first character position of the
    * change is identical to the value at the last position.
    * The special case of a "zero length diff" can be checked by validating that
    the mapping position before and after are identical.
    */
    var charCount = 0,
    validatedDiff = [];
    for (var element of proposedDiff) {
      if (element[1] === undefined) {debugger;}

      var length = element[1].length;
      if (element[0] === 0) {validatedDiff.push([0, element[1]]);}

      else if (element[1].length > 0) {

        if (this.mapping[charCount] === this.mapping[charCount+length-1]) {
          validatedDiff.push([1, element[1]]);
        } else {validatedDiff.push([2, element[1]]);}

      } else {

        if (this.mapping[charCount] === this.mapping[charCount+1]) {
          validatedDiff.push([1, element[1]]);
        } else {validatedDiff.push([2, element[1]])}
      }
        charCount += length;
      }
    return validatedDiff;
    }
}

class PageLoader extends Component {
  constructor(props) {
    super(props);
    this.state = {
      secRef: this.props.secRef,
      refArray: this.props.refArray ? this.props.refArray : null,
      v1: this.props.v1,
      v2: this.props.v2,
      lang: this.props.lang,
      nextChapter: null
    };
  //this.handlePublish = this.handlePublish.bind(this);
  }

  componentWillMount() {
    if (Sefaria.isRef(this.props.secRef)) {
      Sefaria.getRef(this.props.secRef).then(data=>{this.setState({nextChapter: data.next})});
    }
  }

  formSubmit(nextState) {
  this.setState(nextState);
  }

  loadNextChapter() {
    if (this.state.nextChapter){
      this.setState({secRef: this.state.nextChapter});
    }
  }

  componentDidUpdate() {
  if (this.props.secRef !== this.state.secRef ||
      this.props.lang !== this.state.lang ||
      this.props.v1 !== this.state.v1 ||
      this.props.v2 !== this.state.v2) {

    var newPathname =
    ['/compare', this.state.secRef, this.state.lang,
    this.state.v1, this.state.v2].join('/');
    newPathname = newPathname.split('//').join('/'); //In case some variable is None
    newPathname = newPathname.split(' ').join('_');
    //window.location.pathname = newPathname;
    changePath(newPathname);
  }
}

  render() {
    Sefaria.unpackDataFromProps(DJANGO_VARS.props);
    return (
      <div>
      <DataForm
      secRef={this.props.secRef ? this.props.secRef : ""}
      lang={this.props.lang ? this.props.lang : "he"}
      v1={this.props.v1 ? this.props.v1 : ""}
      v2={this.props.v2 ? this.props.v2 : ""}
      formSubmit={this.formSubmit}/>
      {(this.props.secRef != null & this.props.v1 != null & this.props.v2 != null && this.props.lang != null)
      ? (this.props.refArray)
          ?
            this.props.refArray.map(x =>
              <DiffTable
                key={x}
                secRef={x}
                v1={this.props.v1}
                v2={this.props.v2}
                lang={this.props.lang}
              />)
          :
          <DiffTable
          secRef={this.props.secRef}
          v1={this.props.v1}
          v2={this.props.v2}
          lang={this.props.lang}/>
          : null}
      {this.state.nextChapter
      ? <input type="button" value="Load Next Chapter" onClick={this.loadNextChapter} /> : null }
      </div>
    );
  }
}

class DataForm extends Component {
  constructor(props) {
    super(props);
    this.state = {
      secRef: this.props.secRef,
      lang: this.props.lang,
      v1: this.props.v1,
      v2: this.props.v2,
      possibleVersions: null
    };
  }

  handleInputChange(event) {
    const target = event.target;
    const value = target.value;
    const name = target.name;

    this.setState({
      [name]: value
    });
  }

  handleSubmit(event) {
    this.props.formSubmit({
      secRef: this.state.secRef,
      lang: this.state.lang,
      v1: this.state.v1,
      v2: this.state.v2
    })

    event.preventDefault();
    return (false);
  }

  loadPossibleVersions(versions) {
    let lang = this.state.lang;
    let possibleVersions = versions[lang].map(({ versionTitle }) => versionTitle);
    this.setState({possibleVersions: possibleVersions});
  }

  componentWillMount() {
    if (Sefaria.isRef(this.state.secRef)) {
      Sefaria.getVersions(this.state.secRef).then(this.loadPossibleVersions);
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    let versionChanged = function(nextVersions, prevVersions) {
      if ((nextVersions === null & prevVersions != null) ||
          (nextVersions != null & prevVersions === null)) {
        return true;
      } else if (nextVersions === null && prevVersions === null) {
        return false;
      } else if (nextVersions.length !== prevVersions.length) {
        return true;
      } else {
        for (let i=0; i<nextVersions.length; i++) {
          if (nextVersions[i] !== prevVersions[i]) {
            return true;
          }
        }
        return false;
      }
    }
    return(
      versionChanged(nextState.possibleVersions, this.state.possibleVersions) ||
      (this.state.secRef !== nextState.secRef) ||
      (this.state.lang !== nextState.lang) ||
      (this.state.v1 !== nextState.v1) ||
      (dthis.state.v2 !== nextState.v2)
    );
  }

  componentDidUpdate(prevProps, prevState) {
    if (Sefaria.isRef(this.state.secRef) && this.state.lang) {
      Sefaria.getVersions(this.state.secRef).then(this.loadPossibleVersions);
    } else {
      this.setState({possibleVersions: null});
    }
  }

  render() {
    let versionOptions =
    this.state.possibleVersions ? this.state.possibleVersions.map(function(ver) {
      return <option value={ver} key={ver}>{ver}</option>;
    }) : null;

    return (
      <form onSubmit={this.handleSubmit}>
        <label>
          Ref:
          <input
            name="secRef"
            type="text"
            value={this.state.secRef}
            onChange={this.handleInputChange}
            onPaste={this.handleInputChange}
            style={{width: "300px"}}
            autoComplete="off"/>
        </label>
        <label>
          Language:
          <select
            name="lang"
            value={this.state.lang}
            onChange={this.handleInputChange}>
            <option value="he">Hebrew</option>
            <option value="en">English</option>
          </select>
        </label>
        {versionOptions ?
        [<label key="version1">
          Version 1:
          <select
            name="v1"
            value={this.state.v1}
            onChange={this.handleInputChange}>
            <option value="">Select a Version</option>
            {versionOptions}
          </select>
        </label>,
        <label key="version2">
          Version 2:
          <select
            name="v2"
            value={this.state.v2}
            onChange={this.handleInputChange}>
            <option value="">Select a Version</option>
            {versionOptions}
          </select>
        </label>] : null}
        <br />
        <input type="submit" value="Load Diff" />
      </form>
    );

  }
}

class DiffTable extends Component {
  constructor(props) {
    super(props);
    this.state = {
      v1Length: null, v2Length: null
    };
  }

  LoadSection(props) {
    let enVersion = null, heVersion = null;
    if (props.lang === "en") { enVersion = props.v1; }
    else                     { heVersion = props.v1; }
    Sefaria.text(props.secRef,
      {enVersion, heVersion, wrapLinks: 0},
      data => this.setState({
        v1Length: props.lang === 'he' ? data['he'].length : data.text.length
      }));

    enVersion = null; heVersion = null;
    if (props.lang === "en") { enVersion = props.v2; }
    else                     { heVersion = props.v2; }
    Sefaria.text(props.secRef,
      {enVersion, heVersion, wrapLinks: 0},
      data => this.setState({
        v2Length: props.lang === 'he' ? data['he'].length : data.text.length
      }));
  }

  componentWillMount() {
    this.LoadSection(this.props);
  }

  componentWillReceiveProps(nextProps) {
    this.LoadSection(nextProps);
  }

  render () {
    if (this.state.v1Length === null || this.state.v2Length === null) {
      return (<div>Loading Text...</div>);
    } else {
      var numSegments = Math.max(this.state.v1Length, this.state.v2Length),
          rows = [];

      for (var i=1; i<=numSegments; i++) {
        rows.push(<DiffRow
          segRef={this.props.secRef + ":" + i.toString()}
          v1    ={this.props.v1}
          v2    ={this.props.v2}
          lang  ={this.props.lang}
          key   ={i.toString()}/>);
      }
    }

      return (
        <table>
          <thead>
            <tr>
              <td>{this.props.secRef}</td>
              <td>{this.props.v1}</td>
              <td>{this.props.v2}</td>
            </tr>
          </thead>
          <tbody>
            {rows}
          </tbody>
        </table>
      );
  }
}

class DiffRow extends Component {
  constructor(props) {
    super(props);
    this.state = {
      v1: null,
      v2: null,
      requiresUpdate: true,
      allowPost: true  // Is set to false when a change is being applied.
    }
  }

  generateDiff (seg1, seg2) {
    var diff1 = [],
        diff2 = [],
        Differ = new DiffMatchPatch(),
        offset = 0,
        mergeDiff = Differ.diff_main(seg1.filteredText, seg2.filteredText);
    for (var element of mergeDiff) {
      if (element[0] === -1) {
        diff1.push([1, element[1]]);
        offset -= 1;
      }
      else if (element[0] === 1) {
        diff2.push([1, element[1]]);
        offset += 1;
      }
      else if (element[0] === 0) {
        if (offset < 0) {
          diff2.push([1, '']);
          offset = 0;
        }
        else if (offset > 0) {
          diff1.push([1, '']);
          offset = 0;
        }
        diff1.push(element);
        diff2.push(element);
      }
    }
    if (offset < 0) {diff2.push([1, '']);}
    else if (offset > 0) {diff1.push([1, '']);}

    diff1 = seg1.ValidateDiff(diff1);
    diff2 = seg2.ValidateDiff(diff2);

    if (diff1.length !== diff2.length) {
      debugger;
      console.log('diffs do not match in length');
    }
    for (var i=0; i<diff1.length; i++) {
      if (diff1[i][0] === 0 & diff2[i][0] === 0) {continue}

      else if (diff1[i][0] === 1 & diff2[i][0] === 1) {
        // This is a legal change - add the proposed change to the diff piece
        diff1[i].push(diff2[i][1]);
        diff2[i].push(diff1[i][1]);
      }

      // This is a case where one is illegal and another is okay -> set both to be illegal
      else if (diff1[i][0] >= 1 & diff2[i][0] >= 1) {
        diff1[i][0] = 2;
        diff2[i][0] = 2;
      }
      else {alert("Bad match")}
    }
    seg1.diffList = diff1;
    seg2.diffList = diff2;
    this.setState({v1: seg1, v2: seg2, requiresUpdate: false, allowPost :true})
  }

  LoadText (text, version) {
    let myText = this.props.lang === 'he' ? text['he'] : text.text;
    if (version === 'v1') {
      this.setState({'v1': new DiffStore(myText)});
    } else {
      this.setState({'v2': new DiffStore(myText)});
    }
  }
  componentDidMount() {
    if (this.state.v1 != null & this.state.v2 != null) {
      this.generateDiff(this.state.v1, this.state.v2);
    }
  }

  componentDidUpdate() {
    let enVersion1 = null, heVersion1 = null, enVersion2 = null, heVersion2 = null;
    if (this.props.lang === "en")
      {enVersion1 = this.props.v1; enVersion2 = this.props.v2;}
    else
      {heVersion1 = this.props.v1; heVersion2 = this.props.v2;}

    if (this.state.v1 !== null && this.state.v2 !== null) {
      if (this.state.v1.diffList === null || this.state.v2.diffList === null) {
      this.generateDiff(this.state.v1, this.state.v2);
      }
    }
    else if (this.state.v1 === null) {
      Sefaria.text(this.props.segRef, {enVersion: enVersion1, heVersion: heVersion1, 'wrapLinks': 0}, this.LoadV1);
    }
    else if (this.state.v2 === null) {
      Sefaria.text(this.props.segRef, {enVersion: enVersion2, heVersion: heVersion2, 'wrapLinks': 0}, this.LoadV2);
    }
  }

  LoadV1 (text) {this.LoadText(text, 'v1');}
  LoadV2 (text) {this.LoadText(text, 'v2');}

  componentWillMount () {
    let enVersion1 = null, heVersion1 = null, enVersion2 = null, heVersion2 = null;
    if (this.props.lang === "en") { enVersion1 = this.props.v1; enVersion2 = this.props.v2; }
    else                          { heVersion1 = this.props.v1; heVersion2 = this.props.v2; }
    Sefaria.text(this.props.segRef, {enVersion: enVersion1, heVersion: heVersion1, 'wrapLinks': 0}, this.LoadV1);
    Sefaria.text(this.props.segRef, {enVersion: enVersion2, heVersion: heVersion2, 'wrapLinks': 0}, this.LoadV2);
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.segRef !== nextProps.segRef) {
      let enVersion1 = null, heVersion1 = null, enVersion2 = null, heVersion2 = null;
      if (this.props.lang === "en") { enVersion1 = this.props.v1; enVersion2 = this.props.v2; }
      else                          { heVersion1 = this.props.v1; heVersion2 = this.props.v2; }
      Sefaria.text(this.props.segRef, {enVersion: enVersion1, heVersion: heVersion1, 'wrapLinks': 0}, this.loadV1);
      Sefaria.text(this.props.segRef, {enVersion: enVersion2, heVersion: heVersion2, 'wrapLinks': 0}, this.loadV2);
    }
  }

  fullyLoaded() {
    if (this.state.v1 === null || this.state.v2 === null) {
      return false
    }
    else if (this.state.v1.diffList === null || this.state.v2.diffList === null) {
      return false
    }
    else {
      return true
    }
  }

  acceptChange(segRef, vtitle, lang, text) {
    if (!Sefaria._uid) {
      alert("Please sign in before making a change");
      return;
    }
    // block all posting untill this has successfully returned. Gets set back to `true` in `generateDiff`
    if (this.state.allowPost) {
      this.setState({allowPost: false});
      Sefaria.postSegment(segRef, vtitle, lang, text, this.onChangeMade, this.onChangeFailed);
    } else {
      alert("Another Change in Progress, Please Wait");
    }
  }

  onChangeMade(d) {
    // Check for "error" or "status":"ok"
    if (d.status === 'ok') {
      this.setState({requiresUpdate: true, v1: null, v2: null});
    } else if (d.error) {
      alert(d.error);
      this.onChangeFailed(d);
    } else {
      this.onChangeFailed(d);
    }
  }

  onChangeFailed(d) {
    // Choke
  }

  render() {
    if (!this.fullyLoaded()) {
      return <tr><td>{_("common.loading")}</td></tr>
    }
    var cells = ["v1","v2"].map(v => <DiffCell
      key={v}
      segRef={this.props.segRef}
      diff={this.state[v]}
      vtitle={this.props[v]}
      lang={this.props.lang}
      acceptChange={this.acceptChange}/>);

    return (
        <tr><td>{this.props.segRef}</td>{cells}</tr>
    );
  }
}

class DiffCell extends Component {

  acceptChange(diffIndex, replacement) {
  /*
  *  Accept a change and apply it to the rawText.
  *  diffIndex: An integer which indicates which element in the difflist to
  *  accept for the change.
  */
    console.log(this.props.diff.rawText);
    var diffList = this.props.diff.diffList; // Easier to access
    // begin by calculating the character position of the desired change in the filtered text
    var filteredPosition = 0;
    for (var i=0; i<diffIndex; i++) {
      filteredPosition += diffList[i][1].length;
    }
    // Our map tells you for each character in the filtered text how many characters
    // need to be added to get the equivalent position in the rawText. A legal
    // change demands no change of added characters along a single proposed diff.
    var rawPosition = filteredPosition + this.props.diff.mapping[filteredPosition],
        diffLength  = diffList[diffIndex][1].length;

    var fullNewText = this.props.diff.rawText.slice(0, rawPosition) +
        replacement +
        this.props.diff.rawText.slice(rawPosition + diffLength);

    // changeInProgress: true
    this.props.acceptChange(this.props.segRef, this.props.vtitle, this.props.lang, fullNewText);
    return fullNewText;
  }

  render() {
    if (this.props.diff.diffList === null) {
      return (<td>{"Loading..."}</td>);
    }
    var spans = [];
    var diffList = this.props.diff.diffList;

    for (var i = 0; i < diffList.length; i++) {
      // Equivalent string
      if (diffList[i][0] === 0) {
        spans.push(<span key={i.toString()}>{diffList[i][1]}</span>);
      }

      // Diff that can be applied automatically
      else if (diffList[i][0] === 1) {
        spans.push(<DiffElement
          text       = {diffList[i][1]}
          toText     = {diffList[i][2]}
          key        = {i.toString()}
          acceptChange = {this.acceptChange.bind(this, i)}
          />);
        }

      // Diff that can not be applied automatically
      else {
        spans.push(<span className="del" key={i.toString()}>{diffList[i][1]}</span>);
      }

    }
    return (
          <td className={this.props.lang}>{spans}</td>
      );
    }
}

class DiffElement extends Component {
  constructor(props) {
    super(props);
    this.state = {
      mouseover: false,
      replacementText: this.props.toText,
      confirmOpen: false
    };
  }
  onMouseOver() {
    if(!this.state.confirmOpen) {
      this.setState({mouseover: true});
    }
  }
  onMouseOut() {
    this.setState({mouseover: false});
  }
  openConfirm() {
    if (Sefaria._uid && (Sefaria.is_moderator || Sefaria.is_editor)) {
      this.setState({confirmOpen: true, mouseover: false});
    } else if (Sefaria._uid) {
      alert("Only Sefaria Moderators Can Edit Texts");
    } else {
      alert("Not signed in. You must be signed in as a Sefaria Moderator to use this feature.");
    }
  }
  closeConfirm(event) {
    event.stopPropagation();
    this.setState({confirmOpen: false, mouseover: false});
  }
  acceptChange(event) {
    event.preventDefault();
    event.stopPropagation();
    console.log(this.props.acceptChange(this.state.replacementText));
    return false;
  }
  resetReplacementText(event) {
    event.stopPropagation();
    this.setState({ replacementText: this.props.toText});
  }
  handleReplacementTextChange(event) {
    this.setState({ replacementText: event.target.value });
  }
  render() {
    var confirmForm = (
        <div className="changeDialog">
          Changing {this.props.text} to {this.state.replacementText}<br/>
          <form onSubmit={this.acceptChange}>
            <label>
              Replacement Text:
              <input
                type="text"
                value={this.state.replacementText}
                onChange={this.handleReplacementTextChange}
                onPaste={this.handleReplacementTextChange}
                autoComplete="off"/>
            </label>
            <br />
            <input type="submit" value="Apply Change" />
            <input type="reset" value="Reset" onClick={this.resetReplacementText} />
            <input type="button" value="Cancel" onClick={this.closeConfirm} />
          </form>
        </div>);

      var replaceMessage;
      if (!this.props.text) {
        replaceMessage = "Click to add `" + this.props.toText + "`";
      } else if (!this.props.toText) {
        replaceMessage = "Click to remove `" + this.props.text + "`";
      } else {
        replaceMessage = "Click to change `" + this.props.text + "` to `" + this.props.toText + "`";
      }
    return (
      <span onMouseOver={this.onMouseOver}
        onMouseOut={this.onMouseOut}
        onClick={this.openConfirm}
        className="ins">
          {this.props.text ? this.props.text : '\u00A0'}
          {this.state.mouseover ?
              <span className="change">{replaceMessage}</span> :
              null
          }
        {this.state.confirmOpen ? confirmForm : null}
      </span>
    );
  }
}
ReactDOM.render(<PageLoader secRef={JSON_PROPS.secRef}
                v1={JSON_PROPS.v1}
                v2={JSON_PROPS.v2}
                lang={JSON_PROPS.lang}
                refArray={JSON_PROPS.refArray}
                  />,
                  document.getElementById('DiffTable'));
