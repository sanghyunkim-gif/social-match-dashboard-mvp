-- Weekly rebuild for analytic MV after Airbyte overwrite/refresh cycles.
-- Aggregation rule:
-- - *_rate metrics -> AVG
-- - other metrics  -> MAX

drop materialized view if exists bigquery.weekly_agg_mv;

create materialized view bigquery.weekly_agg_mv as
with base as (
  select
    s.week,
    coalesce(nullif(trim(s.dimension_type), ''), 'all') as dimension_type,
    s.area_group,
    s.area,
    s.stadium_group,
    s.stadium,
    m.metric_id,
    m.value_num as value
  from bigquery.data_mart_1_social_match s
  join bigquery.weeks_view w
    on w.week = s.week
  cross join lateral (
    select
      kv.key as metric_id,
      case
        when kv.value is null then null
        when jsonb_typeof(kv.value) = 'number' then (kv.value::text)::double precision
        when jsonb_typeof(kv.value) = 'string'
          and trim(both '"' from kv.value::text) ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (trim(both '"' from kv.value::text))::double precision
        else null
      end as value_num
    from jsonb_each(
      to_jsonb(s)
      - '{_airbyte_raw_id,_airbyte_extracted_at,_airbyte_meta,_airbyte_generation_id,day,area,hour,time,week,year,yoil,month,quarter,stadium,area_group,yoil_group,period_type,stadium_group,dimension_type}'::text[]
    ) kv
    join bigquery.metric_store_native ms
      on ms.metric = kv.key
  ) m
  where s.period_type = 'week'
    and s.day is null
    and s.yoil is null
    and s.yoil_group is null
    and s.hour is null
    and s.time is null
    and m.value_num is not null
),
unit_rows as (
  select
    week,
    'all'::text as measure_unit,
    concat(chr(51204), chr(52404))::text as filter_value,
    metric_id,
    value
  from base
  where dimension_type = 'all'

  union all

  select week, 'area_group'::text, area_group, metric_id, value
  from base
  where dimension_type = 'area_group'
    and area_group is not null

  union all

  select week, 'area'::text, area, metric_id, value
  from base
  where dimension_type = 'area'
    and area is not null

  union all

  select week, 'stadium_group'::text, stadium_group, metric_id, value
  from base
  where dimension_type = 'stadium_group'
    and stadium_group is not null

  union all

  select week, 'stadium'::text, stadium, metric_id, value
  from base
  where dimension_type = 'stadium'
    and stadium is not null
)
select
  week,
  measure_unit,
  filter_value,
  metric_id,
  case
    when metric_id like '%\_rate' escape '\' then avg(value)
    else max(value)
  end as value
from unit_rows
group by week, measure_unit, filter_value, metric_id;

create unique index if not exists idx_weekly_agg_mv_uniq
  on bigquery.weekly_agg_mv (week, measure_unit, filter_value, metric_id);

create index if not exists idx_weekly_agg_mv_unit_week_metric
  on bigquery.weekly_agg_mv (measure_unit, week, metric_id);

create index if not exists idx_weekly_agg_mv_unit_filter_week_metric
  on bigquery.weekly_agg_mv (measure_unit, filter_value, week, metric_id);

create index if not exists idx_weekly_agg_mv_unit_metric_filter
  on bigquery.weekly_agg_mv (measure_unit, metric_id, filter_value);
