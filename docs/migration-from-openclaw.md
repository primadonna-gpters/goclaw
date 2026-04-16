# OpenClaw에서 GoClaw으로 마이그레이션 가이드

OpenClaw(TypeScript/Node.js)에서 GoClaw(Go)로 전환하는 전체 가이드입니다.

## 사전 준비

- Docker & Docker Compose 설치
- OpenClaw이 현재 실행 중 (설정 추출 용도)
- OpenClaw 상태 디렉토리(`~/.openclaw/`)에 접근 가능

## 전체 흐름

| 단계 | 작업 | 소요 시간 |
|------|------|----------|
| 1 | GoClaw 클론 & 환경 준비 | 2분 |
| 2 | GoClaw 기동 (OpenClaw과 병렬) | 5분 |
| 3 | LLM 프로바이더 설정 | 5분 |
| 4 | 에이전트 생성 | 2분 |
| 5 | 워크스페이스 파일(MD) 이전 | 5분 |
| 6 | 채널(Slack/Telegram 등) 이전 | 5분 |
| 7 | OpenClaw 중지 & 검증 | 2분 |

총 약 30분, 병렬 실행으로 다운타임 없이 전환 가능합니다.

---

## 1단계: 클론 & 환경 준비

```bash
git clone -b main https://github.com/nextlevelbuilder/goclaw.git
cd goclaw

# 시크릿 자동 생성 (게이트웨이 토큰 + 암호화 키)
chmod +x prepare-env.sh && ./prepare-env.sh
```

`.env` 편집:

```bash
# PostgreSQL 비밀번호 설정
POSTGRES_PASSWORD=your_secure_password

# OpenClaw(18789/18790)과 포트 충돌 방지
GOCLAW_PORT=18800
POSTGRES_PORT=5433

# 대시보드 전체 접근 권한을 위해 owner 설정
GOCLAW_OWNER_IDS=admin,system
```

## 2단계: GoClaw 기동

### 방법 A: 사전 빌드 이미지 사용 (가장 빠름)

`docker-compose.yml`에서 `build:` 섹션을 제거하고:

```yaml
services:
  goclaw:
    image: ghcr.io/nextlevelbuilder/goclaw:latest
```

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

### 방법 B: 소스에서 빌드 (Claude CLI 프로바이더 사용 시 필수)

`docker-compose.yml`의 `build:` 섹션을 유지한 상태로:

```bash
# Claude CLI 없이
make up

# Claude CLI 포함 (Max 구독 사용자용)
make up WITH_CLAUDE_CLI=1
```

### 정상 동작 확인

```bash
curl http://localhost:18800/health
# {"status":"ok","protocol":3}
```

### DB 마이그레이션 실행

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml \
  -f docker-compose.upgrade.yml run --rm upgrade
```

## 3단계: LLM 프로바이더 설정

### 방법 A: Claude CLI (Max 구독 — API 비용 없음)

소스 빌드 시 `ENABLE_CLAUDE_CLI=true` 필요.

1. Claude 인증 정보를 마운트합니다. `docker-compose.claude-cli.yml` 생성/수정:

```yaml
services:
  goclaw:
    build:
      args:
        ENABLE_CLAUDE_CLI: "true"
    volumes:
      - ~/.openclaw/claude-auth:/app/.claude-host:ro
      # 또는 ~/.claude를 직접 사용하는 경우:
      # - ~/.claude:/app/.claude-host:ro
```

2. 오버레이 포함 기동:

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml \
  -f docker-compose.claude-cli.yml up -d --build
```

3. 인증 동기화 확인:

```bash
docker logs <goclaw-container> 2>&1 | grep "Claude CLI credentials"
# 예상 출력: "Claude CLI credentials synced from host."
```

4. API로 프로바이더 등록:

```bash
GATEWAY_TOKEN="<.env에서-확인한-토큰>"

curl -s -X POST \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -H "X-GoClaw-User-Id: admin" \
  -H "Content-Type: application/json" \
  http://localhost:18800/v1/providers \
  -d '{
    "name": "claude-cli",
    "provider_type": "claude_cli",
    "api_key": "",
    "enabled": true,
    "settings": {
      "default_model": "opus"
    }
  }'
```

