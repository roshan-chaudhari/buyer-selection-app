import Modal from "./Modal";
import Button from "./Button";
import styles from "./Modal.module.scss";

interface UnsavedChangesModalProps {
  isOpen: boolean;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
  onStay: () => void;
  isSaving?: boolean;
}

/**
 * Confirmation popup displayed when user attempts to leave a page with unsaved modifications.
 * Provides Save, Discard Changes, and Stay on Current Page options.
 */
export default function UnsavedChangesModal({
  isOpen,
  onSave,
  onDiscard,
  onStay,
  isSaving = false,
}: UnsavedChangesModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onStay} title="Unsaved Changes">
      <div className={styles.confirmBody}>
        <p className={styles.confirmText}>
          You have unsaved changes. Do you want to save your changes before leaving this page?
        </p>
        <div className={styles.confirmActions} style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onStay} disabled={isSaving}>
            Stay on Current Page
          </Button>
          <Button variant="danger" onClick={onDiscard} disabled={isSaving}>
            Discard Changes
          </Button>
          <Button variant="primary" onClick={onSave} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
