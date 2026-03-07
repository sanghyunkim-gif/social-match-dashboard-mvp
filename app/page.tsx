"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createClient } from "@/app/lib/supabase/client";
import ControlBar from "./components/ControlBar";
import MetricTable from "./components/MetricTable";
import EntityMetricTable from "./components/EntityMetricTable";
import ErrorLogPanel, { ErrorLogItem } from "./components/ErrorLogPanel";
import { ChatContext, Entity, FilterOption, FilterTemplate, FilterTemplateConfig, MeasurementUnit, Metric, PeriodUnit, SummaryPayload } from "./types";
import AiChat from "./components/AiChat";

const ALL_LABEL = "전체";
const ALL_VALUE = "all";

const unitLabel: Record<MeasurementUnit, string> = {
  all: ALL_LABEL,
  area_group: "지역 그룹",
  area: "지역",
  stadium_group: "구장 그룹",
  stadium: "구장",
  region_group: "권역 그룹",
  region: "권역",
  court: "면"
};

const metricFormats: Record<string, Metric["format"]> = {};
const preferredDefaultMetricIds = [
  "total_match_cnt",
  "setting_match_cnt",
  "progress_match_cnt",
  "progress_match_rate",
  "match_open_rate",
  "match_loss_rate"
];

const fallbackMetrics: Metric[] = [
  {
    id: "total_match_cnt",
    name: "전체 매치 수",
    description: "공개 혹은 취소 상태의 매치 수. 진행률 계산식의 분모에 해당.",
    format: "number"
  },
  {
    id: "setting_match_cnt",
    name: "세팅 매치 수",
    description: "정기일정 혹은 개별일정 형태로 생성된 매치 수.",
    format: "number"
  },
  {
    id: "progress_match_cnt",
    name: "진행 매치 수",
    description: "매치 시작 시간이 지난 공개 상태의 매치 수.",
    format: "number"
  },
  {
    id: "progress_match_rate",
    name: "진행률",
    description: "전체 매치 수 대비 진행 매치 수의 비율.",
    format: "percent"
  },
  {
    id: "match_open_rate",
    name: "매치 공개율",
    description: "세팅 매치 중 매니저가 배정되거나 플래버 매치로 공개된 매치 비율.",
    format: "percent"
  },
  {
    id: "match_loss_rate",
    name: "매치 로스율",
    description: "세팅 매치 중 매치 공개 후 숨기기 처리된 매치 비율.",
    format: "percent"
  }
];

const periodRangeOptions = [
  { label: "최근 8주", value: "recent_8" },
  { label: "최근 12주", value: "recent_12" },
  { label: "최근 24주", value: "recent_24" }
];

const periodRangeSizeMap: Record<string, number> = {
  recent_8: 8,
  recent_12: 12,
  recent_24: 24
};

type MetricRow = {
  metric: string;
  korean_name: string;
  description: string | null;
  query: string | null;
  category2?: string | null;
  category3?: string | null;
};

type HeatmapRow = {
  entity: string;
  week: string;
  metrics: Record<string, number>;
};


const fetchJson = async <T,>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "Request failed.");
  }
  return (await response.json()) as T;
};

