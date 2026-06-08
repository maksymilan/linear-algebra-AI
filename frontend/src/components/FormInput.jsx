import React from 'react';

const FormInput = ({ label, type = 'text', name, value, onChange, placeholder, required = false, ...props }) => (
  <div className="auth-field">
    <label htmlFor={name}>{label}</label>
    <input
      id={name}
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      {...props}
    />
  </div>
);

export default FormInput;