> **주의:** Claude CLI 모델명은 별칭을 사용합니다: `opus`, `sonnet`, `haiku` (`claude-opus-4`가 아님).

### 방법 B: claude-max-api-proxy (Max 구독 — 빌드 불필요)

소스 빌드를 하고 싶지 않을 때 사용합니다.

1. `docker-compose.claude-proxy.yml` 생성:

```yaml
services:
  claude-proxy:
    image: node:22-slim
    command: >
      sh -c "npm install -g claude-max-api-proxy @anthropic-ai/claude-code &&
             sed -i 's/host = \"127.0.0.1\"/host = \"0.0.0.0\"/' /usr/local/lib/node_modules/claude-max-api-proxy/dist/server/index.js &&
             claude-max-api"
    volumes:
      - ~/.openclaw/claude-auth:/home/node/.claude:rw
    environment:
      - HOME=/home/node
    networks:
      - goclaw-net
    restart: unless-stopped
```

> **참고:** 프록시가 `127.0.0.1`에만 바인딩하므로, `sed`로 `0.0.0.0`으로 패치해야 다른 컨테이너에서 접근 가능합니다.

2. OpenAI-compatible 프로바이더로 등록:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -H "X-GoClaw-User-Id: admin" \
  -H "Content-Type: application/json" \
  http://localhost:18800/v1/providers \
  -d '{
    "name": "claude-max-proxy",
    "provider_type": "openai_compat",
    "api_key": "sk-unused",
    "enabled": true,
    "settings": {
      "base_url": "http://claude-proxy:3456/v1",
      "models": ["claude-sonnet-4", "claude-opus-4", "claude-haiku-4"],
      "default_model": "claude-sonnet-4"
    }
  }'
```

### 방법 C: Anthropic API Key 직접 사용 (종량제)

```bash
# .env에 추가:
GOCLAW_ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

시작 시 자동으로 프로바이더가 등록됩니다. 별도 API 호출 불필요.

## 4단계: 에이전트 생성

GoClaw 채팅 API가 동작하려면 `agent_key: "default"` 에이전트가 필수입니다.

```bash
PROVIDER_ID="<3단계에서-받은-id>"

curl -s -X POST \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -H "X-GoClaw-User-Id: admin" \
  -H "Content-Type: application/json" \
  http://localhost:18800/v1/agents \
  -d "{
    \"agent_key\": \"default\",
    \"display_name\": \"Default Agent\",
    \"agent_type\": \"open\",
    \"provider\": \"$PROVIDER_ID\",
    \"model\": \"opus\",
    \"is_default\": true,
    \"enabled\": true
  }"
```

## 5단계: 워크스페이스 파일 이전

GoClaw의 `open` 에이전트는 부트스트랩 파일을 **디스크가 아닌 데이터베이스**에 저장합니다.

### 5a: WebSocket RPC로 MD 파일 시드

```python
import json, asyncio, websockets

GATEWAY_TOKEN = "<토큰>"
WS_URL = "ws://localhost:18800/ws"
OPENCLAW_WORKSPACE = "~/.openclaw/workspace"  # 경로 조정

# agents.files.set으로 시드 가능한 파일 (허용 목록)
FILES = ["SOUL.md", "AGENTS.md", "IDENTITY.md", "USER.md", "HEARTBEAT.md", "BOOTSTRAP.md"]
# 참고: GoClaw은 총 13개 부트스트랩 파일을 지원합니다.
# 추가 파일(DELEGATION.md, TEAM.md, AVAILABILITY.md)은 GoClaw 전용이므로
# OpenClaw에서 이전할 내용은 없고, GoClaw에서 새로 작성합니다.
# MEMORY.md, MEMORY.json은 허용 목록에 없어 DB 직접 삽입 필요 (5b 참고).

async def seed():
    async with websockets.connect(WS_URL, max_size=2**20) as ws:
        # 연결
        await ws.send(json.dumps({
            "type": "req", "id": "1", "method": "connect",
            "params": {"token": GATEWAY_TOKEN, "user_id": "admin"}
        }))
        await ws.recv()

        # 각 파일 시드
        for i, name in enumerate(FILES):
            try:
                with open(f"{OPENCLAW_WORKSPACE}/{name}") as f:
                    content = f.read()
            except FileNotFoundError:
                continue

            await ws.send(json.dumps({
                "type": "req", "id": str(i+10),
                "method": "agents.files.set",
                "params": {"agentId": "default", "name": name, "content": content}
            }))
            resp = json.loads(await ws.recv())
            print(f"{name}: {'OK' if resp.get('ok') else resp.get('error',{}).get('message')}")

asyncio.run(seed())
```

