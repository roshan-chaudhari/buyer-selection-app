import React, { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import styles from "./NewProjectModal.module.scss";
import Button from "../../components/Button";
import Input from "../../components/Input";
import Dropdown from "../../components/Dropdown";
import Textarea from "../../components/Textarea";
import { odata2Service } from "../../services/api";

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (project: {
    name: string;
    buyerName: string;
    buyerId: number;
    description: string;
    selectionDate: string;
    itemsCount?: number;
  }) => void;
}

export default function NewProjectModal({
  isOpen,
  onClose,
  onCreate,
}: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [buyers, setBuyers] = useState<{ value: string; label: string; id: number }[]>([]);
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [selectionDate, setSelectionDate] = useState(() => new Date().toISOString().split('T')[0]);

  const handleClose = () => {
    setName("");
    setSelectedBuyerId("");  // reset selection, but keep buyers list cached
    setDescription("");
    setSelectionDate(new Date().toISOString().split('T')[0]);
    onClose();
  };

  // Fetch buyers whenever the modal opens; cache is kept across closings
  useEffect(() => {
    if (!isOpen) return;
    // If already loaded, don't re-fetch
    if (buyers.length > 0) return;

    const fetchBuyers = async () => {
      try {
        const buyersList = await odata2Service.getLookupOptions(103);
        setBuyers(buyersList);
        console.log('[NewProjectModal] Loaded buyers:', buyersList);
      } catch (err) {
        console.error('[NewProjectModal] Failed to load buyers:', err);
      }
    };
    fetchBuyers();
  }, [isOpen, buyers.length]); // re-run when modal opens or buyers length changes


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedBuyer = buyers.find(b => b.id.toString() === selectedBuyerId);
    if (!name.trim() || !selectedBuyer) return;

    onCreate({
      name: name.trim(),
      buyerName: selectedBuyer.label,
      buyerId: selectedBuyer.id,
      description: description.trim(),
      selectionDate,
      itemsCount: 0,
    });

    handleClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create New Project">
      <form onSubmit={handleSubmit} className={styles.formContainer}>
        <Input
          label="Project Name *"
          type="text"
          id="projectName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Autumn Buyer Selection"
          required
          autoFocus
        />

        <Dropdown
          label="Buyer Name *"
          id="buyerSelect"
          value={selectedBuyerId}
          onChange={(e) => setSelectedBuyerId(e.target.value)}
          searchPlaceholder="Search buyer..."
        >
          <option value="" disabled>-- Select Buyer --</option>
          {buyers.map((b) => (
            <option key={b.id} value={b.id.toString()}>{b.label}</option>
          ))}
        </Dropdown>

        <Input
          label="Selection Date"
          type="date"
          id="selectionDate"
          value={selectionDate}
          onChange={(e) => setSelectionDate(e.target.value)}
        />

        <Textarea
          label="Project Comment"
          id="projectDesc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the goals or context of this buyer selection lifecycle..."
          rows={3}
        />

        <div className={styles.formActions}>
          <Button type="button" onClick={handleClose} variant="outline">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!name.trim() || !selectedBuyerId}
          >
            Create Project
          </Button>
        </div>
      </form>
    </Modal>
  );
}
