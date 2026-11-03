import React from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import {InterfaceText} from './Misc';


const SiddurHiddenHint = ({names, onCustomize}) => {
  // Inline note marking where a customized siddur hides sections, e.g.
  // Not showing “Tzitzit”. Customize
  const isHebrew = Sefaria.interfaceLang === "hebrew";
  const list = names.map(name => isHebrew ? (name.he || name.en) : `“${name.en}”`).join(", ");
  const sentence = `${Sefaria._("siddur_customize.not_showing")} ${list}.`;
  return (
    <div className="siddurHiddenHint">
      <InterfaceText text={{en: sentence, he: sentence}} />
      <button
        type="button"
        className="siddurHiddenHintLink"
        onClick={e => { e.stopPropagation(); onCustomize(); }}
      >
        <InterfaceText>siddur_customize.customize</InterfaceText>
      </button>
    </div>
  );
};
SiddurHiddenHint.propTypes = {
  names:       PropTypes.arrayOf(PropTypes.shape({en: PropTypes.string, he: PropTypes.string})).isRequired,
  onCustomize: PropTypes.func.isRequired,
};

export default SiddurHiddenHint;