### 5b: MEMORY.md는 PostgreSQL에 직접 삽입

`MEMORY.md`는 `agents.files.set`의 허용 목록에 없습니다. DB에 직접 넣어야 합니다:

```bash
# 내용 읽기
MEMORY_CONTENT=$(cat ~/.openclaw/workspace/MEMORY.md)

# PostgreSQL에 삽입 (agent_id와 tenant_id 수정 필요)
docker exec -i <postgres-container> psql -U goclaw -d goclaw << SQL
INSERT INTO agent_context_files (id, tenant_id, agent_id, file_name, content, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    '0193a5b0-7000-7000-8000-000000000001'::uuid,
    '<에이전트-uuid>'::uuid,
    'MEMORY.md',
    '$(echo "$MEMORY_CONTENT" | sed "s/'/''/g")',
    now(), now()
)
ON CONFLICT (agent_id, file_name) DO UPDATE
SET content = EXCLUDED.content, updated_at = now();
SQL
```

### 5c: 워크스페이스 디렉토리 복사 (선택)

스킬, 메모리 문서 등 추가 파일:

```bash
# macOS 메타데이터 없이 tar 생성
COPYFILE_DISABLE=1 tar cf /tmp/workspace.tar -C ~/.openclaw/workspace docs/ memory/ skills/

# 권한이 있는 Alpine 컨테이너를 통해 GoClaw 워크스페이스 볼륨에 복사
docker run --rm --privileged \
  -v <goclaw-workspace-volume>:/workspace \
  -v /tmp/workspace.tar:/data/workspace.tar \
  alpine sh -c "
    cd /workspace/default &&
    tar xf /data/workspace.tar --no-same-owner &&
    chown -R 1000:1000 /workspace/default/
  "
```

## 6단계: 채널 이전

GoClaw 채널은 HTTP API를 통해 데이터베이스에 저장됩니다.

### OpenClaw에서 토큰 추출

```bash
# Slack 예시
SLACK_BOT_TOKEN=$(python3 -c "
import json
with open('$HOME/.openclaw/openclaw.json') as f:
    d = json.load(f)
print(d['channels']['slack']['botToken'])
")

SLACK_APP_TOKEN=$(python3 -c "
import json
with open('$HOME/.openclaw/openclaw.json') as f:
    d = json.load(f)
print(d['channels']['slack']['appToken'])
")
```

### GoClaw에 채널 등록

**중요:** Slack 봇은 하나의 게이트웨이에만 연결 가능합니다. OpenClaw을 먼저 중지하거나, 테스트용으로 별도의 Slack 앱을 사용하세요.

```bash
AGENT_ID="<default-에이전트-uuid>"

curl -s -X POST \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -H "X-GoClaw-User-Id: admin" \
  -H "Content-Type: application/json" \
  http://localhost:18800/v1/channels/instances \
  -d "{
    \"name\": \"slack-main\",
    \"display_name\": \"Slack\",
    \"channel_type\": \"slack\",
    \"agent_id\": \"$AGENT_ID\",
    \"credentials\": {
      \"bot_token\": \"$SLACK_BOT_TOKEN\",
      \"app_token\": \"$SLACK_APP_TOKEN\"
    },
    \"config\": {
      \"require_mention\": true,
      \"group_policy\": \"open\",
      \"dm_policy\": \"open\"
    },
    \"enabled\": true
  }"
```

### 재시작하여 채널 로드

```bash
docker restart <goclaw-container>
```

로그에서 확인:

```
slack bot connected  user_id=U0xxx  team=YourTeam
all channels started
channels=[slack-main]
```

### 지원 채널 목록

