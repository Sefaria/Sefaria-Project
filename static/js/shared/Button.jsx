const Button = ({ variant = 'primary', icon, children, onClick, className = '' }) => {
  return (
    <button
      className={`button ${variant} ${className}`}
      onClick={onClick}
    >
      {icon && <Icon className="button-icon" />}
      {children}
    </button>
  );
};

export default Button;