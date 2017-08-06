var $              = require('jquery'),
    React          = require('react'),
    ReactDOM       = require('react-dom'),
    Sefaria        = require('./sefaria'),
    extend         = require('extend'),
    PropTypes      = require('prop-types'),
    DiffMatchPatch = require('diff-match-patch');
    import Component from 'react-class';  //auto-bind this to all event-listeners. see https://www.npmjs.com/package/react-class

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
        // The map contains the number of skipped characters for each character of  the filtered text
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

class DiffTable extends Component {
  render () {
      return (
        <table>
          <tbody>
            <DiffRow  segRef={this.props.segRef}
                      v1   ={this.props.v1}
                      v2   ={this.props.v2}
                      lang ={this.props.lang}/>
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
      v2: null
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
    diff1 = seg1.ValidateDiff(diff1);
    diff2 = seg2.ValidateDiff(diff2);

    if (diff1.length != diff2.length) {
      alert('diffs do not match in length');
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
    this.setState({v1: seg1, v2: seg2})
  }

  LoadText (text, version) {
    if (version === 'v1') {
      this.setState({'v1': new DiffStore(text['he'])});
    } else {
      this.setState({'v2': new DiffStore(text['he'])});
    }

    if (this.state.v1 != null & this.state.v2 != null) {
      this.generateDiff(this.state.v1, this.state.v2);
    }
  }

  LoadV1 (text) {this.LoadText(text, 'v1');}
  LoadV2 (text) {this.LoadText(text, 'v2');}

  componentWillMount () {
    var settings = {'version': this.props.v1, 'language': this.props.lang};
    Sefaria.text(this.props.segRef, settings, this.LoadV1);
    settings.version = this.props.v2;
    Sefaria.text(this.props.segRef, settings, this.LoadV2);
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.segRef != nextProps.segRef) {
      var settings = {'version': this.props.v1, 'language': this.props.lang};
      Sefaria.text(this.props.segRef, settings, this.loadV1);
      settings.version = this.props.v2;
      Sefaria.text(this.props.segRef, settings, this.loadV2);
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

  render () {
    if (!this.fullyLoaded()) {
      return <tr><td>{"Loading..."}</td></tr>
    }
    var cell1 = <DiffCell diff={this.state.v1} vtitle={this.props.v1}/>,
        cell2 = <DiffCell diff={this.state.v2} vtitle={this.props.v2}/>;

    return (
        <tr>{cell1}{cell2}</tr>
    );
  }
}

class DiffCell extends Component {
  render () {
    debugger;
    if (this.props.diff.diffList === null) {
      return (<td>{"Loading..."}</td>);
    }
    var spans = [];
    var diffList = this.props.diff.diffList;
    for (var i = 0; i < diffList.length; i++) {
      if (diffList[i][0] === 0) {
        spans.push(<span key={i.toString()}>{diffList[i][1]}</span>);
      }

      else if (diffList[i][0] === 1) {
      spans.push(<span className="ins" key={i.toString()}>{diffList[i][1]}</span>);
      }

      else {spans.push(<span className="del" key={i.toString()}>{diffList[i][1]}</span>);}

    }
    return (
          <td className="he">{spans}</td>
      );
}
}
ReactDOM.render(<DiffTable segRef={"Shulchan Arukh, Choshen Mishpat 1:1"}
                v1={"Shulhan Arukh, Hoshen ha-Mishpat; Lemberg, 1898"}
                v2={"Torat Emet Freeware Shulchan Aruch"}
                lang={"he"}/>,
                  document.getElementById('DiffTable'));
