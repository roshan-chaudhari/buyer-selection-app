import { useState } from "react";
import { Save } from "lucide-react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";
import Input from "../../components/Input";
import { projectService } from "../../services/projectService";
import type { TableType } from "../../types/table";
import type { InforUser } from "../../types/api";
import styles from "./EditProjectModal.module.scss";
import Textarea from "../../components/Textarea";

interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: TableType;
  currentUser: InforUser | null;
  onSave: (updated: TableType) => void;
  onError?: (message: string) => void;
}

export default function EditProjectModal({
  isOpen,
  onClose,
  project,
  currentUser,
  onSave,
  onError,
}: EditProjectModalProps) {
  const [editName, setEditName] = useState(project.ProjectName);
  const [description, setDescription] = useState(project.Description || "");
  const [editDate, setEditDate] = useState(() =>
    project.SelectionDate
      ? new Date(project.SelectionDate).toISOString().split("T")[0]
      : "",
  );
  const editItemsCount = project.Items || 0;
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project?.id) return;

    setIsSaving(true);
    try {
      const updated = await projectService.updateProject(
        project.id,
        {
          name: editName.trim(),
          buyerName: project.BuyerName || "",
          buyerId: project.BuyerId,
          description: description.trim(),
          selectionDate: editDate,
          itemsCount: editItemsCount,
        },
        currentUser,
      );
      onSave(updated);
      onClose();
    } catch (err) {
      console.error("Failed to update project:", err);
      if (onError) {
        onError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Project Details">
      <form onSubmit={handleSave} className={styles.editForm}>
        <div className={styles.formGrid}>
          <Input
            label="Project Name"
            type="text"
            id="projectName"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
          />

          <Input
            label="Buyer Name"
            type="text"
            id="buyerName"
            value={project.BuyerName || ""}
            disabled
          />

          <Input
            label="Selection Date"
            type="date"
            id="selectionDate"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
          />
          <Textarea
            label="Project Comment"
            id="projectDesc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the goals or context of this buyer selection lifecycle..."
            rows={3}
          />
        </div>
        <div className={styles.formActions}>
          <Button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className={styles.saveBtn}
            disabled={isSaving}
            icon={<Save size={14} />}
            variant="primary"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
