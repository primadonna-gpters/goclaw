# GoClaw Migration Guide — Cloudflare Pages

OpenClaw → GoClaw 마이그레이션 가이드 정적 사이트.

## 로컬 프리뷰

```bash
# 방법 1: 단순 HTTP 서버
python3 -m http.server 8080
# → http://localhost:8080

# 방법 2: Wrangler (Cloudflare 로컬 환경)
npx wrangler pages dev .
```

## Cloudflare Pages 배포

### 방법 A: Wrangler CLI 직접 배포

```bash
npx wrangler pages deploy . --project-name=goclaw-migration-guide
```

최초 실행 시 Cloudflare 계정 로그인 후 프로젝트가 자동 생성됩니다.
배포 완료 후 `https://goclaw-migration-guide.pages.dev` URL이 출력됩니다.

### 방법 B: Git 연동 (권장)

1. 이 저장소를 GitHub에 푸시
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. 저장소 선택 후 빌드 설정:
   - **Build command**: (비워두기)
   - **Build output directory**: `site`
   - **Root directory**: `/`
4. **Save and Deploy**

이후 `main` 브랜치 푸시 시 자동 배포됩니다.

## 파일 구성

```
site/
├── index.html       # 메인 페이지 (단일 파일, 외부 의존성 없음)
├── _headers         # Cloudflare Pages 보안 헤더
├── wrangler.toml    # Wrangler 설정
└── README.md
```

## 커스텀 도메인

Cloudflare Pages 프로젝트 → **Custom domains** → **Set up a custom domain**.
