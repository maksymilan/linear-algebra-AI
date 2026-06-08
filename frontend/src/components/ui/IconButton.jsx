import React from 'react';

const IconButton = React.forwardRef(({
  icon: Icon,
  label,
  className = '',
  variant = 'ghost',
  size = 'md',
  ...props
}, ref) => (
  <button
    ref={ref}
    type="button"
    className={`ui-icon-button ui-icon-button--${variant} ui-icon-button--${size} ${className}`}
    aria-label={label}
    title={label}
    {...props}
  >
    {React.createElement(Icon, { size: size === 'sm' ? 16 : 19, 'aria-hidden': true })}
  </button>
));

IconButton.displayName = 'IconButton';

export default IconButton;
