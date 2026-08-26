import React from 'react';
import PropTypes from 'prop-types';
import Input from '../common/Input.jsx';

const PasswordInput = ({
  label, name, autoComplete, value, onChange, onBlur, trailingLink, error,
}) => (
  <Input
    label={label}
    type="password"
    name={name}
    inputDir="ltr"
    autoComplete={autoComplete}
    placeholder="••••••••"
    value={value}
    onChange={onChange}
    onBlur={onBlur}
    trailingLink={trailingLink}
    error={error}
  />
);

PasswordInput.propTypes = {
  label: PropTypes.string,
  name: PropTypes.string,
  autoComplete: PropTypes.string,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onBlur: PropTypes.func,
  trailingLink: PropTypes.object,
  error: PropTypes.node,
};

PasswordInput.defaultProps = {
  label: 'auth.password',
  name: 'password',
  autoComplete: 'current-password',
};

export default PasswordInput;
