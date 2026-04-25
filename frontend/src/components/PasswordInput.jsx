import React, { useState } from 'react';
import EyeOpenIcon from '../assets/icons/EyeOpenIcon';
import EyeClosedIcon from '../assets/icons/EyeClosedIcon';
import './PasswordInput.css'; 

// **关键修复：添加了 name 属性，并将其传递给 input 元素**
const PasswordInput = ({ label, name, value, onChange, placeholder, required = false }) => {
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
          name={name} // 添加 name 属性
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          className="password-input-field" 
        />
        {/* <button
          type="button"
          onClick={toggleVisibility}
          className="password-visibility-button" 
        >
          {isVisible ? <EyeOpenIcon /> : <EyeClosedIcon />}
        </button> */}
      </div>
    </div>
  );
};

export default PasswordInput;
