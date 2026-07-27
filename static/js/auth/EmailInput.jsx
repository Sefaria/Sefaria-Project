import React from 'react';
import PropTypes from 'prop-types';
import Input from '../common/Input.jsx';

const EmailInput = ({ value, setField, onFocus, onBlur, error }) => (
  <Input
    label="auth.email_address"
    type="email"
    name="email"
    inputDir="ltr"
    autoComplete="email"
    placeholder="you@example.com"
    value={value}
    onChange={setField('email')}
    onFocus={onFocus}
    onBlur={onBlur}
    error={error}
  />
);

EmailInput.propTypes = {
  value: PropTypes.string.isRequired,
  setField: PropTypes.func.isRequired,
  onFocus: PropTypes.func,
  onBlur: PropTypes.func,
  error: PropTypes.string,
};

export default EmailInput;
