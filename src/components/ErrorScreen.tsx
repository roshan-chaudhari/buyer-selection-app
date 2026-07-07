import { useState } from 'react';
import styles from './ErrorScreen.module.scss';
import Toast, { ToastContainer } from './Toast';

interface ErrorScreenProps {
  error: string;
  onErrorClear: () => void;
}

/**
 * Presentational component displaying authentication errors and fallback controls.
 */
export default function ErrorScreen({ error, onErrorClear }: ErrorScreenProps) {
  const [showToast, setShowToast] = useState(true);
  const storedToken = localStorage.getItem('accessToken');

  const handleGoBack = () => {
    onErrorClear();
    localStorage.removeItem('accessToken');
    window.location.href = window.location.pathname; // Reload cleanly
  };

  return (
    <div className={styles.errorContainer}>
      {showToast && (
        <ToastContainer>
          <Toast 
            title="Authentication Error"
            message={error}
            type="error"
            duration={6000}
            onClose={() => setShowToast(false)}
          />
        </ToastContainer>
      )}

      <h2>Authentication Error</h2>
      <pre className={styles.errorBlock}>
        {error}
      </pre>
      {storedToken && (
        <div className={styles.storedTokenSection}>
          <h3 className={styles.storedTokenTitle}>Currently Stored Token:</h3>
          <pre className={styles.tokenBlock}>
            {storedToken}
          </pre>
        </div>
      )}
      <button 
        onClick={handleGoBack}
        className={styles.goBackBtn}
      >
        Go Back
      </button>
    </div>
  );
}