| OpenClaw 채널 | GoClaw `channel_type` | 상태 |
|--------------|----------------------|------|
| Slack | `slack` | 구현됨 (프로덕션 미검증) |
| Telegram | `telegram` | 프로덕션 검증 완료 |
| Discord | `discord` | 구현됨 (미검증) |
| WhatsApp | `whatsapp` | 구현됨 (미검증) |
| Feishu/Lark | `feishu` | 구현됨 (미검증) |
| Zalo | `zalo_oa` / `zalo_personal` | 구현됨 (미검증) |
| Line, KakaoTalk, Matrix 등 | 미지원 | OpenClaw에서만 사용 가능 |

## 7단계: OpenClaw 중지 & 검증

```bash
# OpenClaw 중지
cd ~/path-to/openclaw-docker
docker compose down

# GoClaw 상태 확인
curl http://localhost:18800/health

# 로그 확인
docker logs <goclaw-container> --tail 20

# API로 채팅 테스트
curl -s -X POST \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -H "X-GoClaw-User-Id: admin" \
  -H "Content-Type: application/json" \
  http://localhost:18800/v1/chat/completions \
  -d '{"model":"opus","messages":[{"role":"user","content":"안녕!"}]}'
```

## 8단계: MCP 서버 이전 (선택)

OpenClaw 설정에서 추출하여 GoClaw API로 등록:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -H "X-GoClaw-User-Id: admin" \
  -H "Content-Type: application/json" \
  http://localhost:18800/v1/mcp/servers \
  -d '{
    "name": "github",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": "<토큰>"}
  }'
```

---

## 트러블슈팅

### "agent not found: default"
`agent_key: "default"` 에이전트를 생성하세요. GoClaw HTTP 채팅 API에 필수입니다.

### 대시보드 "Failed to update agent"
`.env`에 `GOCLAW_OWNER_IDS=admin,system`을 설정하고 재시작하세요. `admin` 사용자에게 owner 역할이 있어야 대시보드 전체 기능을 사용할 수 있습니다.

### Claude CLI "unsupported model"
모델 별칭을 사용하세요: `opus`, `sonnet`, `haiku` (`claude-opus-4`, `claude-sonnet-4`가 아님).

### Claude CLI 401 인증 에러
OAuth 토큰(`sk-ant-oat01-...`)은 CLI를 통해서만 작동하며, API 키로 직접 사용할 수 없습니다. Claude CLI 프로바이더 또는 claude-max-api-proxy를 사용하세요.

### Slack 봇이 연결 안 됨
- OpenClaw이 중지되었는지 확인 (Slack 봇은 하나의 게이트웨이에만 연결)
- `docker logs`에서 `slack bot connected` 확인
- Bot 토큰이 `xoxb-`로, App 토큰이 `xapp-`로 시작하는지 확인

### 부트스트랩 파일이 로드 안 됨
GoClaw `open` 에이전트는 컨텍스트 파일을 **디스크가 아닌 데이터베이스**에서 읽습니다. `agents.files.set` WS RPC를 사용하거나 `agent_context_files` 테이블에 직접 삽입하세요.

### macOS tar "Permission denied"
`COPYFILE_DISABLE=1`로 macOS 확장 속성을 건너뛰고, 추출 시 `--privileged` Alpine 컨테이너를 사용하세요.

---

## 아키텍처 비교

```
OpenClaw (이전):
  Node.js → 파일 기반 상태 → ACP/subagents → Claude CLI
  ├→ 멀티 에이전트 (agents.list)
  ├→ 멀티유저 (session.dmScope: per-channel-peer)
  └→ 봇 간 위임 (subagents, sessions_spawn, agent-to-agent)

GoClaw (이후):
  Go 바이너리 → PostgreSQL → 멀티테넌트 → Claude CLI 프로바이더
  ├→ Web Dashboard (React 19)
  ├→ 에이전트 팀 & 위임 (칸반 보드 + 메일박스)
  ├→ per-user 세션 격리 (PostgreSQL)
  ├→ Model Steering (Track/Guard/Hint 3-layer)
  ├→ Knowledge Graph (LLM 엔티티 추출 + 그래프 탐색)
  ├→ Extended Thinking (Anthropic/OpenAI/DashScope)
  └→ Desktop Edition (GoClaw Lite — SQLite, Docker 불필요)
