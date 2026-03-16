-- Add partial indexes to support expanded dimension_type queries directly on the source table.
-- This is a fallback strategy when the expanded weekly_agg_mv is too expensive to rebuild.

set statement_timeout = 0;

create index if not exists idx_social_match_week_dimension_type
  on bigquery.data_mart_1_social_match (dimension_type, week)
  where period_type = 'week'
    and day is null
    and dimension_type is not null;

create index if not exists idx_social_match_week_area_group_time
  on bigquery.data_mart_1_social_match (week, area_group, time)
  where period_type = 'week'
    and day is null
    and dimension_type = 'area_group_and_time'
    and area_group is not null
    and time is not null;

create index if not exists idx_social_match_week_area_time
  on bigquery.data_mart_1_social_match (week, area, time)
  where period_type = 'week'
    and day is null
    and dimension_type = 'area_and_time'
    and area is not null
    and time is not null;

create index if not exists idx_social_match_week_stadium_group_time
  on bigquery.data_mart_1_social_match (week, stadium_group, time)
  where period_type = 'week'
    and day is null
    and dimension_type = 'stadium_group_and_time'
    and stadium_group is not null
    and time is not null;

create index if not exists idx_social_match_week_stadium_time
  on bigquery.data_mart_1_social_match (week, stadium, time)
  where period_type = 'week'
    and day is null
    and dimension_type = 'stadium_and_time'
    and stadium is not null
    and time is not null;

create index if not exists idx_social_match_week_time
  on bigquery.data_mart_1_social_match (week, time)
  where period_type = 'week'
    and day is null
    and dimension_type = 'time'
    and time is not null;

create index if not exists idx_social_match_week_hour
  on bigquery.data_mart_1_social_match (week, hour)
  where period_type = 'week'
    and day is null
    and dimension_type = 'hour'
    and hour is not null;

create index if not exists idx_social_match_week_yoil_hour
  on bigquery.data_mart_1_social_match (week, yoil, hour)
  where period_type = 'week'
    and day is null
    and dimension_type = 'yoil_and_hour'
    and yoil is not null
    and hour is not null;

create index if not exists idx_social_match_week_yoil_group_hour
  on bigquery.data_mart_1_social_match (week, yoil_group, hour)
  where period_type = 'week'
    and day is null
    and dimension_type = 'yoil_group_and_hour'
    and yoil_group is not null
    and hour is not null;

reset statement_timeout;
