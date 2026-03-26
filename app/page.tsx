"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createClient, isSupabaseBrowserEnvConfigured } from "@/app/lib/supabase/client";
import ControlBar from "./components/ControlBar";
import MetricTable from "./components/MetricTable";
import EntityMetricTable from "./components/EntityMetricTable";
import ErrorLogPanel, { ErrorLogItem } from "./components/ErrorLogPanel";
import {
  AiChatAvailableOptions,
  ChatContext,
  Entity,
  FilterAction,
  FilterOption,
  FilterTemplate,
  FilterTemplateConfig,
  MeasurementUnit,
  MeasurementUnitOption,
  Metric,
  PeriodUnit
} from "./types";
import AiChat from "./components/AiChat";

const ALL_LABEL = "전체";
const ALL_VALUE = "all";

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

const buildCommit =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  "";

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

type DrilldownParent = { unit: MeasurementUnit; value: string } | null;
type DrilldownHistoryItem = {
  measurementUnit: MeasurementUnit;
  filterValue: string;
  parent: DrilldownParent;
};
type PendingDrilldown = {
  entityName: string;
  sourceUnit: MeasurementUnit;
  options: MeasurementUnitOption[];
  isLoading: boolean;
} | null;

const drilldownCandidateMap: Record<string, string[]> = {
  all: [
    "area_group",
    "area",
    "area_group_and_time",
    "area_and_time",
    "stadium_group",
    "stadium",
    "stadium_group_and_time",
    "stadium_and_time",
    "time",
    "hour",
    "yoil_and_hour",
    "yoil_group_and_hour"
  ],
  area_group: [
    "area",
    "area_group_and_time",
    "area_and_time",
    "stadium_group",
    "stadium",
    "stadium_group_and_time",
    "stadium_and_time"
  ],
  area: ["area_and_time", "stadium_group", "stadium", "stadium_group_and_time", "stadium_and_time"],
  area_group_and_time: ["area", "area_and_time", "stadium_group", "stadium", "stadium_group_and_time", "stadium_and_time"],
  area_and_time: ["stadium_group", "stadium", "stadium_group_and_time", "stadium_and_time"],
  stadium_group: ["stadium", "stadium_group_and_time", "stadium_and_time"],
  stadium: ["stadium_and_time"],
  stadium_group_and_time: ["stadium", "stadium_and_time"],
  stadium_and_time: [],
  time: ["area_group", "area", "area_group_and_time", "area_and_time", "stadium_group", "stadium", "stadium_group_and_time", "stadium_and_time"],
  hour: ["yoil_and_hour", "yoil_group_and_hour"],
  yoil_group_and_hour: ["yoil_and_hour"],
  yoil_and_hour: []
};

