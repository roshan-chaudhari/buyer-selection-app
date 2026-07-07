import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import styles from './DashboardPage.module.scss';
import NewProjectModal from './NewProjectModal';
import Table, { type Column } from '../../components/Table';
import type { TableType } from '../../types/table';
import Button from '../../components/Button';
import ConfirmModal from '../../components/ConfirmModal';
import { projectService } from '../../services/projectService';
import type { InforUser } from '../../types/api';
import Toast, { ToastContainer } from '../../components/Toast';
import { getStoredToken } from '../../auth/tokenUtils';
import { useToast } from '../../hooks/useToast';
import { toDisplayDate } from '../../utils/date';

interface DashboardPageProps {
  navigate: (path: string) => void;
  currentUser: InforUser | null;
}

export default function DashboardPage({
  navigate,
  currentUser,
}: DashboardPageProps) {
  const [projects, setProjects] = useState<TableType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortColumn, setSortColumn] = useState<string>('LastUpdated');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  const { toast, showToast, clearToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TableType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load projects on mount
  useEffect(() => {
    if (!getStoredToken()) return;

    async function loadDashboardProjects() {
      setIsLoading(true);
      try {
        const data = await projectService.getAllProjects();
        setProjects(data);
      } catch (err) {
        console.error('Failed to load projects from backend:', err);
        showToast(err instanceof Error ? err.message : String(err), 'error');
      } finally {
        setIsLoading(false);
      }
    }

    void loadDashboardProjects();
  }, [showToast]);


  const handleCreateProject = async (project: { name: string; buyerName: string; buyerId?: number; description: string; selectionDate: string; itemsCount?: number }) => {
    setIsLoading(true);
    try {
      const newProject = await projectService.createProject(project, currentUser);
      setProjects((prevProjects) => [newProject, ...prevProjects]);
      showToast('Project created successfully', 'success');
    } catch (err) {
      console.error('Failed to create project on backend:', err);
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget?.id) return;
    setIsDeleting(true);
    try {
      await projectService.deleteProject(deleteTarget.id, currentUser);
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      showToast('Project deleted successfully', 'success');
    } catch (err) {
      console.error('Failed to delete project:', err);
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setDeleteTarget(null);
      setIsDeleting(false);
    }
  };

  const handleSort = (key: string) => {
    const tableKey = key as keyof TableType;
    const isAsc = sortColumn === tableKey && sortDirection === 'asc';
    const direction = isAsc ? 'desc' : 'asc';
    setSortDirection(direction);
    setSortColumn(tableKey);

    const sortedData = [...projects].sort((a, b) => {
      const valA = a[tableKey];
      const valB = b[tableKey];

      if (valA instanceof Date && valB instanceof Date) {
        return direction === 'asc'
          ? valA.getTime() - valB.getTime()
          : valB.getTime() - valA.getTime();
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return direction === 'asc' ? valA - valB : valB - valA;
      }

      return direction === 'asc'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
    setProjects(sortedData);
  };

  const columns: Column<TableType>[] = [
    {
      key: 'ProjectName',
      header: 'Project Name',
      sortable: true,
      render: (row) => <span className={styles.projectNameLink}>{row.ProjectName}</span>,
    },
    {
      key: 'BuyerName',
      header: 'Buyer Name',
      sortable: true,
    },
    {
      key: 'SelectionDate',
      header: 'Selection Date',
      sortable: true,
      render: (row) => toDisplayDate(row.SelectionDate)
    },
    {
      key: 'Description',
      header: 'Project Comment',
      sortable: true,
    },
    {
      key: 'Items',
      header: 'Items',
      sortable: true,
      align: 'center',
    },
    {
      key: 'LastUpdated',
      header: 'Last Updated',
      sortable: true,
      render: (row) => toDisplayDate(row.LastUpdated)
    },
    {
      key: 'Actions',
      header: 'Actions',
      align: 'center',
      width: '80px',
      render: (row) => (
        <Button
          variant="text"
          icon={<Trash2 size={16} />}
          aria-label={`Delete project ${row.ProjectName}`}
          title="Delete project"
          onClick={(e) => {
            e.stopPropagation();
            setDeleteTarget(row);
          }}
        />
      )
    }
  ];

  return (
    <main className={styles.dashboardMain}>
      <div className={styles.projectsHeader}>
        <div className={styles.headerText}>
          <h1 className={styles.projectsTitle}>Your Projects</h1>
          <p className={styles.projectsSubtitle}>
            Manage and track your active product lifecycles.
          </p>
        </div>
        <div className={styles.actionGroup}>
          <Button 
            variant="primary" 
            icon={<Plus size={16} />} 
            onClick={() => setIsModalOpen(true)}
            aria-label="Create new project"
          >
            New Project
          </Button>
        </div>
      </div>

      {/* Table — pass showSearch={true/false} to show or hide the built-in search bar */}
      <Table
        columns={columns}
        data={projects}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
        isLoading={isLoading}
        onRowClick={(row) => navigate(`/project/${encodeURIComponent(row.ProjectName)}`)}
        emptyMessage="No active projects found. Click 'New Project' to get started."
        showSearch={true}
        searchPlaceholder="Search projects by name, buyer…"
      />

      {/* Reusable New Project Popup */}
      <NewProjectModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateProject}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Project"
        isConfirming={isDeleting}
        message={
          <>
            Are you sure you want to delete{' '}
            <strong>{deleteTarget?.ProjectName}</strong>
            ? This action cannot be undone.
          </>
        }
      />

      {toast && (
        <ToastContainer>
          <Toast
            title={toast.type === 'error' ? 'Error' : toast.type === 'success' ? 'Success' : 'Notification'}
            message={toast.message}
            type={toast.type}
            duration={5000}
            onClose={clearToast}
          />
        </ToastContainer>
      )}
    </main>
  );
}
