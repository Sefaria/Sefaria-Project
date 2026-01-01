/**
 * StatusMessage - Displays status messages with appropriate styling
 *
 * Automatically detects message type based on emoji prefix:
 * - ✅ = success (green)
 * - ❌ = error (red)
 * - ⚠️ = warning (yellow)
 * - default = info (blue)
 *
 * For AI agents: This component provides consistent feedback UX.
 * Always use emoji prefixes for automated type detection, or pass
 * the type prop explicitly.
 */
import React from 'react';
import PropTypes from 'prop-types';

/**
 * Detect message type from emoji prefix
 */
const detectType = (message) => {
  if (!message) return 'info';
  if (message.includes('✅')) return 'success';
  if (message.includes('❌')) return 'error';
  if (message.includes('⚠️')) return 'warning';
  return 'info';
};

const StatusMessage = ({ message, type, className = '' }) => {
  if (!message) return null;

  const detectedType = type || detectType(message);

  return (
    <div className={`message ${detectedType} ${className}`.trim()}>
      {message}
    </div>
  );
};

StatusMessage.propTypes = {
  message: PropTypes.string,
  type: PropTypes.oneOf(['success', 'error', 'warning', 'info']),
  className: PropTypes.string
};

export default StatusMessage;
