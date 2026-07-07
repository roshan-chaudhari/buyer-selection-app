import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import type { Column } from "../../components/Table";
import type { ColorwayOption } from "../../types/api";
import type { ProjectItem } from "../../services/projectService";
import Button from "../../components/Button";
import Dropdown from "../../components/Dropdown";
import type { GroupedStyle } from "../../types/projects";
import { DEFAULT_GARMENT_SVG } from "./constants";
import styles from "./ProjectDetailsPage.module.scss";

interface UseProjectColumnsProps {
  plmColorwaysMap: Record<string, ColorwayOption[]>;
  plmImagesMap: Record<string, string>;
  onAnnotationOpen: (item: ProjectItem) => void;
  onColorwayChange: (
    row: GroupedStyle,
    selectedValues: string[],
    allColorways: ColorwayOption[],
    newValue: string,
  ) => Promise<void>;
  onDeleteStyle: (styleGroup: GroupedStyle) => void;
  onConditionChange: (row: GroupedStyle, newCondition: string) => Promise<void>;
}

function buildColorwayOptions(
  apiColorways: ColorwayOption[],
  items: ProjectItem[],
): { allColorways: ColorwayOption[]; selectedValues: string[] } {
  const mergedMap = new Map<string, ColorwayOption>();

  apiColorways.forEach((opt) => {
    mergedMap.set(opt.value.toLowerCase(), opt);
  });

  items
    .map((it) => it.colorway)
    .filter(Boolean)
    .forEach((cw) => {
      const key = cw.toLowerCase();
      if (!mergedMap.has(key)) {
        mergedMap.set(key, { value: cw, label: cw, colorwayId: 0 });
      }
    });

  return {
    allColorways: Array.from(mergedMap.values()),
    selectedValues: items.map((it) => it.colorway).filter(Boolean),
  };
}

export function useProjectColumns({
  plmColorwaysMap,
  plmImagesMap,
  onAnnotationOpen,
  onColorwayChange,
  onDeleteStyle,
  onConditionChange,
}: UseProjectColumnsProps) {
  return useMemo<Column<GroupedStyle>[]>(() => [
    {
      key: "thumbnail",
      header: "Image",
      width: "60px",
      render: (row) => {
        const targetImage = row.annotatedImage || plmImagesMap[row.styleMaterialNumber] || DEFAULT_GARMENT_SVG;
        const hasRealImage = !!(row.annotatedImage || plmImagesMap[row.styleMaterialNumber]);
        return (
          <div
            className={styles.thumbnailCell}
            onClick={(e) => {
              e.stopPropagation();
              if (row.items.length > 0) onAnnotationOpen(row.items[0]);
            }}
            title="Click to view and annotate style"
          >
            <img
              src={targetImage}
              alt={hasRealImage ? row.styleMaterialNumber : "Garment Sketch"}
              className={styles.thumbnailImg}
              style={hasRealImage ? undefined : { opacity: 0.7 }}
            />
          </div>
        );
      },
    },
    {
      key: "styleMaterialNumber",
      header: "Style / Material #",
      sortable: true,
      width: "140px",
      render: (row) => (
        <span className={styles.styleMaterialNumber}>{row.styleMaterialNumber || "-"}</span>
      ),
    },
    {
      key: "styleMaterialName",
      header: "Style / Material Name",
      sortable: true,
      width: "250px",
      render: (row) => (
        <span className={styles.truncateText} title={row.styleMaterialName ?? ""}>
          {row.styleMaterialName || "-"}
          </span>
      ),
    },
    {
      key: "colorwayCount",
      header: "Colorways",
      width: "200px",
      render: (row) => {
        const apiColorways = plmColorwaysMap[row.styleMaterialNumber] || [];
        const { allColorways, selectedValues } = buildColorwayOptions(apiColorways, row.items);

        return (
          <div
            onClick={(e) => e.stopPropagation()}
            className={styles.colorwayRowWrapper}
          >
            <span className={styles.colorwayCountBadge}>
              {selectedValues.length} {selectedValues.length === 1 ? "Colorway" : "Colorways"}
            </span>
            {allColorways.length > 0 && (
              <Dropdown
                className={styles.colorwayAddDropdown}
                value={selectedValues.join(",")}
                searchable={false}
                multiselect={true}
                showApplyButton={true}
                placeholder="+ Add Colorway"
                onChange={(e) =>
                  void onColorwayChange(row, selectedValues, allColorways, e.target.value)
                }
              >
                {allColorways.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Dropdown>
            )}
          </div>
        );
      },
    },
    {
      key: "selectionCondition",
      header: "Condition",
      sortable: true,
      width: "160px",
      render: (row) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Dropdown
            className={styles.inlineSelectDropdown}
            value={row.selectionCondition || "As-Is"}
            searchable={false}
            fullWidth={true}
            onChange={(e) => void onConditionChange(row, e.target.value)}
          >
            <option value="As-Is">As-Is</option>
            <option value="Small Change">Small Change</option>
            <option value="Big-Change">Big-Change</option>
          </Dropdown>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "center",
      width: "120px",
      render: (row) => (
        <div className={styles.actionCell}>
          <Button
            variant="text"
            icon={<Trash2 size={16} />}
            aria-label="Delete style"
            title="Delete Style"
            onClick={(e) => {
              e.stopPropagation();
              void onDeleteStyle(row);
            }}
          />
        </div>
      ),
    },
  ], [plmColorwaysMap, plmImagesMap, onAnnotationOpen, onColorwayChange, onDeleteStyle, onConditionChange]);
}
