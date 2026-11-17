import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { useNavigate, type NavigateOptions, type To } from "react-router-dom";
import UnsavedChangesModal from "../components/UnsavedChangesModal";
import {
  NavigationBlockerContext,
  type BlockerRegistration,
} from "./NavigationBlockerContext";

export default function NavigationBlockerProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const blockersRef = useRef<Set<BlockerRegistration>>(new Set());

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const registerBlocker = useCallback((blocker: BlockerRegistration) => {
    blockersRef.current.add(blocker);
    return () => {
      blockersRef.current.delete(blocker);
    };
  }, []);

  const getActiveDirtyBlocker = useCallback((): BlockerRegistration | null => {
    for (const b of blockersRef.current) {
      const dirty = typeof b.isDirty === "function" ? b.isDirty() : b.isDirty;
      if (dirty) return b;
    }
    return null;
  }, []);

  const checkIsDirty = useCallback((): boolean => {
    return getActiveDirtyBlocker() !== null;
  }, [getActiveDirtyBlocker]);

  const guardedNavigate = useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (checkIsDirty()) {
        setPendingAction(() => () => {
          if (typeof to === "number") {
            navigate(to);
          } else {
            navigate(to, options);
          }
        });
        setIsModalOpen(true);
      } else {
        if (typeof to === "number") {
          navigate(to);
        } else {
          navigate(to, options);
        }
      }
    },
    [navigate, checkIsDirty]
  );

  const checkAndConfirm = useCallback(
    (action: () => void): boolean => {
      if (checkIsDirty()) {
        setPendingAction(() => action);
        setIsModalOpen(true);
        return true;
      }
      action();
      return false;
    },
    [checkIsDirty]
  );

  const handleStay = useCallback(() => {
    setIsModalOpen(false);
    setPendingAction(null);
  }, []);

  const handleDiscard = useCallback(() => {
    const blocker = getActiveDirtyBlocker();
    blocker?.onDiscard?.();
    setIsModalOpen(false);
    const action = pendingAction;
    setPendingAction(null);
    if (action) {
      setTimeout(() => action(), 0);
    }
  }, [pendingAction, getActiveDirtyBlocker]);

  const handleSave = useCallback(async () => {
    const blocker = getActiveDirtyBlocker();
    setIsSaving(true);
    try {
      const result = await blocker?.onSave?.();
      if (result !== false) {
        setIsModalOpen(false);
        const action = pendingAction;
        setPendingAction(null);
        if (action) {
          setTimeout(() => action(), 0);
        }
      }
    } catch (err) {
      console.error("[NavigationBlocker] Save failed:", err);
    } finally {
      setIsSaving(false);
    }
  }, [pendingAction, getActiveDirtyBlocker]);

  // Handle browser window / tab unload (reload or close tab)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (checkIsDirty()) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [checkIsDirty]);

  // Handle browser back / forward buttons
  useEffect(() => {
    const handlePopState = () => {
      if (checkIsDirty()) {
        window.history.pushState(null, "", window.location.href);
        setPendingAction(() => () => window.history.back());
        setIsModalOpen(true);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [checkIsDirty]);

  return (
    <NavigationBlockerContext.Provider
      value={{
        isBlocked: isModalOpen,
        registerBlocker,
        guardedNavigate,
        checkAndConfirm,
      }}
    >
      {children}
      <UnsavedChangesModal
        isOpen={isModalOpen}
        onStay={handleStay}
        onDiscard={handleDiscard}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </NavigationBlockerContext.Provider>
  );
}
export { NavigationBlockerProvider };

