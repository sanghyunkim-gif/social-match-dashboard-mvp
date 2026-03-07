# Kevin MVP - Product Requirements Document

## 1. 문서 목적
본 문서는 Kevin 대시보드의 데이터 모델, API 계약, 집계 정확도 규칙, 운영/검증 프로세스를 정의합니다.

## 2. 제품 개요
- 제품명: Kevin Dashboard (MVP)
- 사용자: 운영팀, 매칭팀, PX팀
- 핵심 시나리오:
  - 최근 8/12/24주 성과 조회
  - 측정단위별(`all`, `area_group`, `area`, `stadium_group`, `stadium`) 드릴다운 분석
  - Heatmap 기반 비교
  - AI 요약 및 질문 응답

## 3. 데이터 구조
### 3.1 원천 테이블 (Read-only)
- `bigquery.data_mart_1_social_match`
- `bigquery.metric_store_native`

### 3.2 보조 뷰
- `bigquery.weeks_view`
  - 주차 기준 정렬/필터의 단일 소스

### 3.3 집계 MV
- `bigquery.weekly_agg_mv`
- 그레인: `(week, measure_unit, filter_value, metric_id)`
- 규칙:
  - `cnt` 계열: `MAX`
  - `rate` 계열: `AVG`

## 4. 집계/정확도 규칙
### 4.1 측정 단위
- `all`
- `area_group`
- `area`
- `stadium_group`
- `stadium`

### 4.2 all 정의
- `all`은 원천의 `dimension_type = all(or null)` 기준 집계값으로 생성
- 운영 검증 시 `all total_match_cnt`와 하위 단위 합(검증 쿼리 기준)의 정합성 확인

### 4.3 핵심 품질 기준
- 누락 금지: 단위별 원천 데이터가 있으면 MV에도 반드시 존재
- 오집계 금지: 동일 key(`week/unit/filter/metric`)에서 규칙 위반(MAX/AVG) 금지

## 5. API 계약
- `GET /api/metrics`
- `GET /api/weeks?n=...`
- `GET /api/filter-options?measureUnit=...`
- `POST /api/heatmap`
- `POST /api/ai/summary`
- `POST /api/ai/chat`

제약:
- 기존 응답 shape 유지
- 집계 정확도 규칙 우선

## 6. 성능/캐시 정책
- `/api/weeks`: 강한 캐시
- `/api/metrics`, `/api/heatmap`: TTL 캐시
- MV/인덱스 기반 조회

## 7. 2026-02 고도화 반영
### 7.1 MV 재구성
- 파일: `supabase/migrations/202602210001_weekly_agg_mv_v2.sql`
- 변경 요점:
  - `dimension_type` 기반으로 단위별 행을 명시적으로 생성
  - `stadium_group`, `stadium` 누락 문제 해결

### 7.2 지표 확장
- 고정 6개 지표 -> 동적 지표 지원
- 기준: `metric_store_native.metric` ∩ 원천 테이블 metric 컬럼

### 7.3 조회 방식 개선
- Heatmap 요청은 선택 지표만 조회하도록 변경
- fallback은 `HEATMAP_ALLOW_BASE_FALLBACK=0`이 아닐 때 허용(기본 ON)
- 대용량 단위(`area`, `stadium_group`, `stadium`)는 PostgREST 응답 제한(1000행) 회피를 위해 페이지네이션(`range`)으로 전체 row를 수집
- `GET /api/filter-options`도 동일하게 페이지네이션 적용
- `GET /api/filter-options`는 원천(`data_mart_1_social_match`) 스캔 대신 `weekly_agg_mv`(`metric_id=total_match_cnt`) 기준으로 조회
- `GET /api/filter-options` 응답은 TTL 600초 캐시
- `/api/heatmap` 내부의 지원 지표 ID 조회는 TTL 3600초 캐시

### 7.4 검색/결과 UI 개선
- 상단 브랜딩:
  - 아이콘 제거
  - `KEVIN` 클릭 시 대시보드 초기 URL(`/`)로 이동
- 결과 테이블:
  - 열 너비 리사이즈(마우스 드래그)
  - 페이지 전체 가로 스크롤이 생기지 않도록 레이아웃 경계 조정
    - `.table-scroll`는 내부 가로 스크롤 담당
    - `.main-panel`에 `min-width: 0` 적용
- 지표 선택:
  - 기존 리스트 직접 스크롤 방식 -> 사이드 패널 방식
  - 패널 내 지표 설명 제공
  - 쿼리 박스 대신 `쿼리 복사` 버튼 제공 (`metric_store_native.query`)
  - `선택완료` 버튼은 1개 이상 선택 시에만 활성
  - `선택 초기화` 버튼으로 패널 내 선택 상태 초기화
- 상단 탭 영역:
  - 개인별 저장 검색옵션/결과 진입을 위한 탭 UI PoC 완료
  - 현재 운영 화면에서는 비활성화 상태로 유지, 후속 버전에서 재도입 예정

