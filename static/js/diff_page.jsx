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
              <DiffRow textList={this.props.row} />
            </tbody>
          </table>
        );
    }
}

class DiffRow extends Component {
    render () {
        var cells = this.props.textList.map(t => <DiffCell diffText={t}/>);
        return (
            <tr>{cells}</tr>
        );
    }
}

class DiffCell extends Component {
    render () {
        return (
            <td>{this.props.diffText}</td>
        );
    }
}

ReactDOM.render(<DiffTable row={['Some text', 'some more text']}/>, document.getElementById('DiffTable'));
