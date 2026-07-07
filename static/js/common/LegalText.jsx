import React from 'react';
import PropTypes from 'prop-types';

/**
 * LegalText — the Terms of Use / Privacy Policy consent line at the bottom of the
 * auth card. Presentational: pass the already-localized sentence (with <a> links)
 * as children so the wording/links can be composed by the consumer. Figma `Legal Text`.
 */
const LegalText = ({ children }) => (
  <p className="sefaria-legal-text">{children}</p>
);

LegalText.propTypes = { children: PropTypes.node };

export default LegalText;
