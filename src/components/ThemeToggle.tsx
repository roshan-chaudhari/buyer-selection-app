import { Sun, Moon } from 'lucide-react';
import styles from './ThemeToggle.module.scss';

interface ThemeToggleProps {
  theme: 'light' | 'dark';
  onToggle: () => void;
  showText?: boolean;
}

export default function ThemeToggle({ theme, onToggle, showText = true }: ThemeToggleProps) {
  return (
    <button 
      className={styles.themeSwitchButton} 
      onClick={onToggle}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
    >
      <span className={`${styles.themeSwitchTrack} ${theme === 'light' ? styles.light : ''}`}>
        <span className={styles.themeSwitchThumb}>
          {theme === 'light' ? <Sun size={10} /> : <Moon size={10} />}
        </span>
      </span>
      {showText && (
        <span className={styles.themeToggleText}>
          {theme === 'light' ? 'Light' : 'Dark'}
        </span>
      )}
    </button>
  );
}
