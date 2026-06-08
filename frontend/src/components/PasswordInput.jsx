import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import IconButton from './ui/IconButton';
import './PasswordInput.css';

const PasswordInput = ({ label, name, value, onChange, placeholder, required = false }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="auth-field password-input-container">
      <label htmlFor={name}>{label}</label>
      <div className="password-input-wrapper">
        <input
          id={name}
          type={isVisible ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          className="password-input-field"
        />
        <IconButton
          icon={isVisible ? EyeOff : Eye}
          label={isVisible ? '隐藏密码' : '显示密码'}
          size="sm"
          className="password-visibility-button"
          onClick={() => setIsVisible((current) => !current)}
        />
      </div>
    </div>
  );
};

export default PasswordInput;
