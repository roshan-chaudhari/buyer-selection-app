import React from 'react';
import { Outlet } from 'react-router-dom';
import Topbar from './Topbar/Topbar';
import type { InforUser } from '../types/api';
import styles from './MainLayout.module.scss';
import Footer from '../components/Footer';

interface MainLayoutProps {
  children?: React.ReactNode;
  onLogout: () => void;
  currentUser: InforUser | null;
  isLoadingUser: boolean;
  navigate: (path: string) => void;
}

export default function MainLayout({
  children,
  onLogout,
  currentUser,
  isLoadingUser,
  navigate,
}: MainLayoutProps) {
  return (
    <div className={styles.layoutContainer}>
      <Topbar 
        onLogout={onLogout} 
        currentUser={currentUser} 
        loadingCurrentUser={isLoadingUser} 
        navigate={navigate}
      />
      {children || <Outlet />}
      <Footer />
    </div>
  );
}
