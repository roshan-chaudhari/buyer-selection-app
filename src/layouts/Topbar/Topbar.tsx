import styles from "./Topbar.module.scss";
import { type InforUser } from "../../types/api";
import crosslineLogo from "../../assets/crosslinelogo.png";
import ProfileDropdown from "./ProfileDropdown";
import { useTheme } from "../../hooks/useTheme";

interface TopbarProps {
  onLogout: () => void;
  currentUser?: InforUser | null;
  loadingCurrentUser?: boolean;
  navigate?: (path: string) => void;
}

export default function Topbar({ 
  onLogout, 
  currentUser = null, 
  loadingCurrentUser = false, 
  navigate 
}: TopbarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className={styles.topbar}>
      <div className={styles.leftSection}>
        <div 
          className={styles.logoHomeButton} 
          onClick={() => navigate?.('/dashboard')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              navigate?.('/dashboard');
            }
          }}
          aria-label="Go to Dashboard"
        >
          <img src={crosslineLogo} className={styles.brandLogo} alt="CrossLine Logo" />
        </div>
        <div className={styles.brandBlock}>
          <span className={styles.brandTitle}>Buyer Selection App</span>
          <span className={styles.brandSubtitle}>Manage your projects</span>
        </div>
      </div>

      <ProfileDropdown 
        currentUser={currentUser}
        loadingCurrentUser={loadingCurrentUser}
        onLogout={onLogout}
        theme={theme}
        toggleTheme={toggleTheme}
      />
    </header>
  );
}