```

## 핵심 차이점 요약

### 설정 & 관리 방식

| 항목 | OpenClaw | GoClaw |
|------|----------|--------|
| 설정 형식 | `openclaw.json` | DB + `config.json` (JSON5) |
| 채널 설정 | JSON 설정 파일 | `POST /v1/channels/instances` API |
| 프로바이더 설정 | 설정 파일 | `POST /v1/providers` API |
| 에이전트 설정 | 설정 파일 | `POST /v1/agents` API |
| 컨텍스트 파일 | 디스크 (`~/.openclaw/workspace/`) | 데이터베이스 (`agent_context_files` 테이블) |
| 부트스트랩 파일 수 | 7개 (SOUL, AGENTS, IDENTITY, USER, TOOLS, HEARTBEAT, MEMORY) | 13개 (+ BOOTSTRAP, DELEGATION, TEAM, AVAILABILITY, MEMORY.json, memory.md) |
| 인증 | 게이트웨이 토큰 | 게이트웨이 토큰 + RBAC(admin/operator/viewer) + API Key 다중 발급 |
| 기본 포트 | 18789 | 18790 |

### 기능 비교 (공통 vs GoClaw 전용)

| 항목 | OpenClaw | GoClaw |
|------|----------|--------|
| 멀티 에이전트 | 가능 (`agents.list`) | 가능 (DB 기반, 무제한) |
| 봇별 워크스페이스 격리 | 가능 | 가능 (자동) |
| 봇별 모델 설정 | 가능 | 가능 |
| 봇 간 위임 | 가능 (subagents, sessions_spawn) | 가능 (sync/async + 권한 링크) |
| 멀티유저 세션 격리 | 가능 (`session.dmScope`) | 가능 (PostgreSQL per-user) |
| 에이전트별 프로바이더 | 가능 | 가능 |

| GoClaw 전용 기능 | 설명 |
|-----------------|------|
| **네이티브 Claude CLI 프로바이더** | `claude` 바이너리를 직접 subprocess로 호출하여 메인 LLM으로 사용. OpenClaw은 과거에 있었으나 제거됨 — 현재 ACP 서브에이전트 또는 외부 프록시 경유만 가능 |
| **팀 칸반 보드** | 에이전트 간 태스크 보드 + 메일박스 (프로젝트 관리형) |
| **Model Steering** | Track(Lane 스케줄링) + Guard(InputGuard, Shell Deny) + Hint(컨텍스트 가이던스) 3-layer |
| **Extended Thinking** | Anthropic budget tokens, OpenAI reasoning effort, DashScope thinking budget |
| **Knowledge Graph** | LLM 엔티티 추출, 그래프 탐색, force-directed 시각화 |
| **Agent Evolution** | predefined 에이전트의 SOUL.md 자기 진화 + skill_evolve |
| **Custom Tools** | 런타임에 셸 기반 도구 동적 생성 (JSON Schema 파라미터, 타임아웃) |
| **Desktop Edition** | GoClaw Lite — SQLite 기반, Docker 불필요, macOS/Windows 네이티브 앱 |
| **RBAC + API Key** | 팀원별 권한 분리, SHA-256 해시, 만료/철회 |
| **Web Dashboard** | GUI로 에이전트/채널/세션/트레이스/팀/스킬/MCP 관리 |
| **Tracing & 관측성** | 내장 LLM call tracing + spans + OTel OTLP export |
| **5-Layer 보안** | Gateway Auth → Global Policy → Per-Agent → Per-Channel → Owner-Only |

### 인프라 & 리소스

| 항목 | OpenClaw | GoClaw |
|------|----------|--------|
| 저장소 | 파일 기반 | PostgreSQL (멀티테넌트, AES-256-GCM 암호화) |
| RAM 사용량 | >1GB (Node.js) | ~35MB (Go 바이너리) |
| 시작 시간 | >5초 | <1초 |
| 메모리 검색 | 로컬 파일 기반 | FTS + pgvector 하이브리드 (임베딩 프로바이더 필요) |
| 관측성 | opt-in 확장 | 내장 LLM tracing + OTel |
| 프로바이더 종류 | 10+ (OpenAI-compat 중심) | 6종: Anthropic Native, OpenAI-Compat, ACP, Claude CLI, Codex, DashScope |

---

## 부록: 여러 봇 운영 환경 마이그레이션

OpenClaw에서 여러 봇을 운영하던 경우의 이전 가이드입니다.

### OpenClaw 멀티봇 구조 이해

OpenClaw에서 여러 봇을 운영하는 방식은 크게 두 가지입니다:

**방식 1: 단일 게이트웨이 + 에이전트 목록**
```json
// openclaw.json
{
  "agents": {
    "list": [
      { "id": "friday", "groupChat": { "mentionPatterns": ["프라이데이"] } },
      { "id": "jarvis", "groupChat": { "mentionPatterns": ["자비스"] } },
      { "id": "coder", "groupChat": { "mentionPatterns": ["코더"] } }
    ]
  }
}
```
각 에이전트는 `~/.openclaw/workspace/` 아래 같은 파일을 공유하거나, 에이전트별 설정을 `~/.openclaw/agents/<id>/`에 보관합니다.

**방식 2: 여러 OpenClaw 인스턴스 (Docker 컨테이너 여러 개)**
각 봇마다 별도의 Docker 컨테이너 + 별도의 Slack 앱으로 운영하는 방식입니다.

### GoClaw에서의 멀티봇 구조

GoClaw은 **하나의 게이트웨이에서 여러 에이전트**를 네이티브로 지원합니다.

```
GoClaw 게이트웨이 (단일 인스턴스)
├── 에이전트: friday (Opus, SOUL.md: 아이언맨 비서)
├── 에이전트: jarvis (Sonnet, SOUL.md: 기술 분석가)  
├── 에이전트: coder  (Opus, SOUL.md: 코딩 전문)
└── 에이전트: intern (Haiku, SOUL.md: 간단한 질문 응답)
```

각 에이전트는:
- 독립된 SOUL.md, AGENTS.md, IDENTITY.md, MEMORY.md (DB 저장)
- 독립된 워크스페이스 (`/app/workspace/<agent_key>/`)
- 독립된 프로바이더/모델 설정
- 독립된 세션 히스토리

### 이전 절차

#### 1. 봇별 에이전트 생성

OpenClaw의 각 봇에 대해 GoClaw 에이전트를 생성합니다:

```bash
GATEWAY_TOKEN="<토큰>"
PROVIDER_ID="<프로바이더-uuid>"

