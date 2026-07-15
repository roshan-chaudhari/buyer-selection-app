import React from "react";
import type { TableType } from "../../types/table";
import type { InforUser } from "../../types/api";
import type { ProjectItem } from "../../services/projectService";
import ConfirmModal from "../../components/ConfirmModal";
import EditProjectModal from "./EditProjectModal";
import AddStylesModal from "./AddStylesModal";
import EditItemModal from "./EditItemModal";
import AnnotationDrawer from "./AnnotationDrawer";
import Toast, { ToastContainer } from "../../components/Toast";
import type { ToastState } from "../../hooks/useToast";
import type { GroupedStyle } from "../../types/projects";

interface ProjectDetailsModalsProps {
  project: TableType;
  items: ProjectItem[];
  currentUser: InforUser | null;
  isLocked: boolean;
  isEditing: boolean;
  setIsEditing: (val: boolean) => void;
  isAddModalOpen: boolean;
  setIsAddModalOpen: (val: boolean) => void;
  selectedItem: ProjectItem | null;
  setSelectedItem: (item: ProjectItem | null) => void;
  deleteItemTarget: ProjectItem | null;
  setDeleteItemTarget: (item: ProjectItem | null) => void;
  isDeletingItem: boolean;
  annotationItem: ProjectItem | null;
  isAnnotationOpen: boolean;
  toast: ToastState | null;
  setToast: (toast: ToastState | null) => void;
  openAnnotation: (item: ProjectItem) => void;
  closeAnnotation: () => void;
  handleProjectSave: (updated: TableType) => void;
  handleItemSave: () => void;
  handleSaveAnnotation: (itemId: number, annotatedDataUrl: string) => Promise<void>;
  handleDeleteItemConfirm: () => Promise<void>;
  handleAddStyles: (updated: TableType) => Promise<void>;
  deleteStyleTarget: GroupedStyle | null;
  setDeleteStyleTarget: (styleGroup: GroupedStyle | null) => void;
  isDeletingStyle: boolean;
  handleDeleteStyleConfirm: () => Promise<void>;
  plmImagesMap: Record<string, string>;
  loadingPlmImages: Record<string, boolean>;
  plmImagesErrors: Record<string, string>;
  loadStyleImage: (styleMaterialNumber: string, styleId?: number) => Promise<void>;
}

export const ProjectDetailsModals: React.FC<ProjectDetailsModalsProps> = ({
  project,
  items,
  currentUser,
  isLocked,
  isEditing,
  setIsEditing,
  isAddModalOpen,
  setIsAddModalOpen,
  selectedItem,
  setSelectedItem,
  deleteItemTarget,
  setDeleteItemTarget,
  isDeletingItem,
  annotationItem,
  isAnnotationOpen,
  toast,
  setToast,
  openAnnotation,
  closeAnnotation,
  handleProjectSave,
  handleItemSave,
  handleSaveAnnotation,
  handleDeleteItemConfirm,
  handleAddStyles,
  deleteStyleTarget,
  setDeleteStyleTarget,
  isDeletingStyle,
  handleDeleteStyleConfirm,
  plmImagesMap,
  loadingPlmImages,
  plmImagesErrors,
  loadStyleImage,
}) => {
  return (
    <>
      {isEditing && !isLocked && (
        <EditProjectModal
          key={project.id}
          isOpen={isEditing}
          onClose={() => setIsEditing(false)}
          project={project}
          currentUser={currentUser}
          onSave={handleProjectSave}
          onError={(msg) => setToast({ message: msg, type: "error" })}
        />
      )}

      {isAddModalOpen && !isLocked && (
        <AddStylesModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          project={project}
          existingItems={items}
          onAddStyles={handleAddStyles}
          onError={(msg) => setToast({ message: msg, type: "error" })}
        />
      )}

      {selectedItem && (
        <EditItemModal
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          item={{
            ...selectedItem,
            colorway: items
              .filter((it) => it.styleMaterialNumber === selectedItem.styleMaterialNumber)
              .map((it) => it.colorway)
              .filter(Boolean)
              .join(", "),
          }}
          plmImageUrl={plmImagesMap[selectedItem.styleMaterialNumber] || null}
          isLoadingPlmImage={loadingPlmImages[selectedItem.styleMaterialNumber] || false}
          plmImageError={plmImagesErrors[selectedItem.styleMaterialNumber] || null}
          onOpenAnnotation={openAnnotation}
          onSave={handleItemSave}
          onError={(msg) => setToast({ message: msg, type: "error" })}
        />
      )}

      <ConfirmModal
        isOpen={!!deleteItemTarget}
        onCancel={() => setDeleteItemTarget(null)}
        onConfirm={handleDeleteItemConfirm}
        title="Delete Style Item"
        isConfirming={isDeletingItem}
        message={
          <>
            Are you sure you want to delete{" "}
            <strong>{deleteItemTarget?.styleMaterialNumber}</strong>
            {deleteItemTarget?.styleMaterialName ? ` (${deleteItemTarget.styleMaterialName})` : ""}
            ? This action cannot be undone.
          </>
        }
      />

      <ConfirmModal
        isOpen={!!deleteStyleTarget}
        onCancel={() => setDeleteStyleTarget(null)}
        onConfirm={handleDeleteStyleConfirm}
        title="Delete Style"
        isConfirming={isDeletingStyle}
        message={
          <>
            Are you sure you want to delete style{" "}
            <strong>{deleteStyleTarget?.styleMaterialNumber}</strong>
            {deleteStyleTarget?.styleMaterialName ? ` (${deleteStyleTarget.styleMaterialName})` : ""}
            {" "}and all its associated colorways? This action cannot be undone.
          </>
        }
      />

      <AnnotationDrawer
        isOpen={isAnnotationOpen}
        onClose={closeAnnotation}
        item={annotationItem}
        plmImageUrl={annotationItem ? plmImagesMap[annotationItem.styleMaterialNumber] : null}
        isLoadingPlmImage={annotationItem ? loadingPlmImages[annotationItem.styleMaterialNumber] : false}
        plmImageError={annotationItem ? plmImagesErrors[annotationItem.styleMaterialNumber] : null}
        onRetryFetch={() => {
          if (annotationItem) {
            void loadStyleImage(annotationItem.styleMaterialNumber, annotationItem.styleId);
          }
        }}
        onSave={handleSaveAnnotation}
      />

      {toast && (
        <ToastContainer>
          <Toast
            title={
              toast.type === "error"
                ? "Error"
                : toast.type === "success"
                ? "Success"
                : "Notification"
            }
            message={toast.message}
            type={toast.type}
            duration={5000}
            onClose={() => setToast(null)}
          />
        </ToastContainer>
      )}
    </>
  );
};
