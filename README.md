# Kevin Dashboard (MVP)

플랩풋볼 운영/매칭 데이터를 주간 단위로 분석하는 내부 대시보드입니다.

## 핵심 목적
- 최근 8/12/24주 성과 추이 확인
- 측정단위(`all`, `area_group`, `area`, `stadium_group`, `stadium` 및 `dimension_type` 기반 확장 단위)별 비교
- 지표 기반 의사결정 및 AI 요약/질문 응답 지원

## 기술 스택
- Frontend: Next.js 14, React, TypeScript
- Data: Supabase(Postgres, schema `bigquery`)
- Source Tables:
  - `bigquery.data_mart_1_social_match`
  - `bigquery.metric_store_native`
- Supporting Views:
  - `bigquery.weeks_view`
  - `bigquery.weekly_agg_mv`

## API
- `GET /api/metrics`
- `GET /api/measurement-units`
- `GET /api/weeks?n=8|12|24`
- `GET /api/filter-options?measureUnit=...`
- `POST /api/heatmap`
- `POST /api/ai/summary`
- `POST /api/ai/chat`

## 데이터 집계 규칙
- `cnt` 계열: `MAX(value)`
- `rate` 계열: `AVG(value)`
- 집계 그레인: `(week, measure_unit, filter_value, metric_id)`

## 최근 반영 사항 (2026-02)
- `weekly_agg_mv` 재구성:
  - `dimension_type` 기반으로 단위별(`all/area_group/area/stadium_group/stadium`) 집계
  - 기존 `stadium_group/stadium` 누락 이슈 해소
- 지표 처리 확장:
  - 고정 6개 지표에서 벗어나, `metric_store_native`와 원천 컬럼 교집합 기준의 동적 지표 지원
- 조회 효율화:
  - Heatmap API 요청 시 선택 지표만 조회
  - `area/stadium_group/stadium` 대용량 조회 시 PostgREST 1000행 제한으로 누락되던 문제를 페이지네이션(`range`) 조회로 개선
  - 필터 옵션 조회(`GET /api/filter-options`)도 페이지네이션 적용해 옵션 누락 방지
  - 필터 옵션 조회를 원천 테이블 스캔이 아닌 `weekly_agg_mv` 기반으로 전환해 로딩 시간 개선
  - `GET /api/filter-options` 응답에 TTL 캐시(600초) 적용
  - `/api/heatmap`의 지원 지표 목록 조회(`getSupportedMetricIds`)에 TTL 캐시(3600초) 적용
- 운영 안정화:
  - `HEATMAP_ALLOW_BASE_FALLBACK=0`이 아닐 때 원천 fallback 허용(기본 ON)
  - 최신 1~2주 MV 누락 시 원천 집계로 보강
  - `all` 단위에서 `dimension_type='all'` 데이터가 비는 경우 `area` 기반으로 `all` 재구성
- 자동 검증:
  - 전체 지원 지표 대상 원천 vs MV 정합성 검증 스크립트 추가
  - PR마다 GitHub Actions에서 자동 검증
