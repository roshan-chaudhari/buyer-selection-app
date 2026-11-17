import { createContext } from "react";
import type { NavigateOptions, To } from "react-router-dom";

export interface BlockerRegistration {
  isDirty: boolean | (() => boolean);
  onSave?: () => Promise<boolean | void> | boolean | void;
  onDiscard?: () => void;
}

export interface NavigationBlockerContextType {
  isBlocked: boolean;
  registerBlocker: (blocker: BlockerRegistration) => () => void;
  guardedNavigate: (to: To | number, options?: NavigateOptions) => void;
  checkAndConfirm: (action: () => void) => boolean;
}

export const NavigationBlockerContext = createContext<NavigationBlockerContextType | null>(null);

