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
            <DiffRow segRef={this.props.segRef} />
          </tbody>
        </table>
      );
  }
}

class DiffRow extends Component {
  loadText (text) {
    this.setState({textList: [FilterText(text['he'])['filteredText'], text['he']]});
  }

  componentWillMount () {
    Sefaria.text(this.props.segRef, 'he', this.loadText);
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.segRef != nextProps.segRef) {
      Sefaria.text(nextProps.segRef, 'he', this.loadText);
    }
  }
  render () {
    if (this.state === null) {
      return <tr><DiffCell diffText={"Loading..."}/></tr>
    }
    var cells = this.state.textList.map(t => <DiffCell diffText={t}/>);
    return (
        <tr>{cells}</tr>
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

ReactDOM.render(<DiffTable segRef={"Shulchan Arukh, Choshen Mishpat 1:1"}/>, document.getElementById('DiffTable'));

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
