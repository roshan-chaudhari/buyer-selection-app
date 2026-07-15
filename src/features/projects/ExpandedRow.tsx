import React from "react";
import { Save, Trash2 } from "lucide-react";
import Button from "../../components/Button";
import type { ProjectItem } from "../../services/projectService";
import { toDateInputValue, toDisplayDate } from "../../utils/date";
import styles from "./ProjectDetailsPage.module.scss";

interface ExpandedRowProps {
  styleGroup: { items: ProjectItem[] };
  editStates: Record<number, Partial<ProjectItem>>;
  statusOptions: { value: string; label: string; id: number }[];
  isLocked: boolean;
  getDraftValue: <K extends keyof ProjectItem>(item: ProjectItem, field: K) => ProjectItem[K];
  handleFieldChange: (itemId: number, field: keyof ProjectItem, value: any) => void;
  handleInlineSave: (item: ProjectItem) => void;
  setDeleteItemTarget: (item: ProjectItem) => void;
}

export const ExpandedRow: React.FC<ExpandedRowProps> = ({
  styleGroup,
  editStates,
  statusOptions,
  isLocked,
  getDraftValue,
  handleFieldChange,
  handleInlineSave,
  setDeleteItemTarget,
}) => {
  const activeItems = styleGroup.items.filter((item) => !!item.colorway);

  /**
   * Resolves the Status name to display for a given item.
   * Priority: draft colorwayStatus → draft colorStatusId lookup → saved colorwayStatus → saved colorStatusId lookup → "Selected"
   * ColorStatusId is never shown in the UI — it is only used here to derive the name.
   */
  const getDisplayStatus = (item: ProjectItem): string => {
    const draftStatus = getDraftValue(item, "colorwayStatus");
    if (draftStatus) return draftStatus as string;

    const draftStatusId = getDraftValue(item, "colorStatusId") as number | undefined;
    if (draftStatusId && draftStatusId > 0) {
      const match = statusOptions.find((opt) => opt.id === draftStatusId);
      if (match) return match.value;
    }

    if (item.colorwayStatus) return item.colorwayStatus;

    if (item.colorStatusId && item.colorStatusId > 0) {
      const match = statusOptions.find((opt) => opt.id === item.colorStatusId);
      if (match) return match.value;
    }

    return "Selected";
  };

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
          const rawDue = getDraftValue(item, "sampleDue");
          const displayDue = rawDue ? toDisplayDate(rawDue) : "DD/MM/YYYY";
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

              {/* Status — read-only display of Status name; ColorStatusId is internal only */}
              <div className={styles.colorwayFieldCol}>
                <span className={styles.colorwayFieldLabel}>STATUS</span>
                <input
                  type="text"
                  className={styles.inlineReadOnlyInput}
                  value={getDisplayStatus(item)}
                  readOnly
                  tabIndex={-1}
                  aria-label="Status"
                />
              </div>

              {/* Due Date */}
              <div className={styles.colorwayFieldCol}>
                <span className={styles.colorwayFieldLabel}>DUE DATE</span>
                <input
                  type="date"
                  className={styles.inlineDateInput}
                  value={toDateInputValue(getDraftValue(item, "sampleDue"))}
                  onChange={(e) => handleFieldChange(item.id!, "sampleDue", e.target.value)}
                  disabled={isLocked}
                  readOnly={isLocked}
                  data-date={displayDue}
                />
              </div>

              {/* Buyer Comments */}
              <div className={styles.colorwayFieldColComment}>
                <span className={styles.colorwayFieldLabel}>BUYER COMMENTS</span>
                <input
                  type="text"
                  className={styles.inlineCommentInput}
                  value={getDraftValue(item, "buyerComments") || ""}
                  onChange={(e) => handleFieldChange(item.id!, "buyerComments", e.target.value)}
                  placeholder={isLocked ? "" : "Add buyer comment..."}
                  disabled={isLocked}
                  readOnly={isLocked}
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
                  placeholder={isLocked ? "" : "Add internal comment..."}
                  disabled={isLocked}
                  readOnly={isLocked}
                />
              </div>

              {/* Row Actions — hidden when project is locked */}
              {!isLocked && (
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
