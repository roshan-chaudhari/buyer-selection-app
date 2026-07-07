import { useCallback, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import Button from "../../components/Button";
import Table from "../../components/Table";
import type { ProjectDetailsPageProps, GroupedStyle } from "../../types/projects";
import { toDisplayDate } from "../../utils/date";
import { ProjectHeader } from "./ProjectHeader";
import { ExpandedRow } from "./ExpandedRow";
import { useProjectDetails } from "./useProjectDetails";
import { useProjectColumns } from "./useProjectColumns";
import { ProjectDetailsModals } from "./ProjectDetailsModals";
import ConfirmModal from "../../components/ConfirmModal";
import styles from "./ProjectDetailsPage.module.scss";

export default function ProjectDetailsPage({
  navigate,
  projectName,
  currentUser = null,
}: ProjectDetailsPageProps) {
  const details = useProjectDetails({ projectName, navigate, currentUser });
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const columns = useProjectColumns({
    plmColorwaysMap: details.plmColorwaysMap,
    plmImagesMap: details.plmImagesMap,
    onAnnotationOpen: details.openAnnotation,
    onColorwayChange: details.handleColorwayDropdownChange,
    onDeleteStyle: details.handleDeleteStyle,
    onConditionChange: details.handleConditionChange,
  });

  // ── Expanded Row Renderer ─────────────────────────────────────────────────────

  const renderExpandedRow = useCallback(
    (styleGroup: GroupedStyle) => (
      <ExpandedRow
        styleGroup={styleGroup}
        editStates={details.editStates}
        statusOptions={details.statusOptions}
        getDraftValue={details.getDraftValue}
        handleFieldChange={details.handleFieldChange}
        handleInlineSave={details.handleInlineSave}
        setDeleteItemTarget={details.setDeleteItemTarget}
      />
    ),
    [
      details.editStates,
      details.statusOptions,
      details.getDraftValue,
      details.handleFieldChange,
      details.handleInlineSave,
      details.setDeleteItemTarget,
    ],
  );

  // ── Loading Guard ─────────────────────────────────────────────────────────────

  if (details.isLoading) {
    return (
      <main className={styles.detailsMain}>
        <div className={styles.notFoundContainer}>
          <div className={styles.spinner} />
          <p className={styles.placeholderText}>Loading project details...</p>
        </div>
      </main>
    );
  }

  if (!details.project) return null;

  // ── Render ────────────────────────────────────────────────────────────────────

  const selectionDateStr = toDisplayDate(details.project.SelectionDate);

  return (
    <main className={styles.detailsMain}>
      <ProjectHeader
        project={details.project}
        isSynced={details.isSynced}
        selectionDateStr={selectionDateStr}
        onNavigate={navigate}
        onAddItems={() => details.setIsAddModalOpen(true)}
        onSyncProject={details.handleSyncProject}
        onEditMetadata={() => details.setIsEditing(true)}
      />

      {/* Styles Table */}
      <section className={styles.garmentGridSection}>
        <Table
          columns={columns}
          data={details.sortedGroupedStyles}
          sortColumn={details.sortColumn}
          sortDirection={details.sortDirection}
          onSort={details.handleSort}
          showSearch
          searchPlaceholder="Search style items..."
          emptyMessage="No items found. Click 'Add Items' to register styles using the Scanner or manual input."
          getRowKey={(row) => row.styleMaterialNumber}
          renderExpandedRow={renderExpandedRow}
          isRowSelected={(row) => details.selectedItem?.styleMaterialNumber === row.styleMaterialNumber}
          searchActions={
            <>
              <Button
                variant="outline"
                title="Refresh"
                onClick={details.handleRefresh}
                disabled={details.isLoading}
                icon={<RefreshCw size={14} className={details.isLoading ? styles.spinning : ''} />}
              />
              <Button
                variant="outline"
                title="Clear Project"
                onClick={() => setConfirmClearOpen(true)}
                disabled={details.sortedGroupedStyles.length === 0 || details.isLoading}
                icon={<Trash2 size={14} />}
              />
            </>
          }
        />
      </section>

      {/* Modals and toast */}
      <ProjectDetailsModals
        {...details}
        project={details.project}
        currentUser={currentUser}
      />

      <ConfirmModal
        isOpen={confirmClearOpen}
        title="Clear Project"
        message={
          <>
            Remove all <strong>{details.sortedGroupedStyles.length}</strong> style{details.sortedGroupedStyles.length === 1 ? '' : 's'} from this project?
            {' '}This cannot be undone.
          </>
        }
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={async () => {
          setConfirmClearOpen(false);
          await details.handleClearProject();
        }}
        isConfirming={details.isLoading}
      />
    </main>
  );
}
