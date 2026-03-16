import { useState, useRef, useEffect } from "react";
import {
  FilterOption,
  FilterTemplate,
  MeasurementUnit,
  MeasurementUnitOption,
  Metric,
  PeriodUnit
} from "../types";

type ControlBarProps = {
  periodUnit: PeriodUnit;
  periodRangeValue: string;
  periodRangeOptions: { label: string; value: string }[];
  onPeriodRangeChange: (value: string) => void;
  measurementUnit: MeasurementUnit;
  measurementUnitOptions: MeasurementUnitOption[];
  onMeasurementUnitChange: (value: MeasurementUnit) => void;
  filterOptions: FilterOption[];
  filterValue: string;
  onFilterChange: (value: string) => void;
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
};

export default function ControlBar({
  periodUnit,
  periodRangeValue,
  periodRangeOptions,
  onPeriodRangeChange,
  measurementUnit,
  measurementUnitOptions,
  onMeasurementUnitChange,
  filterOptions,
  filterValue,
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
  onResetFilters
}: ControlBarProps) {
  const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveIsShared, setSaveIsShared] = useState(false);
  const [saveIsDefault, setSaveIsDefault] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsTemplateDropdownOpen(false);
      }
    };
    if (isTemplateDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isTemplateDropdownOpen]);

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

  const currentUserId = templates.find((template) => template.id === activeTemplateId)?.user_id;

  return (
    <div className="search-panel card">
      <div className="search-row search-row-template surface-sunken">
        <div className="template-section" ref={dropdownRef}>
          <span className="field-label">템플릿</span>
          <div className="template-controls">
            <button
              type="button"
              className={`btn-template-select ${isTemplateDropdownOpen ? "is-open" : ""}`}
              onClick={() => setIsTemplateDropdownOpen((prev) => !prev)}
            >
              {activeTemplateId
                ? templates.find((template) => template.id === activeTemplateId)?.name ?? "선택"
                : "선택"}
              <span className="template-caret" />
            </button>
            <button
              type="button"
              className="btn-template-save"
              onClick={() => setIsSaveDialogOpen(true)}
              title="현재 필터를 템플릿으로 저장"
            >
              저장
            </button>
          </div>

          {isTemplateDropdownOpen && (
            <div className="template-dropdown">
              {templates.length === 0 ? (
                <div className="template-dropdown-empty">저장된 템플릿이 없습니다.</div>
              ) : (
                templates.map((template) => (
                  <div
                    key={template.id}
                    className={`template-dropdown-item ${template.id === activeTemplateId ? "is-active" : ""}`}
                  >
                    {editingId === template.id ? (
                      <div className="template-edit-row">
                        <input
                          type="text"
                          className="template-edit-input"
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") handleRename(template.id);
                            if (event.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="template-action-btn"
                          onClick={() => handleRename(template.id)}
                        >
                          확인
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="template-dropdown-name"
                          onClick={() => {
                            onApplyTemplate(template);
                            setIsTemplateDropdownOpen(false);
                          }}
                        >
                          <span className="template-name-text">{template.name}</span>
                          <span className="template-badges">
                            {template.is_default && <span className="template-badge template-badge-default">기본</span>}
                            {template.is_shared && <span className="template-badge template-badge-shared">공유</span>}
                          </span>
                        </button>
                        <div className="template-item-actions">
                          {(!currentUserId || template.user_id === currentUserId) && (
                            <>
                              {!template.is_default && (
                                <button
                                  type="button"
                                  className="template-action-btn"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onSetDefaultTemplate(template.id);
                                  }}
                                  title="기본 템플릿으로 설정"
                                >
                                  기본
                                </button>
                              )}
                              <button
                                type="button"
                                className="template-action-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setEditingId(template.id);
                                  setEditingName(template.name);
                                }}
                                title="이름 수정"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                className="template-action-btn template-action-delete"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onDeleteTemplate(template.id);
                                }}
                                title="삭제"
                              >
                                삭제
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="search-row search-row-main">
        <label className="field search-field search-field-period-unit">
          <span className="field-label">기간단위</span>
          <select value={periodUnit} disabled>
            <option value="week">주</option>
          </select>
        </label>
        <label className="field search-field search-field-period-range">
          <span className="field-label">기간범위</span>
          <select value={periodRangeValue} onChange={(event) => onPeriodRangeChange(event.target.value)}>
            {periodRangeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
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
        <label className="field search-field search-field-filter">
          <span className="field-label">필터</span>
          <select value={filterValue} onChange={(event) => onFilterChange(event.target.value)}>
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-ghost btn-reset" onClick={onResetFilters} title="필터 초기화">
          초기화
        </button>
        <div className="search-action-group">
          <button type="button" className="btn-primary search-submit-btn" onClick={onSearch} disabled={isSearchDisabled}>
            조회 및 AI 분석
          </button>
        </div>
      </div>

      <div className="search-row search-row-metrics">
        <button type="button" className="btn-secondary search-metric-picker-btn" onClick={onOpenMetricPicker}>
          지표 선택
        </button>
        <span className="field-label">활성 지표</span>
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
                <span className="field-label">템플릿 이름</span>
                <input
                  type="text"
                  value={saveName}
                  onChange={(event) => setSaveName(event.target.value)}
                  placeholder="예: 경기 주간 분석"
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