const fetchJsonWithTimeout = async <T,>(
  input: RequestInfo,
  timeoutMs: number,
  init?: RequestInit
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchJson<T>(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const getMetricFormat = (metricId: string) =>
  metricFormats[metricId] ?? (metricId.endsWith("_rate") ? "percent" : "number");

const pickDefaultMetricIds = (metricIds: string[]) => {
  const preferred = preferredDefaultMetricIds.filter((id) => metricIds.includes(id));
  if (preferred.length > 0) return preferred;
  return metricIds.slice(0, Math.min(metricIds.length, 6));
};

const buildContext = (
  weeks: string[],
  metrics: Metric[],
  primaryMetricId: string | null,
  seriesByEntity: Record<string, Record<string, number[]>>,
  measurementUnit: MeasurementUnit,
  filterValue: string
) => {
  const unitName =
    measurementUnit === "all" ? ALL_LABEL : unitLabel[measurementUnit] ?? measurementUnit;
  const entityKey = measurementUnit === "all" ? ALL_LABEL : filterValue;
  const series = seriesByEntity[entityKey] ?? seriesByEntity[ALL_LABEL] ?? {};
  const latestIndex = 0;

  const metricSummaries = metrics.map((metric) => {
    const values = series[metric.id] ?? [];
    const latest = values[latestIndex] ?? null;
    const delta =
      values.length > 1 ? (values[latestIndex] ?? 0) - (values[latestIndex + 1] ?? 0) : null;
    return { metricId: metric.id, name: metric.name, latest, delta, format: metric.format };
  });

  return {
    unit: unitName,
    filter: filterValue,
    weeks,
    primaryMetricId: primaryMetricId ?? "",
    metricSummaries
  };
};

export default function Home() {
  const [periodUnit] = useState<PeriodUnit>("week");
  const [periodRangeValue, setPeriodRangeValue] = useState("recent_8");
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>("all");
  const [filterValue, setFilterValue] = useState(ALL_VALUE);
  const [appliedMeasurementUnit, setAppliedMeasurementUnit] = useState<MeasurementUnit>("all");
  const [appliedFilterValue, setAppliedFilterValue] = useState(ALL_VALUE);

  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>([]);
  const [metricDraftIds, setMetricDraftIds] = useState<string[]>([]);
  const [isMetricPickerOpen, setIsMetricPickerOpen] = useState(false);
  const [copiedMetricId, setCopiedMetricId] = useState<string | null>(null);
  const [metricSearchTerm, setMetricSearchTerm] = useState("");
  const [showDeltaValues, setShowDeltaValues] = useState(true);

  const [weeks, setWeeks] = useState<string[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [seriesByEntity, setSeriesByEntity] = useState<Record<string, Record<string, number[]>>>({});
  const [availableMetricIds, setAvailableMetricIds] = useState<string[]>([]);

  const [filterOptions, setFilterOptions] = useState<FilterOption[]>([{ label: ALL_LABEL, value: ALL_VALUE }]);

  const [showResults, setShowResults] = useState(false);
  const [isLoadingBase, setIsLoadingBase] = useState(true);
  const [isLoadingFilter, setIsLoadingFilter] = useState(false);
  const [isLoadingHeatmap, setIsLoadingHeatmap] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);

  const [errorLogs, setErrorLogs] = useState<ErrorLogItem[]>([]);
  const [isErrorLogOpen, setIsErrorLogOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const controlsRef = useRef<HTMLElement | null>(null);
  const [stickyOffsets, setStickyOffsets] = useState({ header: 0, controls: 0 });

  const [templates, setTemplates] = useState<FilterTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  const pushError = (message: string, detail?: string) => {
    setErrorLogs((prev) => {
      const next: ErrorLogItem[] = [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          message,
          detail,
          time: new Date().toLocaleString("ko-KR")
        },
        ...prev
      ];
      return next.slice(0, 50);
    });
  };

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata;
      setUserName(meta?.full_name || meta?.name || data.user?.email || null);
    });
  }, []);

  useEffect(() => {
    const originalError = console.error;
    const safeStringify = (value: unknown) => {
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };
    console.error = (...args) => {
      originalError(...args);
      const detail = args.map((arg) => safeStringify(arg)).join(" ");
      pushError("Console error", detail);
    };
    return () => {
      console.error = originalError;
    };
  }, []);

  useEffect(() => {
    let canceled = false;

    const loadMetrics = async () => {
      setIsLoadingBase(true);
      setErrorMessage(null);
      try {
        const response = await fetchJsonWithTimeout<{ metrics: MetricRow[] }>("/api/metrics", 6000);
        if (canceled) return;
        const mappedMetrics = (response.metrics ?? []).map((row) => ({
          id: row.metric,
          name: row.korean_name || row.metric,
          description: row.description || "",
          query: row.query || "",
          category2: row.category2 ?? null,
          category3: row.category3 ?? null,
          format: getMetricFormat(row.metric)
        }));
        setMetrics(mappedMetrics);
        const defaultIds = pickDefaultMetricIds(mappedMetrics.map((metric) => metric.id));
        setSelectedMetricIds(defaultIds);
      } catch (error) {
        if (!canceled) {
          const message = (error as Error).message;
          setErrorMessage(message);
          pushError("지표 정보를 불러오지 못했습니다.", message);
          if (metrics.length === 0) {
            setMetrics(fallbackMetrics);
            const defaultIds = fallbackMetrics.map((metric) => metric.id);
            setSelectedMetricIds(defaultIds);
          }
        }
      } finally {
        if (!canceled) setIsLoadingBase(false);
      }
    };

    loadMetrics();

    return () => {
      canceled = true;
    };
  }, []);

  const hasInitializedMetrics = useRef(false);
  useEffect(() => {
    if (!metrics.length || hasInitializedMetrics.current) return;
    if (!selectedMetricIds.length) {
      setSelectedMetricIds(pickDefaultMetricIds(metrics.map((metric) => metric.id)));
    }
    hasInitializedMetrics.current = true;
  }, [metrics]);

  useEffect(() => {
    let canceled = false;

    const loadFilters = async () => {
      if (measurementUnit === "all") {
        setFilterOptions([{ label: ALL_LABEL, value: ALL_VALUE }]);
        setFilterValue(ALL_VALUE);
        return;
      }

      setIsLoadingFilter(true);
      setErrorMessage(null);
      try {
        const response = await fetchJson<{ options: string[] }>(
          `/api/filter-options?measureUnit=${measurementUnit}`
        );
        if (canceled) return;

        const options = response.options ?? [];
        setFilterOptions([
          { label: ALL_LABEL, value: ALL_VALUE },
          ...options.map((value) => ({ label: value, value }))
        ]);
      } catch (error) {
        if (!canceled) {
          const message = (error as Error).message;
          setErrorMessage(message);
          pushError("필터 옵션을 불러오지 못했습니다.", message);
        }
      } finally {
        if (!canceled) setIsLoadingFilter(false);
      }
    };

    loadFilters();

    return () => {
      canceled = true;
    };
  }, [measurementUnit]);

  const selectedMetrics = useMemo(() => {
    const map = new Map(metrics.map((metric) => [metric.id, metric]));
    return selectedMetricIds.map((id) => map.get(id)).filter(Boolean) as Metric[];
  }, [metrics, selectedMetricIds]);

  const missingMetricIds = useMemo(() => {
    if (!availableMetricIds.length) return [] as string[];
    return selectedMetricIds.filter((id) => !availableMetricIds.includes(id));
  }, [availableMetricIds, selectedMetricIds]);

  const buildSeriesMap = (
    rows: HeatmapRow[],
    metricIds: string[],
    weekLabels: string[],
    unit: MeasurementUnit
  ) => {
    const weekIndex = new Map(weekLabels.map((week, index) => [week, index]));
    const nextEntities: Entity[] = [];
    const nextSeries: Record<string, Record<string, number[]>> = {};

    rows.forEach((row) => {
      if (!weekIndex.has(row.week)) return;
      const entityKey = row.entity || ALL_LABEL;

      if (!nextSeries[entityKey]) {
        nextSeries[entityKey] = {};
        metricIds.forEach((metric) => {
          nextSeries[entityKey][metric] = Array(weekLabels.length).fill(0);
        });
        nextEntities.push({ id: entityKey, name: entityKey, unit });
      }

      const series = nextSeries[entityKey];
      metricIds.forEach((metric) => {
        const value = row.metrics[metric];
        series[metric][weekIndex.get(row.week) ?? 0] = typeof value === "number" ? value : Number(value ?? 0);
      });
    });

    return { entities: nextEntities, seriesByEntity: nextSeries };
  };

  const handleSearch = async () => {
    if (!selectedMetricIds.length) {
      setErrorMessage("지표를 최소 1개 선택해주세요.");
      pushError("지표를 최소 1개 선택해주세요.");
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    const size = periodRangeSizeMap[periodRangeValue] ?? 8;
    setIsLoadingHeatmap(true);
    setIsFetching(true);
    setErrorMessage(null);
    setSummary(null);

    try {
      const weeksResponse = await fetchJson<{ weeks: string[] }>(`/api/weeks?n=${size}`, {
        signal: controller.signal
      });
      const nextWeeks = (weeksResponse.weeks ?? []).slice().reverse();
      if (!nextWeeks.length) {
        setErrorMessage("조건에 맞는 주차 데이터가 없습니다.");
        pushError("조건에 맞는 주차 데이터가 없습니다.");
        setIsLoadingHeatmap(false);
        setIsFetching(false);
        return;
      }

      const metricIdsForQuery = selectedMetricIds.slice();

      setWeeks(nextWeeks);
      setAvailableMetricIds(metricIdsForQuery);

      const response = await fetchJson<{ rows: HeatmapRow[] }>("/api/heatmap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          measureUnit: measurementUnit,
          filterValue: filterValue === ALL_VALUE ? null : filterValue,
        weeks: nextWeeks,
          metrics: metricIdsForQuery
        })
      });

      const { entities: nextEntities, seriesByEntity: nextSeries } = buildSeriesMap(
        response.rows ?? [],
        metricIdsForQuery,
        nextWeeks,
        measurementUnit
      );

      setEntities(nextEntities);
      setSeriesByEntity(nextSeries);
      setAppliedMeasurementUnit(measurementUnit);
      setAppliedFilterValue(filterValue);
      setShowResults(true);

      const context = buildContext(
        nextWeeks,
        selectedMetrics,
        selectedMetrics[0]?.id ?? null,
        nextSeries,
        measurementUnit,
        filterValue === ALL_VALUE ? ALL_LABEL : filterValue
      );

      setIsSummaryLoading(true);
      const summaryResponse = await fetchJson<{ summary: SummaryPayload }>("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ context })
      });
      setSummary(summaryResponse.summary);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        pushError("Request canceled");
      } else {
        const message = (error as Error).message;
        setErrorMessage(message);
        pushError("데이터 조회 실패", message);
      }
    } finally {
      setIsLoadingHeatmap(false);
      setIsSummaryLoading(false);
      setIsFetching(false);
    }
  };

  const handleMeasurementChange = (value: MeasurementUnit) => {
    setMeasurementUnit(value);
    setFilterValue(ALL_VALUE);
  };

  const handleFilterChange = (value: string) => {
    setFilterValue(value);
  };

  const handlePeriodRangeChange = (value: string) => {
    setPeriodRangeValue(value);
  };

  const handleRemoveSelectedMetric = (metricId: string) => {
    setSelectedMetricIds((prev) => prev.filter((id) => id !== metricId));
  };

  const handleClearSelectedMetrics = () => {
    setSelectedMetricIds([]);
  };

  const openMetricPicker = () => {
    setMetricDraftIds(selectedMetricIds.slice());
    setMetricSearchTerm("");
    setIsMetricPickerOpen(true);
  };

  const toggleMetricDraft = (metricId: string) => {
    setMetricDraftIds((prev) =>
      prev.includes(metricId) ? prev.filter((id) => id !== metricId) : [...prev, metricId]
    );
  };

  const resetMetricDraft = () => {
    setMetricDraftIds([]);
  };

  const applyMetricDraft = () => {
    if (metricDraftIds.length === 0) return;
    setSelectedMetricIds(metricDraftIds.slice());
    setIsMetricPickerOpen(false);
  };

  const copyMetricQuery = async (metric: Metric) => {
    const text = (metric.query || "").trim();
    if (!text) {
      pushError("복사할 쿼리가 없습니다.", metric.name);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMetricId(metric.id);
      setTimeout(() => {
        setCopiedMetricId((prev) => (prev === metric.id ? null : prev));
      }, 1500);
    } catch (error) {
      pushError("쿼리 복사 실패", (error as Error).message);
    }
  };

  const filteredMetrics = useMemo(() => {
    const keyword = metricSearchTerm.trim().toLowerCase();
    if (!keyword) return metrics;
    return metrics.filter((metric) => {
      const haystack = [
        metric.id,
        metric.name,
        metric.description,
        metric.category2 ?? "",
        metric.category3 ?? ""
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [metrics, metricSearchTerm]);

  const groupedMetrics = useMemo(() => {
    const outer = new Map<string, Map<string, Metric[]>>();
    for (const metric of filteredMetrics) {
      const category2 = (metric.category2 || "기타").trim() || "기타";
      const category3 = (metric.category3 || "기타").trim() || "기타";
      if (!outer.has(category2)) outer.set(category2, new Map());
      const byCategory3 = outer.get(category2)!;
      if (!byCategory3.has(category3)) byCategory3.set(category3, []);
      byCategory3.get(category3)!.push(metric);
    }

    return Array.from(outer.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category2, byCategory3]) => ({
        category2,
        groups: Array.from(byCategory3.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category3, items]) => ({
            category3,
            items: items.slice().sort((a, b) => a.name.localeCompare(b.name))
          }))
      }));
  }, [filteredMetrics]);

  // --- 템플릿 CRUD ---
  const loadTemplates = async () => {
    try {
      const response = await fetchJson<{ templates: FilterTemplate[] }>("/api/filter-templates");
      setTemplates(response.templates ?? []);
      return response.templates ?? [];
    } catch {
      // 미인증 상태에서는 조용히 실패
      return [];
    }
  };

  useEffect(() => {
    let canceled = false;

    const init = async () => {
      const loaded = await loadTemplates();
      if (canceled) return;
      const defaultTemplate = loaded.find((t) => t.is_default);
      if (defaultTemplate) {
        applyTemplateConfig(defaultTemplate);
      }
    };

    init();
    return () => { canceled = true; };
  }, []);

  const applyTemplateConfig = (template: FilterTemplate) => {
    const config = template.config as FilterTemplateConfig;
    setPeriodRangeValue(config.periodRangeValue ?? "recent_8");
    setMeasurementUnit(config.measurementUnit ?? "all");
    setFilterValue(config.filterValue ?? ALL_VALUE);
    if (config.selectedMetricIds?.length) {
      setSelectedMetricIds(config.selectedMetricIds);
    }
    setActiveTemplateId(template.id);
  };

  const handleApplyTemplate = (template: FilterTemplate) => {
    applyTemplateConfig(template);
  };

  const handleSaveTemplate = async (name: string, isShared: boolean, isDefault: boolean) => {
    const config: FilterTemplateConfig = {
      periodRangeValue,
      measurementUnit,
      filterValue,
      selectedMetricIds
    };
    try {
      const response = await fetchJson<{ template: FilterTemplate }>("/api/filter-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, config, is_shared: isShared, is_default: isDefault })
      });
      setActiveTemplateId(response.template.id);
      await loadTemplates();
    } catch (error) {
      pushError("템플릿 저장 실패", (error as Error).message);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await fetchJson(`/api/filter-templates/${id}`, { method: "DELETE" });
      if (activeTemplateId === id) setActiveTemplateId(null);
      await loadTemplates();
    } catch (error) {
      pushError("템플릿 삭제 실패", (error as Error).message);
    }
  };

  const handleRenameTemplate = async (id: string, name: string) => {
    try {
      await fetchJson(`/api/filter-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      await loadTemplates();
    } catch (error) {
      pushError("템플릿 이름 수정 실패", (error as Error).message);
    }
  };

  const handleSetDefaultTemplate = async (id: string) => {
    try {
      await fetchJson(`/api/filter-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true })
      });
      await loadTemplates();
    } catch (error) {
      pushError("기본 템플릿 설정 실패", (error as Error).message);
    }
  };

  const isSearchDisabled = isLoadingBase || isLoadingHeatmap;

  const chatContext = useMemo<ChatContext | null>(() => {
    if (!showResults) return null;
    return buildContext(
      weeks,
      selectedMetrics,
      selectedMetrics[0]?.id ?? null,
      seriesByEntity,
      appliedMeasurementUnit,
      appliedFilterValue === ALL_VALUE ? ALL_LABEL : appliedFilterValue
    ) as ChatContext;
  }, [showResults, weeks, selectedMetrics, seriesByEntity, appliedMeasurementUnit, appliedFilterValue]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const headerEl = headerRef.current;
    const controlsEl = controlsRef.current;
    if (!headerEl || !controlsEl) return;

    const updateOffsets = () => {
      setStickyOffsets({
        header: Math.ceil(headerEl.getBoundingClientRect().height),
        controls: Math.ceil(controlsEl.getBoundingClientRect().height)
      });
    };

    updateOffsets();
    const observer = new ResizeObserver(updateOffsets);
    observer.observe(headerEl);
    observer.observe(controlsEl);
    window.addEventListener("resize", updateOffsets);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateOffsets);
    };
  }, [selectedMetrics.length, measurementUnit, filterOptions.length]);

  return (
    <main
      className="app-shell"
      style={
        {
          "--sticky-header-height": `${stickyOffsets.header}px`,
          "--sticky-controls-height": `${stickyOffsets.controls}px`,
          "--table-sticky-top": `${Math.min(stickyOffsets.header + stickyOffsets.controls, 320)}px`
        } as CSSProperties
      }
    >
      <header className="app-header app-header-sticky" ref={headerRef}>
        <div className="brand">
          <div>
            <h1>
              <a className="brand-link" href="/">
                KEVIN
              </a>
            </h1>
            <p>지표 중심 분석을 위한 스마트 대시보드</p>
          </div>
        </div>
        <div className="header-meta">
          <span>데이터 소스: Supabase</span>
          {userName && <span className="user-name">{userName}</span>}
          <button
            className="logout-btn"
            onClick={async () => {
              const supabase = createClient();
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
          >
            로그아웃
          </button>
        </div>
      </header>

      <section className="top-controls-wrap top-controls-sticky" ref={controlsRef}>
        <ControlBar
          periodUnit={periodUnit}
          periodRangeValue={periodRangeValue}
          periodRangeOptions={periodRangeOptions}
          onPeriodRangeChange={handlePeriodRangeChange}
          measurementUnit={measurementUnit}
          onMeasurementUnitChange={handleMeasurementChange}
          filterOptions={filterOptions}
          filterValue={filterValue}
          onFilterChange={handleFilterChange}
          selectedMetrics={selectedMetrics}
          onRemoveSelectedMetric={handleRemoveSelectedMetric}
          onClearSelectedMetrics={handleClearSelectedMetrics}
          onOpenMetricPicker={openMetricPicker}
          onSearch={handleSearch}
          isSearchDisabled={isSearchDisabled}
          templates={templates}
          activeTemplateId={activeTemplateId}
          onApplyTemplate={handleApplyTemplate}
          onSaveTemplate={handleSaveTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onRenameTemplate={handleRenameTemplate}
          onSetDefaultTemplate={handleSetDefaultTemplate}
          onResetFilters={() => {
            setPeriodRangeValue("recent_8");
            setMeasurementUnit("all");
            setFilterValue(ALL_VALUE);
            setSelectedMetricIds(preferredDefaultMetricIds.filter((id) => metrics.some((m) => m.id === id)));
            setActiveTemplateId(null);
          }}
        />
        {isLoadingFilter && <div className="card subtle">필터 로딩 중...</div>}
      </section>

      <section className="main-panel">
        {errorMessage && <div className="card error">Error: {errorMessage}</div>}
        {missingMetricIds.length > 0 && (
          <div className="card warning">선택한 지표 중 일부는 현재 결과에 포함되지 않습니다.</div>
        )}
        {isLoadingBase ? (
          <div className="card subtle">지표 정보를 불러오는 중...</div>
        ) : !showResults ? (
          <div className="card subtle">옵션을 선택하고 조회를 눌러주세요.</div>
        ) : (
          <div className="result-stack">
            {appliedMeasurementUnit === "all" ? (
              <MetricTable
                title="전체 지표 추이"
                weeks={weeks}
                metrics={selectedMetrics}
                series={seriesByEntity[ALL_LABEL] ?? {}}
                showDelta={showDeltaValues}
                onShowDeltaChange={setShowDeltaValues}
              />
            ) : (
              <EntityMetricTable
                weeks={weeks}
                entities={entities}
                metrics={selectedMetrics}
                seriesByEntity={seriesByEntity}
                showDelta={showDeltaValues}
                onShowDeltaChange={setShowDeltaValues}
              />
            )}
          </div>
        )}
      </section>

      <AiChat
        visible={showResults}
        summary={summary}
        isSummaryLoading={isSummaryLoading}
        context={chatContext}
      />

      {isMetricPickerOpen && (
        <div className="metric-picker-overlay" onClick={() => setIsMetricPickerOpen(false)}>
          <aside className="metric-picker-panel" onClick={(event) => event.stopPropagation()}>
            <div className="metric-picker-header">
              <div className="card-title">지표 선택</div>
              <button
                type="button"
                className="metric-picker-close"
                onClick={() => setIsMetricPickerOpen(false)}
              >
                닫기
              </button>
            </div>
            <div className="metric-picker-search">
              <input
                type="search"
                value={metricSearchTerm}
                onChange={(event) => setMetricSearchTerm(event.target.value)}
                placeholder="지표명/ID/설명 검색"
              />
            </div>
            <div className="metric-picker-body">
              {groupedMetrics.length === 0 ? (
                <div className="metric-picker-empty">검색 결과가 없습니다.</div>
              ) : (
                groupedMetrics.map((category2Group) => (
                  <section key={category2Group.category2} className="metric-category2-group">
                    <h4 className="metric-category2-title">{category2Group.category2}</h4>
                    {category2Group.groups.map((category3Group) => (
                      <div key={`${category2Group.category2}-${category3Group.category3}`} className="metric-category3-group">
                        <h5 className="metric-category3-title">{category3Group.category3}</h5>
                        {category3Group.items.map((metric) => {
                          const isSelected = metricDraftIds.includes(metric.id);
                          return (
                            <div
                              key={metric.id}
                              role="button"
                              tabIndex={0}
                              className={`metric-pick-item ${isSelected ? "is-selected" : ""}`}
                              onClick={() => toggleMetricDraft(metric.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") toggleMetricDraft(metric.id);
                              }}
                              aria-pressed={isSelected}
                            >
                              <div className="metric-pick-title">{metric.name}</div>
                              <button
                                type="button"
                                className="metric-copy-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void copyMetricQuery(metric);
                                }}
                              >
                                {copiedMetricId === metric.id ? "복사됨" : "쿼리 복사"}
                              </button>
                              <div className="metric-pick-id">{metric.id}</div>
                              <div className="metric-pick-desc">{metric.description || "설명 없음"}</div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </section>
                ))
              )}
            </div>
            <div className="metric-picker-footer">
              <button type="button" className="btn-ghost" onClick={resetMetricDraft}>
                선택 초기화
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={applyMetricDraft}
                disabled={metricDraftIds.length === 0}
              >
                선택완료
              </button>
            </div>
          </aside>
        </div>
      )}

      {isFetching && (
        <div className="fetch-overlay">
          <div className="fetch-overlay-card">
            <div className="spinner" />
            <div className="fetch-overlay-text">데이터를 불러오는 중입니다...</div>
            <button
              type="button"
              onClick={() => {
                if (abortRef.current) abortRef.current.abort();
                setIsFetching(false);
              }}
            >
              실행취소
            </button>
          </div>
        </div>
      )}

      <ErrorLogPanel
        logs={errorLogs}
        isOpen={isErrorLogOpen}
        onToggle={() => setIsErrorLogOpen((prev) => !prev)}
        onClear={() => setErrorLogs([])}
      />
    </main>
  );
}
