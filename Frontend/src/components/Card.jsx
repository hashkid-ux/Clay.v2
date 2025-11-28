import React from 'react';

const Card = ({ 
  children, 
  title = null,
  subtitle = null,
  footer = null,
  padding = 'p-6',
  shadow = 'shadow',
  hover = false,
  onClick = null,
  className = ''
}) => {
  return (
    <div
      className={`bg-white rounded-lg ${shadow} ${padding} ${
        hover ? 'hover:shadow-lg transition-shadow cursor-pointer' : ''
      } ${className}`}
      onClick={onClick}
    >
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
          {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
        </div>
      )}

      <div>{children}</div>

      {footer && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          {footer}
        </div>
      )}
    </div>
  );
};

export default Card;
