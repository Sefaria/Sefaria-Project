var $             = require('jquery'),
    React         = require('react'),
    ReactDOM      = require('react-dom'),
    Sefaria       = require('./sefaria'),
    extend        = require('extend'),
    PropTypes     = require('prop-types');
    import Component from 'react-class';  //auto-bind this to all event-listeners. see https://www.npmjs.com/package/react-class

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
      v1: {filteredText: "Loading...", mapping: []},
      v2: {filteredText: "Loading...", mapping: []}
    }
  }

  componentWillMount () {
    var settings = {'version': this.props.v1, 'language': this.props.lang};
    Sefaria.text(this.props.segRef, settings, (text) =>this.setState({v1: FilterText(text['he'])}));
    settings.version = this.props.v2;
    Sefaria.text(this.props.segRef, settings, (text) =>this.setState({v2: FilterText(text['he'])}));
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.segRef != nextProps.segRef) {
      var settings = {'version': this.props.v1, 'language': this.props.lang};
      Sefaria.text(this.props.segRef, settings, this.loadText1);
      settings.version = this.props.v2;
      Sefaria.text(this.props.segRef, settings, this.loadText2);
    }
  }
  render () {
    var cell1 = <DiffCell diffText={this.state.v1['filteredText']}/>,
        cell2 = <DiffCell diffText={this.state.v2['filteredText']}/>;

    return (
        <tr>{cell1}{cell2}</tr>
    );
  }
}

class DiffCell extends Component {
  render () {
      return (
          <td dangerouslySetInnerHTML={ {__html: this.props.diffText} }></td>
      );
  }
}

ReactDOM.render(<DiffTable segRef={"Shulchan Arukh, Choshen Mishpat 1:1"}
                v1={"Shulhan Arukh, Hoshen ha-Mishpat; Lemberg, 1898"}
                v2={"Torat Emet Freeware Shulchan Aruch"}
                lang={"he"}/>,
                  document.getElementById('DiffTable'));

function FilterText (verse) {
  var segList = verse.split(/(<[^>]+>)/),
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
  return {'filteredText': filteredTextList.join(""), 'mapping': mapping}
}
