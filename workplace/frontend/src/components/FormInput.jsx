import React from 'react';

const inputStyle = {
  padding: '0.8rem',
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #ccc',
  borderRadius: '4px',
};

const containerStyle = {
  marginBottom: '1rem',
  textAlign: 'left',
};

const FormInput = ({ label, type = 'text', value, onChange, placeholder, required = false }) => {
  return (
    <div style={containerStyle}>
      <label style={{ marginBottom: '0.5rem', display: 'block' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        style={inputStyle}
      />
    </div>
  );
};

export default FormInput;