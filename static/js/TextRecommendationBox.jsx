const {
  LoadingMessage,
}               = require('./Misc');
const React      = require('react');
const PropTypes = require('prop-types');
const classNames = require('classnames');
const Sefaria   = require('./sefaria/sefaria');
const TextRange  = require('./TextRange');
import Component from 'react-class';


class TextRecommendationBox extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true,
      recommendations: [],
    };
  }
  componentDidMount() {
    this._isMounted = true;
    this.load(this.props);
  }
  componentWillReceiveProps(nextProps) {
    if (!this.props.srefs.compare(nextProps.srefs)) {
      this.setState({ loading: true}, () => {
        this.load(nextProps);
      })
    }
  }
  componentWillUnmount() {
    this._isMounted = false;
  }
  async load({ srefs }) {
    const recommendations = await Sefaria.recommendations(srefs);
    if (this._isMounted) {
      this.setState({ recommendations, loading: false });
    }
  }
  renderItem(rec) {
    return (
      <div className="textListTextRangeBox" key={rec.ref}>
        <TextRange
          panelPosition={this.props.panelPosition}
          sref={rec.ref}
          hideTitle={false}
          numberLabel={0}
          basetext={false}
          onRangeClick={this.props.onRangeClick}
          onCitationClick={this.props.onCitationClick}
        />
      </div>
    );
  }
  render() {
    const hasRecs = this.state.recommendations.length > 0;
    const tref = Sefaria.humanRef(this.props.srefs);
    const en = "No recommendations known for " + tref + ".";
    const he = "אין המלצות ידועות ל" + tref + ".";
    const noResultsMessage = <LoadingMessage message={en} heMessage={he} />;
    return (
      <div>
        {
          this.state.loading ?
            (<LoadingMessage />) :
          (hasRecs ?
            this.state.recommendations.map(this.renderItem) :
          noResultsMessage)
        }
      </div>
    );
  }
}
TextRecommendationBox.propTypes = {
  srefs: PropTypes.array.isRequired,
  panelPosition: PropTypes.number,
  onRangeClick: PropTypes.func.isRequired,
  onCitationClick: PropTypes.func.isRequired,
};

module.exports = TextRecommendationBox;
