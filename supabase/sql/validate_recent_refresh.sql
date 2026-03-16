\echo Running DB healthcheck for recent weeks in bigquery.weekly_agg_mv

drop table if exists pg_temp.mv_healthcheck_summary;

create temp table pg_temp.mv_healthcheck_summary as
with recent_weeks as (
  select week
  from bigquery.weeks_view
  order by week_start_date desc
  limit :check_weeks
),
units as (
  select *
  from (
    values
      ('all'),
      ('area_group'),
      ('area'),
      ('stadium_group'),
      ('stadium')
  ) as t(measure_unit)
)
select
  rw.week,
  u.measure_unit,
  (
    select count(*)
    from bigquery.weekly_agg_mv mv
    where mv.week = rw.week
      and mv.measure_unit = u.measure_unit
  ) as row_count,
  :'metric_id' as metric_id,
  (
    select count(*)
    from bigquery.weekly_agg_mv mv
    where mv.week = rw.week
      and mv.measure_unit = u.measure_unit
      and mv.metric_id = :'metric_id'
  ) as metric_count
from recent_weeks rw
cross join units u;

table pg_temp.mv_healthcheck_summary;

do $$
declare
  rec record;
begin
  for rec in
    select *
    from pg_temp.mv_healthcheck_summary
  loop
    if rec.row_count <= 0 then
      raise exception 'MV healthcheck failed: no rows for week=%, unit=%', rec.week, rec.measure_unit;
    end if;

    if rec.metric_count <= 0 then
      raise exception 'MV healthcheck failed: missing metric % for week=%, unit=%', rec.metric_id, rec.week, rec.measure_unit;
    end if;
  end loop;
end $$;

\echo DB healthcheck completed successfully.