- 검색 UI 개선:
  - 상단 브랜드 아이콘 제거, `KEVIN` 클릭 시 `/`로 이동
  - 검색 박스를 좌측 사이드바에서 상단 배치로 재구성 (`ui_improvement_v5`)
  - 활성 지표 영역 UX 개선:
    - `지표 선택` 버튼 + 활성 지표 칩 + `전체 해제` 흐름으로 정리
    - 활성 지표 칩 클릭 시 비활성(해제)
  - 데이터 결과 테이블 열 너비 마우스 드래그 리사이즈 지원
  - 페이지 전체 가로 스크롤 이슈 수정:
    - 스크롤 범위를 데이터 테이블 컨테이너로 제한(`.table-scroll { overflow-x: auto; }`)
    - 메인 패널 오버플로우 방지(`.main-panel { min-width: 0; }`)
  - 지표 선택 UX 개선:
    - 사이드 패널 방식으로 변경
    - 사이드 패널 상단 검색 기능 추가
    - 카테고리2/3 기반 그룹 표시
    - 카테고리2/3 섹션 간 여백/구분선 강화로 가독성 개선
    - 지표 설명 + 쿼리 복사 버튼 제공
    - `선택완료`/`선택 초기화` 동작 및 선택 0건 시 완료 버튼 비활성
  - 엔티티 테이블 드릴다운/필터 UX 개선:
    - 엔티티 헤더에 드롭다운 필터 메뉴 추가
    - 필터 트리거 아이콘을 표준 필터(funnel) 형태로 변경
    - 엔티티 셀 hover 시 연한 파란색 강조(클릭 가능 상태 명확화)
    - 드릴다운 경로를 `지역그룹(전체) > 지역(고양시)` 형태로 표기
    - 경로의 상위 단계 클릭 시 부모 엔티티 필터를 해제하고 해당 단계 전체 결과로 복귀
  - 데이터 결과 테이블 우상단에 `증감 노출` 체크박스 추가(기본 ON)
  - 추이 스파크라인을 검정색으로 조정하고 회색 점선 추세선 추가
  - 상단 탭 영역(개인 저장 보고서용)은 레이아웃 PoC 후 현재 화면에서 비활성화
    - 추후 재도입 예정 (GA 보고서 탭과 유사한 개념)
  - 상단 헤더/검색 영역 sticky 해제
    - 스크롤 시 데이터 영역 가림 현상을 방지하기 위해 일반 스크롤 레이아웃으로 복귀
  - 데이터 결과 테이블 첫 행 sticky 고정은 현재 비활성화
    - 스크롤/레이아웃 충돌 이슈로 별도 브랜치에서 재설계 예정

## 2026-03-08 운영 이슈 기록
- 증상:
  - 로그인 시 `/login` 반복 진입(루프)
  - 로그인 완료 후 `social-match-dashboard-mvp-two.vercel.app`로 이동
  - 최신 기능 미반영처럼 보이는 혼선
- 원인:
  - Supabase Auth Redirect URL이 `-two` 도메인으로 설정
  - middleware 인증 실패 시 즉시 로그인 리다이렉트
  - canonical 도메인과 보조 도메인 혼용
- 조치:
  - middleware에서 `/api` 제외 및 인증 조회 실패 시 강제 리다이렉트 완화
  - OAuth redirect/callback을 `NEXT_PUBLIC_APP_URL` 기준 canonical URL로 고정
  - `/login?code=...` 유입 시 로그인 페이지에서 코드 교환 처리
  - 헤더에 `build: <commit>` 표시로 배포 버전 식별

## 운영 도메인 원칙
- Canonical 운영 도메인:
  - `https://social-match-dashboard-mvp.vercel.app`
- Supabase Auth URL 설정:
  - Site URL = `https://social-match-dashboard-mvp.vercel.app`
  - Redirect URLs:
    - `https://social-match-dashboard-mvp.vercel.app/auth/callback`
    - `http://localhost:3000/auth/callback`
- `-two` 도메인은 운영 로그인 경로에서 제외(필요 시 Preview 전용)

## 이슈 진단 메모 (2026-02-22)
- 증상:
  - `all`, `area_group`는 정상이나 `area`, `stadium_group`, `stadium`에서 최근값이 0으로 과다 노출
- 진단 결과:
  - DB 원천 부족이 아니라, 대용량 단위에서 API 단건 조회가 `rows=1000, exactCount>>1000`으로 잘리는 현상 확인
  - 예시(최근 8주, 기본 6지표): `area 1000/4228`, `stadium_group 1000/15677`, `stadium 1000/24639`
- 조치:
  - `app/lib/dataQueries.ts`의 heatmap/filter/fallback 조회를 모두 페이지네이션으로 변경

## 실행
1. 의존성 설치
```bash
npm install
```

