import React from 'react';
import styles from './Form.module.scss';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'text' | 'danger';
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export default function Button({
  children,
  variant = 'primary',
  fullWidth = false,
  icon,
  iconRight,
  className = '',
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  const buttonClass = [
    styles.button,
    styles[variant],
    fullWidth ? styles.fullWidth : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={buttonClass}
      disabled={disabled}
      {...props}
    >
      {icon && <span className={styles.iconLeft}>{icon}</span>}
      {children && <span className={styles.btnLabel}>{children}</span>}
      {iconRight && <span className={styles.iconRight}>{iconRight}</span>}
    </button>
  );
}
