import React from 'react';
import PropTypes from 'prop-types';
import Input from '../common/Input.jsx';

const EmailInput = ({ value, setField, onFocus }) => (
  <Input
    label={Sefaria._('Email Address', 'Auth')}
    type="email"
    name="email"
    inputDir="ltr"
    autoComplete="email"
    placeholder="you@example.com"
    value={value}
    onChange={setField('email')}
    onFocus={onFocus}
  />
);

EmailInput.propTypes = {
  value: PropTypes.string.isRequired,
  setField: PropTypes.func.isRequired,
  onFocus: PropTypes.func,
};

export default EmailInput;
