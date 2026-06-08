import React from 'react';

const PageHeader = ({ title, description, eyebrow, actions, children }) => (
  <header className="ui-page-header">
    <div className="ui-page-header__copy">
      {eyebrow && <div className="ui-page-header__eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {(actions || children) && <div className="ui-page-header__actions">{actions || children}</div>}
  </header>
);

export default PageHeader;