# 봇 1: Friday
curl -s -X POST \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -H "X-GoClaw-User-Id: admin" \
  -H "Content-Type: application/json" \
  http://localhost:18800/v1/agents \
  -d '{
    "agent_key": "friday",
    "display_name": "Friday",
    "agent_type": "open",
    "provider": "'$PROVIDER_ID'",
    "model": "opus",
    "is_default": true,
    "enabled": true
  }'

# 봇 2: Jarvis
curl -s -X POST \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -H "X-GoClaw-User-Id: admin" \
  -H "Content-Type: application/json" \
  http://localhost:18800/v1/agents \
  -d '{
    "agent_key": "jarvis",
    "display_name": "Jarvis",
    "agent_type": "open",
    "provider": "'$PROVIDER_ID'",
    "model": "sonnet",
    "enabled": true
  }'

# 봇 3: Coder (저렴한 모델로 간단한 작업)
curl -s -X POST \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -H "X-GoClaw-User-Id: admin" \
  -H "Content-Type: application/json" \
  http://localhost:18800/v1/agents \
  -d '{
    "agent_key": "coder",
    "display_name": "Coder",
    "agent_type": "open",
    "provider": "'$PROVIDER_ID'",
    "model": "haiku",
    "enabled": true
  }'
```

#### 2. 봇별 컨텍스트 파일 이전

각 봇의 SOUL.md, IDENTITY.md 등을 해당 에이전트에 시드합니다:

```python
import json, asyncio, websockets, os

GATEWAY_TOKEN = "<토큰>"
WS_URL = "ws://localhost:18800/ws"

