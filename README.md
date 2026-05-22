# OpenPlan Frontend

OpenPlan MVP1 프론트엔드 애플리케이션입니다.

## 기술 스택

- React
- JavaScript
- Vite
- Tailwind CSS

## 개발 환경

- Node.js 22 LTS
- npm

## 환경 변수

`.env.example`을 참고해 `.env` 파일을 생성합니다.

```env
VITE_API_BASE_URL=http://localhost:8080
```

## 설치

```bash
npm install
```

## 실행

```bash
npm run dev
```

기본 실행 주소는 아래와 같습니다.

```txt
http://localhost:5173
```

## 빌드

```bash
npm run build
```

## 파일 구조

```txt
src/
  api/          # 백엔드 API 통신 설정과 공통 요청 로직
    client.js  # Axios 기본 클라이언트 설정
  app/          # 앱 전체 설정과 라우터 설정
    router.jsx # React Router 라우터 설정
  components/  # 여러 화면에서 재사용하는 공통 UI 컴포넌트
  features/    # 기능 단위로 묶이는 화면, API, 상태 로직
  pages/       # 라우터에 직접 연결되는 페이지 컴포넌트
    HomePage.jsx
  App.jsx      # 앱 최상위 컴포넌트
  index.css    # Tailwind CSS 진입 파일
  main.jsx     # React 앱 진입 파일
```

## 주요 명령어

```bash
npm run dev
npm run build
npm run lint
npm run preview
```
