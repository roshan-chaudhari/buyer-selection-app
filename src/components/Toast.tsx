import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import styles from './Toast.module.scss';

export interface ToastProps {
  title?: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number; // 0 or negative to disable auto-close
  onClose: () => void;
}

/**
 * Toast component representing a single visual notification alert.
 */
export default function Toast({
  title,
  message,
  type = 'info',
  duration = 5000,
  onClose,
}: ToastProps) {
  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className={styles.icon} size={18} />;
      case 'error':
        return <AlertCircle className={styles.icon} size={18} />;
      case 'warning':
        return <AlertTriangle className={styles.icon} size={18} />;
      case 'info':
      default:
        return <Info className={styles.icon} size={18} />;
    }
  };

  const displayTitle = title || type;

  return (
    <div className={`${styles.toast} ${styles[type]}`}>
      <div className={styles.iconContainer}>
        {getIcon()}
      </div>
      
      <div className={styles.content}>
        <h4 className={styles.title}>{displayTitle}</h4>
        <p className={styles.message}>{message}</p>
      </div>

      <button 
        onClick={onClose} 
        className={styles.closeButton} 
        aria-label="Close notification"
      >
        <X size={16} />
      </button>

      {duration > 0 && (
        <div className={styles.progressBarContainer}>
          <div 
            className={styles.progressBar} 
            style={{ animationDuration: `${duration}ms` }} 
          />
        </div>
      )}
    </div>
  );
}

interface ToastContainerProps {
  children: React.ReactNode;
}

/**
 * Renders toast elements in a Portal at the root Level of the DOM.
 */
export function ToastContainer({ children }: ToastContainerProps) {
  return createPortal(
    <div className={styles.toastContainer}>
      {children}
    </div>,
    document.body
  );
}
