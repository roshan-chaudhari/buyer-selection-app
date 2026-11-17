import { useContext } from "react";
import {
  NavigationBlockerContext,
  type NavigationBlockerContextType,
  type BlockerRegistration,
} from "../contexts/NavigationBlockerContext";
import { NavigationBlockerProvider } from "../contexts/NavigationBlockerProvider";

export function useNavigationBlocker(): NavigationBlockerContextType {
  const context = useContext(NavigationBlockerContext);
  if (!context) {
    throw new Error("useNavigationBlocker must be used within a NavigationBlockerProvider");
  }
  return context;
}

export {
  NavigationBlockerProvider,
  type NavigationBlockerContextType,
  type BlockerRegistration,
};
