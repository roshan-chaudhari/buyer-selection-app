import React from "react";
import Modal from "./Modal";
import Button from "./Button";
import styles from "./Modal.module.scss";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  isConfirming?: boolean;
  confirmLabel?: string;
  confirmingLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Reusable destructive-action confirmation dialog, built on the shared Modal
 * and the app's `.confirmBody` / `.confirmActions` layout classes.
 */
export default function ConfirmModal({
  isOpen,
  title,
  message,
  isConfirming = false,
  confirmLabel = "Delete",
  confirmingLabel = "Deleting…",
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <div className={styles.confirmBody}>
        <p className={styles.confirmText}>{message}</p>
        <div className={styles.confirmActions}>
          <Button variant="secondary" onClick={onCancel} disabled={isConfirming}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? confirmingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
