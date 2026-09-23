import React from 'react';
import PropTypes from 'prop-types';
import Input from '../common/Input.jsx';

const EmailInput = ({ value, setField, onBlur, error }) => (
  <Input
    label="auth.email_address"
    type="email"
    name="email"
    inputDir="ltr"
    autoComplete="email"
    placeholder="you@example.com"
    value={value}
    onChange={setField('email')}
    onBlur={onBlur}
    error={error}
  />
);

EmailInput.propTypes = {
  value: PropTypes.string.isRequired,
  setField: PropTypes.func.isRequired,
  onBlur: PropTypes.func,
  error: PropTypes.string,
};

export default EmailInput;