# 봇별 파일 매핑
# OpenClaw 경로 → GoClaw agent_key
BOTS = {
    "friday": "~/.openclaw/workspace",           # 메인 봇
    "jarvis": "~/.openclaw/agents/jarvis",        # 에이전트별 폴더가 있는 경우
    "coder":  "~/.openclaw/agents/coder",
}

FILES = ["SOUL.md", "AGENTS.md", "IDENTITY.md", "USER.md", "HEARTBEAT.md"]

async def seed_all():
    async with websockets.connect(WS_URL, max_size=2**20) as ws:
        await ws.send(json.dumps({
            "type": "req", "id": "1", "method": "connect",
            "params": {"token": GATEWAY_TOKEN, "user_id": "admin"}
        }))
        await ws.recv()

        req_id = 10
        for agent_key, workspace_path in BOTS.items():
            workspace = os.path.expanduser(workspace_path)
            print(f"\n--- {agent_key} ---")
            
            for name in FILES:
                filepath = os.path.join(workspace, name)
                if not os.path.exists(filepath):
                    continue
                    
                with open(filepath) as f:
                    content = f.read()

                await ws.send(json.dumps({
                    "type": "req", "id": str(req_id),
                    "method": "agents.files.set",
                    "params": {
                        "agentId": agent_key,
                        "name": name,
                        "content": content
                    }
                }))
                resp = json.loads(await ws.recv())
                status = "OK" if resp.get("ok") else resp.get("error",{}).get("message","?")
                print(f"  {name}: {status}")
                req_id += 1

asyncio.run(seed_all())
```

#### 3. 채널-에이전트 연결

GoClaw에서는 **채널 인스턴스마다 하나의 에이전트를 연결**합니다.

**경우 A: 하나의 Slack 앱에 여러 에이전트**

기본 에이전트로 채널을 연결하고, 사용자가 멘션 패턴으로 에이전트를 선택합니다:

```bash
# 기본 에이전트(friday)에 Slack 연결
curl -s -X POST \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -H "X-GoClaw-User-Id: admin" \
  -H "Content-Type: application/json" \
  http://localhost:18800/v1/channels/instances \
  -d '{
    "name": "slack-main",
    "channel_type": "slack",
    "agent_id": "<friday-agent-uuid>",
    "credentials": { "bot_token": "xoxb-...", "app_token": "xapp-..." },
    "config": { "require_mention": true, "dm_policy": "open" },
    "enabled": true
  }'
```

다른 에이전트에게 작업을 시키려면 **에이전트 위임(delegation)**을 활용합니다:
- Friday에게 "@friday jarvis한테 이 코드 리뷰 시켜"라고 하면
- Friday가 Jarvis에게 sync/async 위임

**경우 B: 봇마다 별도의 Slack 앱**

각 Slack 앱(별도 bot token)을 별도 채널 인스턴스로 등록합니다:

```bash
# Friday 봇 - Slack App 1
curl -s -X POST ... \
  -d '{
    "name": "slack-friday",
    "channel_type": "slack",
    "agent_id": "<friday-uuid>",
    "credentials": { "bot_token": "xoxb-friday-...", "app_token": "xapp-friday-..." },
    ...
  }'

# Jarvis 봇 - Slack App 2  
curl -s -X POST ... \
  -d '{
    "name": "slack-jarvis",
    "channel_type": "slack",
    "agent_id": "<jarvis-uuid>",
    "credentials": { "bot_token": "xoxb-jarvis-...", "app_token": "xapp-jarvis-..." },
    ...
  }'
```

#### 4. 에이전트 간 위임 설정

OpenClaw에서도 `subagents`, `sessions_spawn`, `agent-to-agent` 도구로 봇 간 위임이 가능합니다.
GoClaw에서는 **권한 링크(permission links)** 기반의 더 세밀한 위임 제어를 제공합니다:

```bash
# Friday → Jarvis 위임 링크 (양방향)
curl -s -X POST \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -H "X-GoClaw-User-Id: admin" \
  -H "Content-Type: application/json" \
  http://localhost:18800/v1/agents/<friday-uuid>/links \
  -d '{
    "target_agent_id": "<jarvis-uuid>",
    "direction": "bidirectional",
    "max_concurrent": 2
  }'
