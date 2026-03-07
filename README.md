# Kevin Dashboard (MVP)

플랩풋볼 운영/매칭 데이터를 주간 단위로 분석하는 내부 대시보드입니다.

## 핵심 목적
- 최근 8/12/24주 성과 추이 확인
- 측정단위(`all`, `area_group`, `area`, `stadium_group`, `stadium`)별 비교
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
    - 지표 설명 + 쿼리 복사 버튼 제공
    - `선택완료`/`선택 초기화` 동작 및 선택 0건 시 완료 버튼 비활성
  - 데이터 결과 테이블 우상단에 `증감 노출` 체크박스 추가(기본 ON)
  - 추이 스파크라인을 검정색으로 조정하고 회색 점선 추세선 추가
  - 상단 탭 영역(개인 저장 보고서용)은 레이아웃 PoC 후 현재 화면에서 비활성화
    - 추후 재도입 예정 (GA 보고서 탭과 유사한 개념)
  - 데이터 결과 테이블 첫 행 sticky 고정은 현재 비활성화
    - 스크롤/레이아웃 충돌 이슈로 별도 브랜치에서 재설계 예정

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

3. 개발 실행
```bash
npm run dev
```

## 데이터 검증
- 로컬 전체 지표 검증
```bash
npm run data:validate-mv
```

- PR 자동 검증
  - 워크플로: `.github/workflows/data-validation.yml`
  - 필요한 GitHub Secrets:
    - `SUPABASE_URL`
    - `SUPABASE_SERVICE_ROLE_KEY`

## Supabase 배포 워크플로
- 마이그레이션: `supabase/migrations/202602210001_weekly_agg_mv_v2.sql`
- 마이그레이션: `supabase/migrations/202602220001_weekly_agg_mv_filter_options_idx.sql`
- 빠른 실행 가이드: `SUPABASE_CLI_WORKFLOW.md`

## 참고 문서
- 요구사항/운영 기준: `PRD.md`
- 성능/SQL 참고: `PERF_OPTIMIZATION.md`
