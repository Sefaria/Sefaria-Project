/**
 * StatusMessage - Displays status messages with appropriate styling
 *
 * Accepts either:
 * - A string message (defaults to MESSAGE_TYPES.INFO)
 * - An object with { type, message } for explicit styling
 *
 * Types (from MESSAGE_TYPES):
 * - SUCCESS = green
 * - ERROR = red
 * - WARNING = yellow/amber
 * - INFO = light blue (default)
 */
import PropTypes from 'prop-types';

export const MESSAGE_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

const StatusMessage = ({ message, className = '' }) => {
  if (!message) return null;

  // Support both string and object formats
  const messageObj = typeof message === 'string'
    ? { type: MESSAGE_TYPES.INFO, message }
    : message;

  const { type = MESSAGE_TYPES.INFO, message: text } = messageObj;

  return (
    <div className={`message ${type} ${className}`.trim()}>
      {text}
    </div>
  );
};

StatusMessage.propTypes = {
  message: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      type: PropTypes.oneOf(Object.values(MESSAGE_TYPES)).isRequired,
      message: PropTypes.string.isRequired
    })
  ]),
  className: PropTypes.string
};

export default StatusMessage;