2. 환경변수 설정 (`.env.local`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` (운영: `https://social-match-dashboard-mvp.vercel.app`)

3. 개발 실행
```bash
npm run dev
```

## 데이터 검증
- 로컬 전체 지표 검증
```bash
npm run data:validate-mv
```

- 로컬 최신 주차 헬스체크(경량)
```bash
npm run data:validate-recent-refresh
```

- PR 자동 검증
  - 워크플로: `.github/workflows/data-validation.yml`
  - 필요한 GitHub Secrets:
    - `SUPABASE_URL`
    - `SUPABASE_SERVICE_ROLE_KEY`

- 주간 MV 자동 재생성/검증
  - 워크플로: `.github/workflows/weekly-mv-rebuild.yml`
  - 스케줄: 매주 화요일 10:00 KST (UTC `0 1 * * 2`)
  - 실행 SQL: `supabase/sql/refresh_weekly_agg_mv.sql`
  - 헬스체크 SQL: `supabase/sql/validate_recent_refresh.sql`
  - 필요한 GitHub Secrets:
    - `SUPABASE_URL`
    - `SUPABASE_SERVICE_ROLE_KEY`
    - `SUPABASE_DB_URI`

## 2026-03-12 운영 메모 (MV 자동복구)
- 오늘 확인한 흐름:
  - Airbyte 주간 overwrite 이후 `weekly_agg_mv` 기반 조회 누락 가능성 확인
  - 주간 자동 복구 워크플로(`Weekly MV Rebuild`)를 main에 반영
  - 재생성 SQL + 최신 3주 헬스체크 스크립트 연결
- 오늘 발생한 오류/조치:
  - 초기: GitHub Actions에서 Direct DB 접속 시 `Network is unreachable` (IPv6 경로)
  - 조치: 워크플로를 `SUPABASE_DB_URI` 기반 접속으로 변경
  - PostgREST 기반 헬스체크는 GitHub Actions 환경에서 대용량 단위(`stadium_group`) count 조회 시 비어 있는 에러 payload로 실패할 수 있어, 워크플로 검증 경로를 DB 직결 SQL(`supabase/sql/validate_recent_refresh.sql`)로 전환
  - SQL 헬스체크 1차 적용 시 `DO $$` 블록 내부의 `psql` 변수 치환 문제로 문법 오류가 발생했고, temp summary table 재사용 방식으로 수정
  - `scripts/validate-recent-refresh.mjs`는 로컬/수동 진단용으로 유지하고, query context(`week/unit/metric/queryType`)와 Supabase error payload(`code/details/hint/message`)를 함께 출력하도록 보강
  - `Weekly MV Rebuild #11` 수동 재실행 결과 `rebuild-and-validate` 전체 성공 확인
  - 로컬에서도 `npm run data:validate-recent-refresh`, `npm run data:validate-mv`(최근 3주, 전체 지원 지표) 재검증 통과
- 운영 확인 결과:
  - 배포 UI에서 최근 3주 데이터는 일부 빈 값이 남아 있음
  - 원인 분석 결과, MV/헬스체크 실패가 아니라 최신 주차 `26.03.09 - 03.15` 원천 적재가 진행 중인 상태로 판단
  - `all` 기준 완료 주차 `26.03.02 - 03.08`은 41개 지표가 존재하지만, `26.03.09 - 03.15`는 32개 지표만 존재
  - 최신 주차 누락 확인 지표:
    - `apply_cancel_fee_to_sales_rate`
    - `apply_cnt_per_active_user`
    - `cash_reward_cost_to_sales_rate`
    - `contribution_margin_rate`
    - `manager_cost_to_sales_rate`
    - `matching_rate`
    - `point_reward_cost_to_sales_rate`
    - `reward_cost_to_sales_rate`
    - `stadium_fee_to_sales_rate`
- 2026-03-12 추가 점검:
  - Airbyte를 통해 Supabase 원천이 다시 최신화된 직후, PostgREST에서 `bigquery.weeks_view`를 찾지 못하는 `PGRST205`가 재발
  - 후속 확인에서 GitHub Actions `Weekly MV Rebuild #12`가 `relation "bigquery.weeks_view" does not exist`로 실패해, schema cache뿐 아니라 view 오브젝트 자체 복구가 필요함을 확인
  - 대응으로 MV 재생성 SQL(`supabase/sql/refresh_weekly_agg_mv.sql`)과 신규 migration에 `bigquery.weeks_view` 재생성 + `notify pgrst, 'reload schema'`를 포함
  - 로컬 드릴다운 점검 중 `stadium_group` 이하 부모-자식 조회가 원천 테이블 full scan으로 timeout되어, `entity_hierarchy_mv`를 추가해 부모-자식 옵션/드릴다운 조회를 MV + 계층 MV 조합으로 전환
  - `/api/weeks`는 `weeks_view` timeout을 피하기 위해 `weekly_agg_mv` 기준 recent week 수집 방식으로 변경
  - `/api/heatmap`은 `all` 단위의 불필요한 fallback을 제거하고, 드릴다운 시 child entity를 chunk 단위로 조회하도록 조정해 `area_group -> area`, `area -> stadium_group` 드릴다운 timeout을 완화
  - `data_improvement_260312_01` 브랜치 기준 워크플로 재실행/배포 후 기본 조회와 드릴다운 조회가 정상 동작하는 것 확인
  - 로컬 DB 자격증명으로는 원격 `db push` 인증이 실패해, 실제 원격 반영은 GitHub Actions 또는 올바른 `SUPABASE_DB_URI`/DB password 기준으로 별도 실행 필요
- 다음 TODO:
  - 진행 중 주차를 기본 조회에서 제외할지, `집계 진행 중` 상태로 노출할지 정책 결정
  - 다음 수동/정기 실행에서 DB 직결 헬스체크와 annotation 경고 제거 여부 확인
  - `SUPABASE_DB_URI` 운영값 점검:
    - pooler URI 사용 여부, 비밀번호 인코딩, `sslmode` 포함 여부 재확인

## 2026-03-14 측정단위 확장 반영
- 측정단위 목록:
  - 검색박스 `측정단위`는 고정 4개가 아니라 `dimension_type`/`metric_store_native` 기반 동적 목록으로 전환
  - 신규 API: `GET /api/measurement-units`
  - 현재 노출 단위:
    - `all`
    - `area_group`, `area`, `stadium_group`, `stadium`
    - `area_group_and_time`, `area_and_time`
    - `stadium_group_and_time`, `stadium_and_time`
    - `time`, `hour`
    - `yoil_and_hour`, `yoil_group_and_hour`
- 드릴다운 UX:
  - 엔티티 셀 전체 클릭 시 드릴다운 메뉴 노출
  - 드릴다운 메뉴는 엔티티 헤더 필터와 동일한 드롭다운 리스트 UI 사용
  - 리스트 항목 선택 즉시 드릴다운 실행
  - `_and_` 단위는 사용자에게 직접 강제하지 않고, 부모/대상 단위 조합에 맞는 실제 조회 그레인으로 내부 매핑
  - 예시:
    - `time -> area_group` 조회는 내부적으로 `area_group_and_time` 원천 그레인 사용
    - `time -> area` 조회는 내부적으로 `area_and_time` 원천 그레인 사용
- 조회 경로:
  - 기존 legacy 단위(`all/area_group/area/stadium_group/stadium`)는 계속 `weekly_agg_mv` 우선 사용
  - 확장 단위는 원격 DB 자원 한계로 `weekly_agg_mv` 확장을 운영에 적용하지 않고, 최근 선택 주차 범위 기준 원천 테이블 직접 조회로 처리
  - 필터 옵션도 확장 단위는 선택된 최근 주차 범위 기준으로 원천 조회
- 원격 DB 반영:
  - 적용 완료 migration:
    - `supabase/migrations/202603140003_add_indexes_for_expanded_dimension_queries.sql`
  - 목적:
    - `dimension_type + week + entity columns` 패턴의 확장 단위 조회 성능 개선
  - 참고:
    - `weekly_agg_mv`를 확장 단위까지 직접 재생성하는 시도는 원격 DB에서 temp disk 부족(`No space left on device`)으로 운영 반영 보류
- 로컬 확인 기준:
  - `time` 필터 옵션 약 1초대
  - `area_and_time` 필터 옵션/heatmap 약 4~5초대
  - `npm run build` 통과

## Supabase 배포 워크플로
- 마이그레이션: `supabase/migrations/202602210001_weekly_agg_mv_v2.sql`
- 마이그레이션: `supabase/migrations/202602220001_weekly_agg_mv_filter_options_idx.sql`
- 빠른 실행 가이드: `SUPABASE_CLI_WORKFLOW.md`
- 수동 MV 재생성:
```bash
npm run sb:refresh-mv
```

## 참고 문서
- 요구사항/운영 기준: `PRD.md`
- 성능/SQL 참고: `PERF_OPTIMIZATION.md`