const getDrilldownOptionsForSource = (
  sourceUnit: MeasurementUnit,
  options: MeasurementUnitOption[]
) => {
  const candidateIds = new Set(drilldownCandidateMap[sourceUnit] ?? []);
  return options.filter((option) => candidateIds.has(option.value));
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

/** 엔티티 시계열 AI 컨텍스트 전달 제한 없음 — 전체 전달 */

const computeAggregateFromEntities = (
  entityEntries: [string, Record<string, number[]>][],
  metrics: Metric[],
  weekCount: number
): Record<string, number[]> => {
  const result: Record<string, number[]> = {};
  for (const metric of metrics) {
    const allSeries = entityEntries.map(([, em]) => em[metric.id] ?? []);
    const avg: number[] = [];
    for (let i = 0; i < weekCount; i++) {
      const vals = allSeries.map((s) => s[i]).filter((v) => typeof v === "number" && !Number.isNaN(v));
      avg.push(vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
    }
    result[metric.id] = avg;
  }
  return result;
};

const buildContext = (
  weeks: string[],
  metrics: Metric[],
  primaryMetricId: string | null,
  seriesByEntity: Record<string, Record<string, number[]>>,
  measurementUnit: MeasurementUnit,
  filterValue: string,
  measurementUnitLabelMap: Record<string, string>
) => {
  const unitName =
    measurementUnit === "all" ? ALL_LABEL : measurementUnitLabelMap[measurementUnit] ?? measurementUnit;
  const entityKey = measurementUnit === "all" ? ALL_LABEL : filterValue;
  const directSeries = seriesByEntity[entityKey] ?? seriesByEntity[ALL_LABEL] ?? {};
  const entityEntries = Object.entries(seriesByEntity).filter(([key]) => key !== ALL_LABEL);

  // 집계 키가 없으면 엔티티 평균으로 대체
  const hasDirectData = Object.keys(directSeries).some((k) => (directSeries[k]?.length ?? 0) > 0);
  const series = hasDirectData
    ? directSeries
    : entityEntries.length > 0
      ? computeAggregateFromEntities(entityEntries, metrics, weeks.length)
      : directSeries;

  const latestIndex = weeks.length - 1;

  const metricSummaries = metrics.map((metric) => {
    const values = series[metric.id] ?? [];
    const latest = values[latestIndex] ?? null;
    const delta =
      values.length > 1 ? (values[latestIndex] ?? 0) - (values[latestIndex - 1] ?? 0) : null;
    return { metricId: metric.id, name: metric.name, latest, delta, format: metric.format };
  });

  // 전체(집계) 시계열 데이터
  const rawAggregate = seriesByEntity[ALL_LABEL] ?? {};
  const hasAggregateData = Object.keys(rawAggregate).some((k) => (rawAggregate[k]?.length ?? 0) > 0);
  const aggregateSeries = hasAggregateData ? rawAggregate : series;

  const metricSeries = metrics.map((metric) => ({
    metricId: metric.id,
    name: metric.name,
    values: aggregateSeries[metric.id] ?? [],
    format: metric.format,
  }));

  // 엔티티별 시계열 데이터 (전체 행 제외, 최대 MAX_ENTITY_ROWS개)
  // 첫 번째 지표의 최신값(index 0) 기준 내림차순 정렬 → 상위 엔티티 우선 포함
  const primaryMetricIdForSort = metrics[0]?.id ?? null;
  const sortedEntityEntries = entityEntries.slice().sort((a, b) => {
    if (!primaryMetricIdForSort) return 0;
    const aVal = a[1][primaryMetricIdForSort]?.[weeks.length - 1] ?? 0;
    const bVal = b[1][primaryMetricIdForSort]?.[weeks.length - 1] ?? 0;
    return bVal - aVal;
  });
  const totalEntityCount = sortedEntityEntries.length;
  const entitySeries = sortedEntityEntries
    .map(([entityName, entityMetrics]) => ({
      entityName,
      metrics: metrics.map((metric) => ({
        metricId: metric.id,
        values: entityMetrics[metric.id] ?? [],
      })),
    }));

  return {
    unit: unitName,
    filter: filterValue,
    weeks,
    primaryMetricId: primaryMetricId ?? "",
    metricSummaries,
    metricSeries,
    entitySeries,
    totalEntityCount,
  };
};

export default function Home() {
  const [periodUnit] = useState<PeriodUnit>("week");
  const [periodRangeValues, setPeriodRangeValues] = useState<string[]>(["recent_8"]);
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>("all");
  const [measurementUnitOptions, setMeasurementUnitOptions] = useState<MeasurementUnitOption[]>([
    { value: "all", label: ALL_LABEL }
  ]);
  const [filterValue, setFilterValue] = useState(ALL_VALUE);
  const [filterSelectedValues, setFilterSelectedValues] = useState<string[]>([]);
  const [appliedMeasurementUnit, setAppliedMeasurementUnit] = useState<MeasurementUnit>("all");
  const [appliedFilterValue, setAppliedFilterValue] = useState(ALL_VALUE);

  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>([]);
  const [metricDraftIds, setMetricDraftIds] = useState<string[]>([]);
  const [isMetricPickerOpen, setIsMetricPickerOpen] = useState(false);
  const [copiedMetricId, setCopiedMetricId] = useState<string | null>(null);
  const [metricSearchTerm, setMetricSearchTerm] = useState("");
  const [showDeltaValues, setShowDeltaValues] = useState(true);
  const [drilldownParent, setDrilldownParent] = useState<DrilldownParent>(null);
  const [appliedDrilldownHistory, setAppliedDrilldownHistory] = useState<DrilldownHistoryItem[]>([]);
  const [pendingDrilldown, setPendingDrilldown] = useState<PendingDrilldown>(null);
  const pendingDrilldownRequestRef = useRef(0);
  const drilldownOptionsCacheRef = useRef(new Map<string, MeasurementUnitOption[]>());

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


  const [errorLogs, setErrorLogs] = useState<ErrorLogItem[]>([]);
  const [isErrorLogOpen, setIsErrorLogOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [templates, setTemplates] = useState<FilterTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  const [autoSearchPending, setAutoSearchPending] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);

  useEffect(() => {
    drilldownOptionsCacheRef.current.clear();
  }, [
    appliedMeasurementUnit,
    appliedFilterValue,
    drilldownParent?.unit,
    drilldownParent?.value,
    weeks.join("|")
  ]);

  const effectivePeriodRangeValue = useMemo(() => {
    if (periodRangeValues.length === 0) return "recent_8";
    return periodRangeValues.reduce((max, v) =>
      (periodRangeSizeMap[v] ?? 0) > (periodRangeSizeMap[max] ?? 0) ? v : max
    );
  }, [periodRangeValues]);

  const measurementUnitLabelMap = useMemo(
    () =>
      Object.fromEntries(
        measurementUnitOptions.map((option) => [option.value, option.label])
      ) as Record<string, string>,
    [measurementUnitOptions]
  );

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
    if (!isSupabaseBrowserEnvConfigured()) {
      pushError("Supabase public env missing", "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
      return;
    }
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        const meta = data.user?.user_metadata;
        setUserName(meta?.full_name || meta?.name || data.user?.email || null);
      })
      .catch((error) => {
        pushError("Auth user load failed", (error as Error).message);
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

    const loadMeasurementUnits = async () => {
      try {
        const response = await fetchJsonWithTimeout<{ units: MeasurementUnitOption[] }>("/api/measurement-units", 6000);
        if (canceled) return;
        const options = response.units?.length ? response.units : [{ value: "all", label: ALL_LABEL }];
        setMeasurementUnitOptions(options);
        if (!options.some((option) => option.value === measurementUnit)) {
          setMeasurementUnit("all");
          setFilterValue(ALL_VALUE);
          setDrilldownParent(null);
          setAppliedDrilldownHistory([]);
          setPendingDrilldown(null);
        }
      } catch (error) {
        if (!canceled) {
          pushError("측정단위 정보를 불러오지 못했습니다.", (error as Error).message);
        }
      }
    };

    void loadMeasurementUnits();

    return () => {
      canceled = true;
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
        // 디폴트: 빈값 (사용자가 직접 선택)
        setSelectedMetricIds([]);
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
    // 디폴트: 빈값 유지
    hasInitializedMetrics.current = true;
  }, [metrics]);

  useEffect(() => {
    let canceled = false;

    const loadFilters = async () => {
      if (measurementUnit === "all") {
        setFilterOptions([{ label: ALL_LABEL, value: ALL_VALUE }]);
        setFilterValue(ALL_VALUE);
        setFilterSelectedValues([]);
        return;
      }

      setIsLoadingFilter(true);
      setErrorMessage(null);
      try {
        const size = periodRangeSizeMap[effectivePeriodRangeValue] ?? 8;
        const weeksResponse = await fetchJsonWithTimeout<{ weeks: string[] }>(`/api/weeks?n=${size}`, 6000);
        const params = new URLSearchParams({ measureUnit: measurementUnit });
        (weeksResponse.weeks ?? []).forEach((week) => {
          params.append("week", week);
        });
        if (drilldownParent?.unit && drilldownParent?.value) {
          params.set("parentUnit", drilldownParent.unit);
          params.set("parentValue", drilldownParent.value);
        }
        const response = await fetchJsonWithTimeout<{ options: string[] }>(
          `/api/filter-options?${params.toString()}`,
          15000
        );
        if (canceled) return;

        const options = response.options ?? [];
        setFilterOptions([
          { label: ALL_LABEL, value: ALL_VALUE },
          ...options.map((value) => ({ label: value, value }))
        ]);
        setFilterSelectedValues(options);
      } catch (error) {
        if (!canceled) {
          const message = (error as Error).message;
          setFilterOptions([{ label: ALL_LABEL, value: ALL_VALUE }]);
          setFilterValue(ALL_VALUE);
          pushError("필터 옵션 로딩 실패, 전체 옵션만 유지합니다.", message);
        }
      } finally {
        if (!canceled) setIsLoadingFilter(false);
      }
    };

    loadFilters();

    return () => {
      canceled = true;
    };
  }, [measurementUnit, drilldownParent?.unit, drilldownParent?.value, effectivePeriodRangeValue]);

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

  const runSearch = async (overrides?: {
    measurementUnit?: MeasurementUnit;
    filterValue?: string;
    drilldownParent?: DrilldownParent;
    drilldownHistory?: DrilldownHistoryItem[];
  }) => {
    const targetMeasurementUnit =
      overrides && "measurementUnit" in overrides && overrides.measurementUnit !== undefined
        ? overrides.measurementUnit
        : measurementUnit;
    const targetFilterValue =
      overrides && "filterValue" in overrides && overrides.filterValue !== undefined
        ? overrides.filterValue
        : filterValue;
    const targetDrilldownParent =
      overrides && "drilldownParent" in overrides
        ? (overrides.drilldownParent ?? null)
        : drilldownParent;
    const targetDrilldownHistory =
      overrides && "drilldownHistory" in overrides && overrides.drilldownHistory !== undefined
        ? overrides.drilldownHistory
        : [
            {
              measurementUnit: targetMeasurementUnit,
              filterValue: targetFilterValue,
              parent: targetDrilldownParent
            }
          ];

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

    const size = periodRangeSizeMap[effectivePeriodRangeValue] ?? 8;
    setIsLoadingHeatmap(true);
    setIsFetching(true);
    setErrorMessage(null);

    try {
      const weeksResponse = await fetchJson<{ weeks: string[] }>(`/api/weeks?n=${size}`, {
        signal: controller.signal
      });
      const nextWeeks = weeksResponse.weeks ?? [];
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
          measureUnit: targetMeasurementUnit,
          filterValue: targetFilterValue === ALL_VALUE ? null : targetFilterValue,
          parentUnit: targetDrilldownParent?.unit ?? null,
          parentValue: targetDrilldownParent?.value ?? null,
          weeks: nextWeeks,
          metrics: metricIdsForQuery
        })
      });

      const { entities: nextEntities, seriesByEntity: nextSeries } = buildSeriesMap(
        response.rows ?? [],
        metricIdsForQuery,
        nextWeeks,
        targetMeasurementUnit
      );

      setEntities(nextEntities);
      setSeriesByEntity(nextSeries);
      setAppliedMeasurementUnit(targetMeasurementUnit);
      setAppliedFilterValue(targetFilterValue);
      setAppliedDrilldownHistory(targetDrilldownHistory);
      setShowResults(true);
      setPendingDrilldown(null);

      const context = buildContext(
        nextWeeks,
        selectedMetrics,
        selectedMetrics[0]?.id ?? null,
        nextSeries,
        targetMeasurementUnit,
        targetFilterValue === ALL_VALUE ? ALL_LABEL : targetFilterValue,
        measurementUnitLabelMap
      );

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
      setIsFetching(false);
    }
  };

  // Handle AI filter apply
  const handleAiApplyFilters = useCallback((filters: FilterAction["filters"]) => {
    if (filters.periodRangeValue) setPeriodRangeValues([filters.periodRangeValue]);
    if (filters.measurementUnit) setMeasurementUnit(filters.measurementUnit as MeasurementUnit);
    if (filters.filterValue) {
      const resolved = filters.filterValue === "__ALL__" ? ALL_VALUE : filters.filterValue;
      setFilterValue(resolved);
      setFilterSelectedValues(resolved === ALL_VALUE ? [] : [resolved]);
    }
    if (filters.metricIds?.length) setSelectedMetricIds(filters.metricIds);

    // Trigger auto search on next render cycle
    setAutoSearchPending(true);
  }, []);

  // Auto search when AI applies filters
  useEffect(() => {
    if (!autoSearchPending) return;
    setAutoSearchPending(false);
    handleSearch();
  }, [autoSearchPending]);

  // Build available options for AI chat
  const aiAvailableOptions: AiChatAvailableOptions = useMemo(() => ({
    periodRanges: periodRangeOptions,
    measurementUnits: measurementUnitOptions.map((opt) => ({ label: opt.label, value: opt.value })),
    filterOptions: filterOptions
      .filter((f) => f.value !== ALL_VALUE)
      .map((f) => f.label),
    metricOptions: metrics.map((m) => ({ id: m.id, name: m.name })),
  }), [filterOptions, metrics]);

  const handleSearch = async () => {
    await runSearch({
      measurementUnit,
      filterValue,
      drilldownParent: null,
      drilldownHistory: [
        {
          measurementUnit,
          filterValue,
          parent: null
        }
      ]
    });
  };

  const handleMeasurementChange = (value: MeasurementUnit) => {
    setMeasurementUnit(value);
    setFilterValue(ALL_VALUE);
    setDrilldownParent(null);
    setPendingDrilldown(null);
  };

  const handleFilterChange = (values: string[]) => {
    setFilterSelectedValues(values);
    setDrilldownParent(null);
    setPendingDrilldown(null);
  };

  const handlePeriodRangeChange = (values: string[]) => {
    setPeriodRangeValues(values);
  };

  const handleEntityClick = (entityName: string) => {
    if (pendingDrilldown?.entityName === entityName) {
      setPendingDrilldown(null);
      return;
    }
    const nextUnitOptions = getDrilldownOptionsForSource(appliedMeasurementUnit, measurementUnitOptions);
    if (nextUnitOptions.length === 0) return;
    const cacheKey = [
      appliedMeasurementUnit,
      appliedFilterValue,
      drilldownParent?.unit ?? "root",
      drilldownParent?.value ?? "root",
      entityName,
      ...weeks,
      ...nextUnitOptions.map((option) => option.value)
    ].join("|");
    const cachedOptions = drilldownOptionsCacheRef.current.get(cacheKey);
    if (cachedOptions) {
      setPendingDrilldown({
        entityName,
        sourceUnit: appliedMeasurementUnit,
        options: cachedOptions,
        isLoading: false
      });
      return;
    }
    const requestId = Date.now();
    pendingDrilldownRequestRef.current = requestId;
    setPendingDrilldown({
      entityName,
      sourceUnit: appliedMeasurementUnit,
      options: [],
      isLoading: true
    });

    void (async () => {
      const params = new URLSearchParams({
        sourceUnit: appliedMeasurementUnit,
        sourceValue: entityName
      });
      nextUnitOptions.forEach((option) => params.append("candidate", option.value));
      weeks.forEach((week) => params.append("week", week));

      let availableOptions: MeasurementUnitOption[] = [];
      try {
        const response = await fetchJsonWithTimeout<{ options: MeasurementUnitOption[] }>(
          `/api/drilldown-options?${params.toString()}`,
          10000
        );
        availableOptions = response.options ?? [];
      } catch {
        availableOptions = [];
      }
      if (pendingDrilldownRequestRef.current !== requestId) return;

      drilldownOptionsCacheRef.current.set(cacheKey, availableOptions);
      setPendingDrilldown((prev) =>
        prev && prev.entityName === entityName
          ? {
              ...prev,
              options: availableOptions,
              isLoading: false
            }
          : prev
      );
    })();
  };

  const handleEntityFilterSelect = (nextValue: string) => {
    setFilterValue(nextValue);
    void runSearch({
      measurementUnit,
      filterValue: nextValue,
      drilldownParent: null,
      drilldownHistory: [
        {
          measurementUnit,
          filterValue: nextValue,
          parent: null
        }
      ]
    });
  };

  const handlePendingDrilldownSelect = (targetUnit: MeasurementUnit) => {
    if (!pendingDrilldown) return;
    const parent: DrilldownParent = {
      unit: pendingDrilldown.sourceUnit,
      value: pendingDrilldown.entityName
    };
    const baseHistory =
      appliedDrilldownHistory.length > 0
        ? appliedDrilldownHistory
        : [{ measurementUnit: appliedMeasurementUnit, filterValue: appliedFilterValue, parent: null }];
    const nextHistory = [
      ...baseHistory,
      {
        measurementUnit: targetUnit,
        filterValue: ALL_VALUE,
        parent
      }
    ];
    setMeasurementUnit(targetUnit);
    setFilterValue(ALL_VALUE);
    setDrilldownParent(parent);
    void runSearch({
      measurementUnit: targetUnit,
      filterValue: ALL_VALUE,
      drilldownParent: parent,
      drilldownHistory: nextHistory
    });
  };

  const handleDrilldownNavigate = (targetIndex: number) => {
    const target = appliedDrilldownHistory[targetIndex];
    if (!target) return;
    const nextHistory = appliedDrilldownHistory.slice(0, targetIndex + 1);
    setMeasurementUnit(target.measurementUnit);
    setFilterValue(target.filterValue);
    setDrilldownParent(target.parent);
    setPendingDrilldown(null);
    void runSearch({
      measurementUnit: target.measurementUnit,
      filterValue: target.filterValue,
      drilldownParent: target.parent,
      drilldownHistory: nextHistory
    });
  };

  const drilldownPathItems = useMemo(
    () =>
      appliedDrilldownHistory.map((item, index) => {
        const valueLabel =
          item.parent?.value ??
          (item.filterValue === ALL_VALUE ? ALL_LABEL : item.filterValue);
        return {
          label: `${measurementUnitLabelMap[item.measurementUnit] ?? item.measurementUnit}(${valueLabel})`,
          targetIndex: index,
          isCurrent: index === appliedDrilldownHistory.length - 1
        };
      }),
    [appliedDrilldownHistory, measurementUnitLabelMap]
  );

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
    setPeriodRangeValues(config.periodRangeValue ? [config.periodRangeValue] : ["recent_8"]);
    setMeasurementUnit(config.measurementUnit ?? "all");
    const resolvedFilter = config.filterValue ?? ALL_VALUE;
    setFilterValue(resolvedFilter);
    setFilterSelectedValues(resolvedFilter === ALL_VALUE ? [] : [resolvedFilter]);
    setDrilldownParent(null);
    setAppliedDrilldownHistory([]);
    setPendingDrilldown(null);
    if (config.selectedMetricIds?.length) {
      setSelectedMetricIds(config.selectedMetricIds);
    }
    setActiveTemplateId(template.id);
  };

  const handleApplyTemplate = (template: FilterTemplate) => {
    applyTemplateConfig(template);
    setAutoSearchPending(true);
  };

  const handleSaveTemplate = async (name: string, isShared: boolean, isDefault: boolean) => {
    const config: FilterTemplateConfig = {
      periodRangeValue: effectivePeriodRangeValue,
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

  const displayedEntities = useMemo(() => {
    if (filterSelectedValues.length === 0) return entities;
    const allowed = new Set(filterSelectedValues);
    return entities.filter((e) => allowed.has(e.name) || allowed.has(e.id));
  }, [entities, filterSelectedValues]);

  const isSearchDisabled = isLoadingBase || isLoadingHeatmap;

  const chatContext = useMemo<ChatContext | null>(() => {
    if (!showResults) return null;
    return buildContext(
      weeks,
      selectedMetrics,
      selectedMetrics[0]?.id ?? null,
      seriesByEntity,
      appliedMeasurementUnit,
      appliedFilterValue === ALL_VALUE ? ALL_LABEL : appliedFilterValue,
      measurementUnitLabelMap
    ) as ChatContext;
  }, [showResults, weeks, selectedMetrics, seriesByEntity, appliedMeasurementUnit, appliedFilterValue, measurementUnitLabelMap]);

  return (
    <main className={`app-shell${isChatOpen ? " chat-open" : ""}`}>
      <header className="app-header">
        <div className="brand">
          <div>
            <h1>
              <a className="brand-link" href="/">
                Kevin
              </a>
            </h1>
            <p>지표 중심 분석을 위한 스마트 대시보드</p>
          </div>
        </div>
        <div className="header-meta">
          <span>데이터 소스: Supabase</span>
          {buildCommit && <span>build: {buildCommit.slice(0, 7)}</span>}
          {userName && <span className="user-name">{userName}</span>}
          <button
            className="logout-btn"
            onClick={async () => {
              try {
                if (!isSupabaseBrowserEnvConfigured()) {
                  pushError("Supabase public env missing", "로그아웃 기능을 사용할 수 없습니다.");
                  return;
                }
                const supabase = createClient();
                await supabase.auth.signOut();
                window.location.href = "/login";
              } catch (error) {
                pushError("로그아웃 실패", (error as Error).message);
              }
            }}
          >
            로그아웃
          </button>
        </div>
      </header>

      <section className="top-controls-wrap">
        <ControlBar
          periodUnit={periodUnit}
          periodRangeValues={periodRangeValues}
          periodRangeOptions={periodRangeOptions}
          onPeriodRangeChange={handlePeriodRangeChange}
          measurementUnit={measurementUnit}
          measurementUnitOptions={measurementUnitOptions}
          onMeasurementUnitChange={handleMeasurementChange}
          filterOptions={filterOptions}
          filterValues={filterSelectedValues}
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
            setPeriodRangeValues(["recent_8"]);
            setMeasurementUnit("all");
            setFilterValue(ALL_VALUE);
            setFilterSelectedValues([]);
            setDrilldownParent(null);
            setAppliedDrilldownHistory([]);
            setPendingDrilldown(null);
            setSelectedMetricIds([]);
            setActiveTemplateId(null);
          }}
          onApplyDefault={() => {
            setPeriodRangeValues(["recent_8"]);
            setMeasurementUnit("all");
            setFilterValue(ALL_VALUE);
            setFilterSelectedValues([]);
            setDrilldownParent(null);
            setAppliedDrilldownHistory([]);
            setPendingDrilldown(null);
            setSelectedMetricIds([]);
            setActiveTemplateId(null);
            setAutoSearchPending(true);
          }}
        />
        {isLoadingFilter && <div className="card subtle">필터 로딩 중...</div>}
      </section>

      <section className="main-panel">
        {errorMessage && <div className="card error">Error: {errorMessage}</div>}
        {missingMetricIds.length > 0 && (
          <div className="card warning">선택한 지표 중 일부는 현재 결과에 포함되지 않습니다.</div>
        )}

        {isLoadingHeatmap && (
          <div className="inline-loading">
            <div className="inline-loading-bar" />
            <span className="inline-loading-text">데이터를 불러오는 중...</span>
            <button
              type="button"
              className="btn-ghost inline-loading-cancel"
              onClick={() => {
                if (abortRef.current) abortRef.current.abort();
                setIsFetching(false);
              }}
            >
              실행취소
            </button>
          </div>
        )}

        {isLoadingBase ? (
          <div className="card subtle">지표 정보를 불러오는 중...</div>
        ) : !showResults && !isLoadingHeatmap ? (
          <div className="card subtle empty-state">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true" className="empty-state-icon">
              <rect x="6" y="6" width="36" height="36" rx="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M14 30L20 22L26 26L34 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <circle cx="34" cy="18" r="2" fill="currentColor" />
            </svg>
            <span>옵션을 선택하고 조회를 눌러주세요.</span>
          </div>
        ) : !isLoadingHeatmap && showResults ? (
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
                entities={displayedEntities}
                metrics={selectedMetrics}
                seriesByEntity={seriesByEntity}
                showDelta={showDeltaValues}
                onShowDeltaChange={setShowDeltaValues}
                onEntitySelect={handleEntityClick}
                entityFilterOptions={filterOptions}
                entityFilterValue={filterValue}
                onEntityFilterSelect={handleEntityFilterSelect}
                drilldownPathItems={drilldownPathItems}
                onDrilldownNavigate={handleDrilldownNavigate}
                expandedEntityName={pendingDrilldown?.entityName ?? null}
                drilldownUnitOptions={pendingDrilldown?.options ?? []}
                isDrilldownOptionsLoading={pendingDrilldown?.isLoading ?? false}
                onDrilldownSelect={handlePendingDrilldownSelect}
                onDrilldownClose={() => setPendingDrilldown(null)}
              />
            )}
          </div>
        ) : null}
      </section>

      <AiChat
        onApplyFilters={handleAiApplyFilters}
        dashboardContext={chatContext}
        availableOptions={aiAvailableOptions}
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen((prev) => !prev)}
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


      <ErrorLogPanel
        logs={errorLogs}
        isOpen={isErrorLogOpen}
        onToggle={() => setIsErrorLogOpen((prev) => !prev)}
        onClear={() => setErrorLogs([])}
      />
    </main>
  );
}