```

위임 모드:
- **Sync**: Friday가 Jarvis에게 요청하고 **응답을 기다림** (빠른 조회, 팩트체크)
- **Async**: Friday가 Jarvis에게 요청하고 **다른 일을 계속 함** (긴 작업, 보고서)

#### 5. 팀 구성 (선택)

여러 에이전트를 팀으로 묶어 공유 태스크 보드를 사용할 수 있습니다:

```
팀: "dev-team"
├── friday (리더) — 작업 분배, 결과 취합
├── jarvis — 코드 리뷰, 기술 분석
└── coder — 코딩 실행
```

팀 설정은 Web Dashboard(http://localhost:18800)의 Teams 메뉴에서 GUI로 가능합니다.

### OpenClaw 멀티봇 vs GoClaw 멀티에이전트 비교

두 플랫폼 모두 단일 인스턴스에서 여러 에이전트를 운영할 수 있고, 기능적으로 많은 부분이 겹칩니다. 차이는 주로 **구현 방식**과 **운영 리소스**에 있습니다.

| 항목 | OpenClaw | GoClaw |
|------|----------|--------|
| 단일 인스턴스 멀티봇 | 가능 | 가능 |
| 봇별 Slack 앱 | 가능 (`channels.slack.accounts`) | 가능 (채널 인스턴스별) |
| 봇별 워크스페이스 | 가능 (에이전트별 격리) | 가능 (자동 격리) |
| 봇별 모델 설정 | 가능 (에이전트별 오버라이드) | 가능 |
| 봇 간 작업 위임 | 가능 (subagents, sessions_spawn, agent-to-agent) | 가능 (sync/async 위임 + 권한 링크) |
| 태스크 보드 | 세션 기반 태스크 추적 (배경 작업 모니터링) | 팀 칸반 보드 + 메일박스 (프로젝트 관리형) |
| 멀티유저 세션 격리 | 가능 (`session.dmScope: per-channel-peer`) | 가능 (PostgreSQL per-user 격리) |
| 프로바이더 | 에이전트별 설정 가능 | 에이전트별 설정 가능 |
| 저장소 | 파일 기반 | PostgreSQL (멀티테넌트, AES-256-GCM 암호화) |
| 리소스 | >1GB RAM, Node.js 런타임 필요 | ~35MB RAM, 단일 Go 바이너리 |
| RBAC | 없음 (게이트웨이 토큰만) | admin/operator/viewer + API Key 다중 발급 |
| 관측성 | opt-in 확장 | 내장 LLM tracing + OTel |

**GoClaw으로 이전하는 주요 이유:**
- **네이티브 Claude CLI 프로바이더** — OpenClaw에서 제거된 기능. 프록시 레이어 없이 CLI를 직접 메인 LLM으로 사용
- **리소스 효율** — 1GB+ → 35MB RAM으로 동일 기능
- **PostgreSQL 기반** — 파일 소실 위험 없음, AES-256-GCM 시크릿 암호화
- **RBAC + API Key** — 팀원별 권한 분리(admin/operator/viewer), 다중 키 관리
- **팀 칸반 보드** — 에이전트 간 태스크를 프로젝트 관리 수준으로 추적
- **Web Dashboard** — GUI로 에이전트/채널/세션/트레이스/팀/스킬/MCP 관리
- **Model Steering** — Track/Guard/Hint 3-layer로 에이전트 행동 세밀 제어
- **Extended Thinking** — Anthropic budget tokens 등 고급 추론 모드
- **Knowledge Graph** — 대화에서 엔티티를 추출하고 그래프로 탐색
- **Agent Evolution** — predefined 에이전트의 SOUL.md 자기 진화
- **Custom Tools** — 런타임에 셸 기반 도구 동적 생성
- **Desktop Edition** — Docker 없이 로컬에서 실행 가능한 GoClaw Lite
- **5-Layer 보안** — InputGuard, Shell Deny, Credential Scrubbing 등 종합 방어
- **LLM Tracing** — 내장 call tracing + spans + 선택적 OTel export
