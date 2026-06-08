import React from 'react';
import { Loader2 } from 'lucide-react';

const variants = {
  primary: 'ui-button--primary',
  secondary: 'ui-button--secondary',
  ghost: 'ui-button--ghost',
  danger: 'ui-button--danger',
};

const sizes = {
  sm: 'ui-button--sm',
  md: 'ui-button--md',
  lg: 'ui-button--lg',
};

const Button = React.forwardRef(({
  children,
  className = '',
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  icon: Icon,
  type = 'button',
  ...props
}, ref) => (
  <button
    ref={ref}
    type={type}
    className={`ui-button ${variants[variant] || variants.secondary} ${sizes[size] || sizes.md} ${className}`}
    disabled={disabled || loading}
    {...props}
  >
    {loading ? <Loader2 size={16} className="ui-spin" aria-hidden="true" /> : Icon ? <Icon size={16} aria-hidden="true" /> : null}
    <span>{children}</span>
  </button>
));

Button.displayName = 'Button';

export default Button;
