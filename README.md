# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
# dive-log-share

## Triển khai bằng Docker

Ngoài GitHub Pages, project có thể chạy trên server dev/prod bằng Docker.

### Production (Nginx serve build tĩnh)

```bash
# Build image và chạy nền
docker compose up -d --build

# App chạy tại http://localhost:8080 (đổi cổng bằng biến WEB_PORT)
WEB_PORT=80 docker compose up -d --build
```

Hoặc dùng trực tiếp Docker không qua compose:

```bash
docker build -t dive-log-share .
docker run -d -p 8080:80 --name dive-log-share dive-log-share
```

> Image dùng multi-stage: build bằng Node 24 rồi serve bằng Nginx, đã cấu hình
> sẵn SPA history fallback và cache cho asset. Mặc định `base` là `/` (root
> domain). Nếu deploy dưới sub-path, đổi `VITE_BASE_PATH` trong
> `docker-compose.yml` (build arg) hoặc khi `docker build --build-arg`.

#### Cấu hình API base URL

App đọc API base URL từ biến `VITE_API_BASE_URL` (mặc định
`https://diveroid30api.diveroid.com`). Vì là biến `VITE_*`, giá trị được
**nhúng lúc build**, nên cần truyền lúc build image:

```bash
# Qua docker compose (đọc từ .env hoặc shell)
VITE_API_BASE_URL=https://api.dev.example.com docker compose up -d --build

# Hoặc trực tiếp
docker build --build-arg VITE_API_BASE_URL=https://api.dev.example.com -t dive-log-share .
```

Khi chạy `npm run dev`/`npm run build` ngoài Docker, tạo file `.env` từ
`.env.example` và đặt `VITE_API_BASE_URL` tương ứng.

### Development (Vite dev server + hot reload)

```bash
docker compose -f docker-compose.dev.yml up --build

# App chạy tại http://localhost:5173 (đổi cổng bằng biến DEV_PORT)
```

Source được mount vào container nên chỉnh code sẽ reload ngay.

### GitHub Pages

Workflow `.github/workflows/deploy-pages.yml` vẫn hoạt động như cũ: khi không
set `VITE_BASE_PATH`, `base` mặc định là `/dive-log-share/`.
