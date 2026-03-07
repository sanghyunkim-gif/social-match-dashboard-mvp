export type PeriodUnit = "week";

export type MeasurementUnit =
  | "all"
  | "area_group"
  | "area"
  | "stadium_group"
  | "stadium"
  | "region_group"
  | "region"
  | "court";

export type Metric = {
  id: string;
  name: string;
  description: string;
  query?: string;
  category2?: string | null;
  category3?: string | null;
  format: "number" | "percent";
};

export type Entity = {
  id: string;
  name: string;
  unit: MeasurementUnit;
  regionGroupId?: string;
  regionId?: string;
  stadiumId?: string;
};

export type EntitySeries = {
  entity: Entity;
  metrics: Record<string, number[]>;
};

export type FilterOption = {
  label: string;
  value: string;
};

export type FilterTemplateConfig = {
  periodRangeValue: string;
  measurementUnit: MeasurementUnit;
  filterValue: string;
  selectedMetricIds: string[];
};

export type FilterTemplate = {
  id: string;
  user_id: string;
  name: string;
  config: FilterTemplateConfig;
  is_default: boolean;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
};

export type MetricSummaryItem = {
  metricId: string;
  name: string;
  latest: number | null;
  delta: number | null;
  format: "number" | "percent";
};

export type ChatContext = {
  unit: string;
  filter: string;
  weeks: string[];
  primaryMetricId: string;
  metricSummaries: MetricSummaryItem[];
};

export type SummaryPayload = {
  title: string;
  bullets: string[];
  caution?: string;
};
