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

백엔드를 띄우지 않고 개발할 때도 이 값은 반드시 설정해야 합니다. 값이 비어 있으면 요청이 상대경로로 나가 404가 되고, DEV 목 폴백은 네트워크 오류에서만 동작하므로 목 데이터가 뜨지 않습니다.

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


## 주요 명령어

```bash
npm run dev
npm run build
npm run lint
npm run preview
```
