import React, { useState } from 'react';
import EyeOpenIcon from '../assets/icons/EyeOpenIcon';
import EyeClosedIcon from '../assets/icons/EyeClosedIcon';
import './PasswordInput.css'; 

const PasswordInput = ({ label, value, onChange, placeholder, required = false }) => {
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  return (
    <div className="password-input-container">
      <label className="password-input-label">{label}</label>
      <div className="password-input-wrapper">
        <input
          type={isVisible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          className="password-input-field" 
        />
        <button
          type="button"
          onClick={toggleVisibility}
          className="password-visibility-button" 
        >
          {isVisible ? <EyeOpenIcon /> : <EyeClosedIcon />}
        </button>
      </div>
    </div>
  );
};

export default PasswordInput;