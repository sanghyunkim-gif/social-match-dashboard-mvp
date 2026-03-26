import { useMemo, useState, useRef, useEffect } from "react";
import {
  FilterOption,
  FilterTemplate,
  MeasurementUnit,
  MeasurementUnitOption,
  Metric,
  PeriodUnit
} from "../types";
import MultiSelectDropdown from "./MultiSelectDropdown";

type ControlBarProps = {
  periodUnit: PeriodUnit;
  periodRangeValues: string[];
  periodRangeOptions: { label: string; value: string }[];
  onPeriodRangeChange: (values: string[]) => void;
  measurementUnit: MeasurementUnit;
  measurementUnitOptions: MeasurementUnitOption[];
  onMeasurementUnitChange: (value: MeasurementUnit) => void;
  filterOptions: FilterOption[];
  filterValues: string[];
  onFilterChange: (values: string[]) => void;
  selectedMetrics: Metric[];
  onRemoveSelectedMetric: (metricId: string) => void;
  onClearSelectedMetrics: () => void;
  onOpenMetricPicker: () => void;
  onSearch: () => void;
  isSearchDisabled?: boolean;
  templates: FilterTemplate[];
  activeTemplateId: string | null;
  onApplyTemplate: (template: FilterTemplate) => void;
  onSaveTemplate: (name: string, isShared: boolean, isDefault: boolean) => void;
  onDeleteTemplate: (id: string) => void;
  onRenameTemplate: (id: string, name: string) => void;
  onSetDefaultTemplate: (id: string) => void;
  onResetFilters: () => void;
  onApplyDefault: () => void;
};