### 7.7 2026-02-28 UI 개선(v5)
- 검색 영역:
  - 검색 옵션 박스를 상단형 레이아웃으로 재구성
  - 활성 지표 라인에 `지표 선택` 버튼/활성 지표 칩/`전체 해제` 흐름 정렬
  - 활성 지표 칩 클릭 시 즉시 비활성화
- 헤더:
  - 상단 sticky 헤더/검색 바 동작 유지
- 테이블 첫 행 sticky:
  - 스크롤/레이아웃 충돌 이슈로 현재 비활성화
  - 후속 브랜치에서 sticky 설계 재시도 예정

### 7.8 2026-03-08 데이터/UX 개선
- 최근 1~2주 데이터 보강:
  - `weekly_agg_mv` 최신 주차 누락 시, API 레벨에서 원천(`data_mart_1_social_match`) fallback 집계로 보강
  - `all` 단위의 `dimension_type='all'` 미적재 케이스는 `area` 단위 집계를 기반으로 `all` 값을 재구성
  - 주차 누락뿐 아니라 `주차+지표` 누락도 보강 대상으로 처리
- 지표 선택 패널 개선:
  - 상단 검색 입력 추가(지표명/ID/설명 검색)
  - `metric_store_native`의 카테고리2/3 기반 그룹 표시
- 결과 테이블 UX:
  - 우상단(테이블 헤더) `증감 노출` 체크박스 추가
  - 기본 ON, OFF 시 증감 텍스트만 숨김
  - 증감 스파크라인 색상: 검정
  - 추세선: 회색 점선 오버레이 추가

### 7.5 2026-02-22 장애 원인 및 조치
- 현상:
  - `area/stadium_group/stadium` 최근 주차 조회 시 0 값 과다 노출
- 원인:
  - API 조회가 단건 호출로 끝나면서 대용량 row가 1000행으로 절단됨
  - 절단 이후 프론트 표시에서 일부 지표가 0 중심으로 보이는 왜곡 발생
- 재현 근거(최근 8주, 주요 6지표):
  - `area`: `rowsReturned=1000`, `exactCount=4228`
  - `stadium_group`: `rowsReturned=1000`, `exactCount=15677`
  - `stadium`: `rowsReturned=1000`, `exactCount=24639`
- 조치:
  - `app/lib/dataQueries.ts`에 공통 페이지네이션 유틸 도입
  - heatmap/fallback/filter 옵션 조회 경로 모두 페이지네이션 적용

### 7.6 2026-02-22 속도 개선(v4)
- 배경:
  - `stadium_group`, `stadium`는 엔티티 수가 많아 필터 옵션 로딩과 조회 준비 단계 지연 발생
- 개선:
  - `weekly_agg_mv`에 인덱스 추가:
    - 마이그레이션: `supabase/migrations/202602220001_weekly_agg_mv_filter_options_idx.sql`
    - 인덱스: `(measure_unit, metric_id, filter_value)`
  - 필터 옵션 API를 MV 기반으로 전환하고 TTL 캐시 적용
  - heatmap API의 지원 지표 목록 조회 캐시 적용

## 8. 검증 체계
### 8.1 로컬 검증
- 스크립트: `scripts/validate-weekly-agg-mv.mjs`
- 명령: `npm run data:validate-mv`
- 기본: 최근 8주, 지원 가능한 전체 지표, 5개 단위
- 튜닝 환경변수:
  - `MV_VALIDATE_WEEKS`
  - `MV_VALIDATE_EPSILON`
  - `MV_VALIDATE_METRICS`

### 8.2 PR 자동 검증
- 워크플로: `.github/workflows/data-validation.yml`
- 트리거: `pull_request`
- 실행: `npm run data:validate-mv`
- GitHub Secrets 필수:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

## 9. 운영 자동화
### 9.1 Supabase CLI
- 가이드: `SUPABASE_CLI_WORKFLOW.md`
- 스크립트:
  - `npm run sb:doctor`
  - `npm run sb:link`
  - `npm run sb:push`
  - `npm run sb:bootstrap`

### 9.2 릴리즈 준비 자동화
- 스크립트: `scripts/release/prepare-pr.ps1`
- 명령: `npm run release:prepare`
- 기능:
  - build + data validation + commit
  - 옵션으로 push/PR 생성
## 10. 비기능 요구사항
- UTF-8 인코딩 강제(`predev`, `prebuild`)
- 원천 테이블 스키마 변경 금지
- 신규 리소스는 별도 파일/마이그레이션으로 관리

## 11. 수용 기준 (현재)
- `stadium_group`, `stadium` 조회 결과 정상 노출
- 전체 지표 검증(`data:validate-mv`) 결과:
  - `missingRows = 0`
  - `mismatchRows = 0` (허용 오차 `MV_VALIDATE_EPSILON` 기준)
- PR 시 `Data Validation` 워크플로 성공
