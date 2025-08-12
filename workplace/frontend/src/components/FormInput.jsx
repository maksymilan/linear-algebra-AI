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

// **关键修复：添加了 name 属性，并将其传递给 input 元素**
const FormInput = ({ label, type = 'text', name, value, onChange, placeholder, required = false }) => {
  return (
    <div style={containerStyle}>
      <label style={{ marginBottom: '0.5rem', display: 'block' }}>{label}</label>
      <input
        type={type}
        name={name} // 添加 name 属性
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
