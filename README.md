# DeFi Dashboard

DeFi Dashboard — LST / Liquidity / Lending 기회를 보여주는 React + TypeScript + Vite 기반 웹앱. 디자인 레퍼런스는 [loris.tools](https://loris.tools/) 톤을 참고하며, 숫자 가독성과 테이블 명료성을 우선한다.

## Getting Started

### Prerequisites

- Node.js 18+
- npm (권장, 현재 설정: npm 11.x)

### Setup

```bash
npm install
```

### Scripts

- `npm run dev` — 로컬 개발 서버 실행
- `npm run build` — 프로덕션 빌드
- `npm run preview` — 빌드 결과 미리보기
- `npm run lint` — ESLint 검사
- `npm run typecheck` — TypeScript 타입 검사
- `npm run format` — Prettier 포맷 적용

## Project Structure

- `src/components` — 공유 UI 컴포넌트 (CSS Modules)
- `src/config` — 카테고리/프로토콜 메타데이터
- `src/data` — 정적/mock 데이터 소스
- `src/domain` — 도메인 타입 정의
- `src/services` — 데이터 서비스, 캐싱, 상태 관리
- `src/views` — 카테고리별 화면/테이블
- `src/integrations` — 루핑/APY 연동 입력 포인트
- `src/utils` — 포맷/정렬/필터 유틸
- `src/styles` — 전역 스타일/테마 토큰

## Documentation

- 계획: [`docs/PLAN.md`](docs/PLAN.md)
- 기술 사양: [`docs/TECHSPEC.md`](docs/TECHSPEC.md)
- 워크플로: [`docs/AGENTS.md`](docs/AGENTS.md)

## Testing

### Suilend Hook 테스트
`devInspect`를 사용한 트랜잭션 시뮬레이션 테스트:

```bash
# 지갑 주소만 필요 (서명 불필요)
npx tsx test/8_suilend_hook_test.ts 0xYourWalletAddress

# 예시 (활성 obligation이 있는 주소)
npx tsx test/8_suilend_hook_test.ts 0x72e8961badd0cff0efb38f7c29d13d0607c579d32f67da7159af25652704bd22
```

테스트 항목:
- `usePools` — Reserve 데이터 조회
- `useUserPositions` — Obligation deposit/borrow 조회
- `useHealthFactor` — 헬스팩터 계산
- `useCoinBalance` — 지갑 잔액
- `useDeposit`, `useBorrow`, `useWithdraw`, `useRepay` — TX devInspect 시뮬레이션

## Notes

- CSS Modules를 기본 사용 (`ComponentName.module.css`).
- 글로벌 테마/리셋은 `src/styles`에서 관리.
- 데이터 서비스는 정적 데이터로 시작하며 추후 API로 교체 가능.