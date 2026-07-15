import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import LoginPage from "./auth/LoginPage";
import DashboardPage from "./features/dashboard/DashboardPage";
import ProjectDetailsPage from "./features/projects/ProjectDetailsPage";

import ErrorScreen from "./components/ErrorScreen";
import { useAuth } from "./hooks/useAuth";
import MainLayout from "./layouts/MainLayout";
import type { InforUser } from "./types/api";

function ProjectDetailsPageWrapper({
  navigate,
  currentUser,
}: {
  navigate: (path: string) => void;
  currentUser: InforUser | null;
}) {
  const { projectName } = useParams<{ projectName: string }>();
  return (
    <ProjectDetailsPage
      navigate={navigate}
      projectName={decodeURIComponent(projectName || "")}
      currentUser={currentUser}
    />
  );
}

interface AppRoutesProps {
  token: string | null;
  logout: () => void;
  currentUser: InforUser | null;
  isLoadingUser: boolean;
}

function AppRoutes({ token, logout, currentUser, isLoadingUser }: AppRoutesProps) {
  const navigate = useNavigate();

  return (
    <Routes>
      {!token ? (
        <>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      ) : (
        <Route
          element={
            <MainLayout
              onLogout={logout}
              currentUser={currentUser}
              isLoadingUser={isLoadingUser}
              navigate={navigate}
            />
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <DashboardPage
                navigate={navigate}
                currentUser={currentUser}
              />
            }
          />
          <Route path="/project/:projectName">
            <Route
              index
              element={
                <ProjectDetailsPageWrapper
                  navigate={navigate}
                  currentUser={currentUser}
                />
              }
            />

          </Route>
          {/* Prevent logged-in users from going back to login screen */}
          <Route path="/login" element={<Navigate to="/dashboard" replace />} />
          {/* Fallback redirect for authenticated routes */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      )}
    </Routes>
  );
}

function App() {
  const {
    token,
    error,
    setError,
    logout,
    currentUser,
    isLoadingUser,
    loading: isAuthLoading,
  } = useAuth();

  if (isAuthLoading) {
    return (
      <div className="global-loading-container">
        <div className="global-spinner" />
        <p className="global-loading-text">Authenticating session...</p>
      </div>
    );
  }

  if (error) {
    return <ErrorScreen error={error} onErrorClear={() => setError(null)} />;
  }

  return (
    <BrowserRouter>
      <AppRoutes
        token={token}
        logout={logout}
        currentUser={currentUser}
        isLoadingUser={isLoadingUser}
      />
    </BrowserRouter>
  );
}

export default App;