export default function ControlBar({
  periodUnit,
  periodRangeValues,
  periodRangeOptions,
  onPeriodRangeChange,
  measurementUnit,
  measurementUnitOptions,
  onMeasurementUnitChange,
  filterOptions,
  filterValues,
  onFilterChange,
  selectedMetrics,
  onRemoveSelectedMetric,
  onClearSelectedMetrics,
  onOpenMetricPicker,
  onSearch,
  isSearchDisabled,
  templates,
  activeTemplateId,
  onApplyTemplate,
  onSaveTemplate,
  onDeleteTemplate,
  onRenameTemplate,
  onSetDefaultTemplate,
  onResetFilters,
  onApplyDefault
}: ControlBarProps) {
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveIsShared, setSaveIsShared] = useState(false);
  const [saveIsDefault, setSaveIsDefault] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenuId(null);
      }
    };
    if (contextMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [contextMenuId]);

  const handleSave = () => {
    if (!saveName.trim()) return;
    onSaveTemplate(saveName.trim(), saveIsShared, saveIsDefault);
    setSaveName("");
    setSaveIsShared(false);
    setSaveIsDefault(false);
    setIsSaveDialogOpen(false);
  };

  const handleRename = (id: string) => {
    if (!editingName.trim()) return;
    onRenameTemplate(id, editingName.trim());
    setEditingId(null);
    setEditingName("");
  };

  const periodRangeLabel = useMemo(() => {
    if (periodRangeValues.length === 0) return "선택";
    if (periodRangeValues.length === periodRangeOptions.length) return "전체";
    return periodRangeOptions
      .filter((o) => periodRangeValues.includes(o.value))
      .map((o) => o.label)
      .join(", ");
  }, [periodRangeValues, periodRangeOptions]);

  const filterDropdownOptions = useMemo(
    () => filterOptions.filter((o) => o.value !== "all"),
    [filterOptions]
  );

  const filterLabel = useMemo(() => {
    if (filterValues.length === 0) return "선택";
    if (filterValues.length === filterDropdownOptions.length) return "전체";
    return filterDropdownOptions
      .filter((o) => filterValues.includes(o.value))
      .map((o) => o.label)
      .join(", ");
  }, [filterValues, filterDropdownOptions]);

  const currentUserId = templates.find((template) => template.id === activeTemplateId)?.user_id;

  return (
    <div className="control-bar-wrap">
      <div className="template-tabs">
        <button
          type="button"
          className={`template-tab template-tab-default ${activeTemplateId === null ? "is-active" : ""}`}
          onClick={onApplyDefault}
        >
          기본
        </button>
        {templates.map((template) => (
          <div key={template.id} className="template-tab-wrap" style={{ position: "relative" }}>
            {editingId === template.id ? (
              <div className="template-tab-edit">
                <input
                  type="text"
                  className="template-tab-edit-input"
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleRename(template.id);
                    if (event.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                />
                <button type="button" className="template-tab-edit-ok" onClick={() => handleRename(template.id)}>
                  OK
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={`template-tab ${template.id === activeTemplateId ? "is-active" : ""}`}
                onClick={() => onApplyTemplate(template)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextMenuId(template.id);
                }}
                title={`${template.name}${template.is_default ? " (기본)" : ""}${template.is_shared ? " (공유)" : ""} — 우클릭: 관리`}
              >
                <span className="template-tab-name">{template.name}</span>
                {template.is_default && <span className="template-tab-badge">기본</span>}
              </button>
            )}
            {contextMenuId === template.id && (
              <div className="template-tab-context" ref={contextMenuRef}>
                {!template.is_default && (
                  <button
                    type="button"
                    onClick={() => { onSetDefaultTemplate(template.id); setContextMenuId(null); }}
                  >
                    기본 설정
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setEditingId(template.id); setEditingName(template.name); setContextMenuId(null); }}
                >
                  이름 수정
                </button>
                <button
                  type="button"
                  className="template-tab-context-delete"
                  onClick={() => { onDeleteTemplate(template.id); setContextMenuId(null); }}
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          className="template-tab template-tab-add"
          onClick={() => setIsSaveDialogOpen(true)}
          title="현재 필터를 템플릿으로 저장"
        >
          +
        </button>
      </div>
      <div className="search-panel card control-bar-body">
      <div className="search-row search-row-metrics">
        <button type="button" className="btn-secondary search-metric-picker-btn" onClick={onOpenMetricPicker}>
          지표 선택
        </button>
        <div className="selected-metric-chips">
          {selectedMetrics.map((metric) => (
            <button
              key={metric.id}
              type="button"
              className="selected-metric-chip is-active"
              title={`${metric.description || metric.name} (클릭 시 해제)`}
              onClick={() => onRemoveSelectedMetric(metric.id)}
              aria-pressed
            >
              {metric.name}
            </button>
          ))}
        </div>
        <button type="button" className="clear-metrics-btn" onClick={onClearSelectedMetrics}>
          전체 해제
        </button>
      </div>

      <div className="search-row search-row-main">
        <div className="filter-group-period">
          <label className="field search-field search-field-period-unit">
            <span className="field-label">기간단위</span>
            <select value={periodUnit} disabled>
              <option value="week">주</option>
            </select>
          </label>
          <div className="field search-field search-field-period-range">
            <span className="field-label">기간범위</span>
            <MultiSelectDropdown
              options={periodRangeOptions}
              selectedValues={periodRangeValues}
              onChange={onPeriodRangeChange}
              label={periodRangeLabel}
              searchPlaceholder="기간 검색..."
            />
          </div>
        </div>
        <div className="filter-divider" />
        <label className="field search-field search-field-measurement-select">
          <span className="field-label">측정단위</span>
          <select value={measurementUnit} onChange={(event) => onMeasurementUnitChange(event.target.value)}>
            {measurementUnitOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="field search-field search-field-filter">
          <span className="field-label">필터</span>
          <MultiSelectDropdown
            options={filterDropdownOptions}
            selectedValues={filterValues}
            onChange={onFilterChange}
            label={filterLabel}
            searchPlaceholder="필터 검색..."
          />
        </div>
        <button type="button" className="btn-ghost btn-reset" onClick={onResetFilters} title="필터 초기화">
          초기화
        </button>
        <div className="search-action-group">
          <button type="button" className="btn-primary search-submit-btn" onClick={onSearch} disabled={isSearchDisabled}>
            조회
          </button>
        </div>
      </div>

      </div>

      {isSaveDialogOpen && (
        <div className="template-save-overlay" onClick={() => setIsSaveDialogOpen(false)}>
          <div className="template-save-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="template-save-header">
              <span className="card-title">템플릿 저장</span>
              <button
                type="button"
                className="template-save-close"
                onClick={() => setIsSaveDialogOpen(false)}
              >
                닫기
              </button>
            </div>
            <div className="template-save-body">
              <label className="field">
                <input
                  type="text"
                  value={saveName}
                  onChange={(event) => setSaveName(event.target.value)}
                  placeholder="템플릿 이름을 입력해 주세요."
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSave();
                  }}
                  autoFocus
                />
              </label>
              <div className="template-save-options">
                <label className="template-checkbox">
                  <input
                    type="checkbox"
                    checked={saveIsShared}
                    onChange={(event) => setSaveIsShared(event.target.checked)}
                  />
                  <span>전체 공유</span>
                </label>
                <label className="template-checkbox">
                  <input
                    type="checkbox"
                    checked={saveIsDefault}
                    onChange={(event) => setSaveIsDefault(event.target.checked)}
                  />
                  <span>기본 템플릿으로 설정</span>
                </label>
              </div>
            </div>
            <div className="template-save-footer">
              <button type="button" className="btn-ghost" onClick={() => setIsSaveDialogOpen(false)}>
                취소
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSave}
                disabled={!saveName.trim()}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
