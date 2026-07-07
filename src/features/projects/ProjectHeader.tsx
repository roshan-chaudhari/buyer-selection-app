import React from "react";
import { User, Calendar, Plus, Edit, CloudSync } from "lucide-react";
import Button from "../../components/Button";
import type { TableType } from "../../types/table";
import styles from "./ProjectDetailsPage.module.scss";

interface ProjectHeaderProps {
  project: TableType;
  isSynced: boolean;
  selectionDateStr: string;
  onNavigate: (path: string) => void;
  onAddItems: () => void;
  onSyncProject: () => void;
  onEditMetadata: () => void;
}

export const ProjectHeader: React.FC<ProjectHeaderProps> = ({
  project,
  isSynced,
  selectionDateStr,
  onNavigate,
  onAddItems,
  onSyncProject,
  onEditMetadata,
}) => {
  return (
    <>
      {/* Breadcrumb & Top Action */}
      <div className={styles.breadcrumbsRow}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <span className={styles.breadcrumbLink} onClick={() => onNavigate("/dashboard")}>
            Dashboard
          </span>
          <span className={styles.breadcrumbSeparator}>/</span>
          <span className={styles.breadcrumbActive}>{project.ProjectName}</span>
        </nav>
        <Button
          variant="outline"
          className={styles.addStylesBtn}
          onClick={onAddItems}
          icon={<Plus size={14} />}
        >
          Add Items
        </Button>
      </div>

      {/* Project Header */}
      <section className={styles.detailsHeader}>
        <div className={styles.headerMetaBlock}>
          <div>
            <div className={styles.titleRow}>
              <h1 className={styles.projectTitle}>{project.ProjectName}</h1>
              <span className={`${styles.statusBadge} ${isSynced ? styles.synced : styles.draft}`}>
                {isSynced ? "Synchronized" : "Draft"}
              </span>
            </div>
            <div className={styles.projectMeta}>
              <div className={styles.metaItem}>
                <User size={14} className={styles.metaIcon} />
                <span>Buyer: {project.BuyerName || "Not Assigned"}</span>
              </div>
              <div className={styles.metaItem}>
                <Calendar size={14} className={styles.metaIcon} />
                <span>Date: {selectionDateStr}</span>
              </div>
            </div>
            {project.Description && (
              <p className={styles.projectDescription}>{project.Description}</p>
            )}
          </div>
          <div className={styles.headerActions}>
            <Button
              variant="outline"
              className={styles.editBtn}
              onClick={onSyncProject}
              disabled={isSynced}
              title="Synchronize project To PLM"
              icon={<CloudSync size={14} />}
            />
            <Button
              variant="outline"
              className={styles.editBtn}
              onClick={onEditMetadata}
              aria-label="Edit project metadata"
              title="Edit project metadata"
              icon={<Edit size={14} />}
            />
          </div>
        </div>
      </section>
    </>
  );
};
