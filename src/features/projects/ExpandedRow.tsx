import React from "react";
import { Save, Trash2 } from "lucide-react";
import Button from "../../components/Button";
import Dropdown from "../../components/Dropdown";
import type { ProjectItem } from "../../services/projectService";
import { toDateInputValue } from "../../utils/date";
import styles from "./ProjectDetailsPage.module.scss";

interface ExpandedRowProps {
  styleGroup: { items: ProjectItem[] };
  editStates: Record<number, Partial<ProjectItem>>;
  statusOptions: { value: string; label: string; id: number }[];
  getDraftValue: <K extends keyof ProjectItem>(item: ProjectItem, field: K) => ProjectItem[K];
  handleFieldChange: (itemId: number, field: keyof ProjectItem, value: any) => void;
  handleInlineSave: (item: ProjectItem) => void;
  setDeleteItemTarget: (item: ProjectItem) => void;
}

export const ExpandedRow: React.FC<ExpandedRowProps> = ({
  styleGroup,
  editStates,
  statusOptions,
  getDraftValue,
  handleFieldChange,
  handleInlineSave,
  setDeleteItemTarget,
}) => {
  const activeItems = styleGroup.items.filter((item) => !!item.colorway);

  if (activeItems.length === 0) {
    return (
      <div className={styles.expandedColorwaysContainer}>
        <div style={{ padding: "1.25rem 2rem", color: "var(--color-text-secondary, #6b7280)", fontSize: "0.875rem", textAlign: "center" }}>
          No colorways selected. Use the colorway dropdown above to select colorways for this style.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.expandedColorwaysContainer}>
      <div className={styles.colorwayList}>
        {activeItems.map((item) => {
          const hasDraft = !!(item.id && editStates[item.id]);
          return (
            <div key={item.id} className={styles.colorwayRow}>
              {/* Colorway Name */}
              <div className={styles.colorwayFieldCol}>
                <span className={styles.colorwayFieldLabel}>COLORWAY</span>
                <div className={styles.colorwayNameContainer}>
                  <div className={styles.colorwayDot} />
                  <span className={styles.colorwayFieldValueBold} title={item.colorway || ""}>
                    {item.colorway || ""}
                  </span>
                </div>
              </div>

              {/* Status Dropdown */}
              <div className={styles.colorwayFieldCol}>
                <span className={styles.colorwayFieldLabel}>STATUS</span>
                <Dropdown
                  className={styles.inlineSelectDropdown}
                  value={getDraftValue(item, "colorwayStatus") || "Pending"}
                  searchable={false}
                  fullWidth={true}
                  onChange={(e) => {
                    const selected = e.target.value;
                    handleFieldChange(item.id!, "colorwayStatus", selected);
                    const match = statusOptions.find((opt) => opt.value === selected);
                    if (match) handleFieldChange(item.id!, "colorStatusId", match.id);
                  }}
                >
                  {statusOptions.length === 0 ? (
                    <option value={item.colorwayStatus}>{item.colorwayStatus || "Pending"}</option>
                  ) : (
                    statusOptions.map((opt) => (
                      <option key={opt.id} value={opt.value}>
                        {opt.label}
                      </option>
                    ))
                  )}
                </Dropdown>
              </div>

              {/* Due Date */}
              <div className={styles.colorwayFieldCol}>
                <span className={styles.colorwayFieldLabel}>DUE</span>
                <input
                  type="date"
                  className={styles.inlineDateInput}
                  value={toDateInputValue(getDraftValue(item, "sampleDue"))}
                  onChange={(e) => handleFieldChange(item.id!, "sampleDue", e.target.value)}
                />
              </div>

              {/* Buyer Comments */}
              <div className={styles.colorwayFieldColComment}>
                <span className={styles.colorwayFieldLabel}>BUYER COMMENTS</span>
                <input
                  type="text"
                  value={getDraftValue(item, "buyerComments") || ""}
                  onChange={(e) => handleFieldChange(item.id!, "buyerComments", e.target.value)}
                  placeholder="Add buyer comment..."
                />
              </div>

              {/* Internal Notes */}
              <div className={styles.colorwayFieldColComment}>
                <span className={styles.colorwayFieldLabel}>INTERNAL NOTES</span>
                <input
                  type="text"
                  className={styles.inlineCommentInput}
                  value={getDraftValue(item, "internalComments") || ""}
                  onChange={(e) => handleFieldChange(item.id!, "internalComments", e.target.value)}
                  placeholder="Add internal comment..."
                />
              </div>

              {/* Row Actions */}
              <div className={styles.colorwayActionsCol}>
                <Button
                  variant="text"
                  icon={<Save size={14} />}
                  title="Save Changes"
                  disabled={!hasDraft}
                  onClick={() => handleInlineSave(item)}
                  style={hasDraft ? { color: "var(--color-primary, #0072ED)" } : undefined}
                />
                <Button
                  variant="text"
                  icon={<Trash2 size={14} />}
                  title="Delete Colorway"
                  onClick={() => setDeleteItemTarget(item)}
                  className={styles.deleteButton}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
