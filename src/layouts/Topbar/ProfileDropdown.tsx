import { useState, useEffect, useRef } from "react";
import { User, LogOut } from "lucide-react";
import { type InforUser } from "../../types/api";
import ThemeToggle from "../../components/ThemeToggle";
import styles from "./Topbar.module.scss";

interface ProfileDropdownProps {
  currentUser: InforUser | null;
  loadingCurrentUser?: boolean;
  onLogout: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

export default function ProfileDropdown({
  currentUser,
  loadingCurrentUser = false,
  onLogout,
  theme,
  toggleTheme,
}: ProfileDropdownProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [tenantName] = useState(() => {
    const sessionStr = localStorage.getItem("session");
    let resolvedTenant = "";
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        resolvedTenant = session.tenant_name || "";
      } catch (e) {
        console.error("Failed to parse session", e);
      }
    }
    if (!resolvedTenant) {
      resolvedTenant = localStorage.getItem("ti") || "";
    }
    return resolvedTenant;
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getInitials = (firstName?: string, lastName?: string): string => {
    const f = (firstName || "").trim();
    const l = (lastName || "").trim();
    if (f && l) {
      return (f[0] + l[0]).toUpperCase();
    }
    const source = f || l;
    if (!source) return "";
    const parts = source.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return source.slice(0, 2).toUpperCase();
  };

  const avatarInitials = getInitials(currentUser?.firstName, currentUser?.lastName);

  return (
    <div className={styles.rightSection} ref={dropdownRef}>
      <button
        className={styles.userProfileSection}
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        aria-expanded={isDropdownOpen}
        aria-haspopup="true"
        aria-label="User menu"
      >
        <div className={styles.avatarCircle}>
          {avatarInitials ? (
            <span className={styles.avatarText}>{avatarInitials}</span>
          ) : (
            <User size={18} className={styles.avatarIcon} />
          )}
        </div>
      </button>

      {isDropdownOpen && (
        <div className={styles.dropdown}>
          {/* User header — avatar + name + tenant */}
          <div className={styles.dropdownUserHeader}>
            <div className={styles.dropdownAvatarCircle}>
              {avatarInitials ? (
                <span className={styles.avatarText}>{avatarInitials}</span>
              ) : (
                <User size={18} className={styles.avatarIcon} />
              )}
            </div>
            <div className={styles.dropdownUserDetails}>
              <span className={styles.dropdownUserName}>
                {loadingCurrentUser
                  ? "Loading..."
                  : currentUser
                  ? (currentUser.firstName + " " + currentUser.lastName).trim() || "System User"
                  : "System User"}
              </span>
              {tenantName && (
                <span className={styles.dropdownTenantName}>{tenantName}</span>
              )}
            </div>
          </div>
          <div className={styles.dropdownDivider} />
          <div className={styles.themeToggleSection}>
            <div className={styles.themeToggleField}>
              <span className={styles.themeToggleLabel}>Theme</span>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
          </div>
          {(currentUser?.email || currentUser?.roleName || currentUser?.activeSchema) && (
            <>
              <div className={styles.dropdownDivider} />
              <div className={styles.dropdownUserInfo}>
                {currentUser?.email && (
                  <div className={styles.infoField}>
                    <span className={styles.infoLabel}>Email</span>
                    <span className={styles.infoValue} title={currentUser.email}>
                      {currentUser.email}
                    </span>
                  </div>
                )}
                {currentUser?.roleName && (
                  <div className={styles.infoField}>
                    <span className={styles.infoLabel}>Role</span>
                    <span className={styles.infoValue}>{currentUser.roleName}</span>
                  </div>
                )}
                {currentUser?.activeSchema && (
                  <div className={styles.infoField}>
                    <span className={styles.infoLabel}>Schema</span>
                    <span className={styles.infoValue}>
                      {currentUser.activeSchema}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          <div className={styles.dropdownDivider} />
          <button
            className={`${styles.dropdownItem} ${styles.danger}`}
            onClick={onLogout}
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  );
}
