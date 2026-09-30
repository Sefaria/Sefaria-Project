import React from 'react';
import { InterfaceText } from '../Misc.jsx';

const LoadingSub = () => (
  <span className="sefaria-auth-loading">
    <span className="sefaria-auth-loading-spinner" aria-hidden="true" />
    <InterfaceText>auth.loading</InterfaceText>
  </span>
);

export default LoadingSub;
