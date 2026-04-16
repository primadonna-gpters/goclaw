# Claude Max 구독 하나로 팀 전체가 쓰는 Slack 봇 만들기 — OpenClaw에서 GoClaw으로 이전한 이야기

## 시작은 "일단 동작만 하면 된다"였다

저는 Slack에 **Friday**라는 AI 비서를 띄워 쓰고 있었습니다. 회의록 정리, 코드 리뷰, 레포 문서 요약 같은 걸 시키는 용도로요. 처음에는 제 개인 비서로만 썼고, 그땐 OpenClaw가 딱 맞았습니다.

- Node.js로 돌아가는 게이트웨이
- Slack에 연결
- Claude Max 구독을 API처럼 쓰게 해주는 프록시
- 설정 파일 하나로 끝

Docker로 띄워놓고 잊어버리면 되는, **1인용** 세팅이었어요. 6개월 정도 잘 썼습니다.

## 문제는 "팀원들도 같이 쓰고 싶다"에서 시작됐다

팀원이 "나도 Slack에서 Friday한테 일 시키고 싶은데"라고 한 게 발단이었습니다. 별것 아닐 줄 알았죠. **allowlist**에 Slack user ID 하나만 추가하면 되겠거니 했습니다.

```json
"allowFrom": ["U09V6BG8V25"]  // 내 ID만
```

여기에 팀원 ID를 추가했습니다. 동작은 했어요. 그런데 이상한 일이 벌어졌습니다.

**A가 "보고서 정리해줘"라고 했는데 B한테 "코드 리뷰"했던 맥락이 섞여서 답이 나왔습니다.** Friday가 누가 시킨 일인지 구분을 못 하는 거예요. 대화 세션이 전부 한 덩어리였습니다.

OpenClaw에 `session.dmScope: per-channel-peer`라는 옵션이 있긴 한데, 이걸 켠다고 해서 근본적인 문제가 해결되진 않았습니다. 파일 기반 상태 저장이라 동시에 여러 명이 쓰면 경쟁 조건(race condition)이 생기고, 메모리는 여전히 공용이었어요.

그리고 한 가지 더. Node.js 프로세스가 **메모리를 1GB 넘게 먹고 있었습니다**. 제 Mac mini에서 돌리기엔 부담이었어요.

## GoClaw을 발견하다

구글링하다 우연히 [GoClaw](https://github.com/nextlevelbuilder/goclaw)을 발견했습니다. OpenClaw을 Go로 다시 쓴 프로젝트였어요. README에 이렇게 써 있었습니다:

> "Multi-tenant PostgreSQL · Single 25MB binary · <1s startup · $5 VPS"

눈에 띄는 문구는 **Multi-tenant PostgreSQL**이었습니다. 이거면 "같은 Slack 채널에서 여러 명이 써도 각자 자기 대화로 격리되는" 기능이 네이티브로 지원된다는 얘기였거든요.

RAM 사용량도 **35MB**라고 적혀 있었습니다. 1GB+ 대비 압도적이죠.

"좋아, 한번 해보자." 결심하기까지 30초 걸렸습니다.

## 마이그레이션은 "30분이면 끝난다"고 적혀 있었다

공식 문서엔 30분이면 충분하다고 했습니다. 결론부터 말하면, **실제로는 3시간 넘게 걸렸습니다.** 공식 문서에 없던 함정을 몇 개나 밟았거든요. 하나씩 써볼게요.

### 함정 1: "Claude Max 구독은 그대로 쓸 수 있다" — 반만 맞았다

저는 Claude Max 구독으로 돌리고 있었어요. OpenClaw은 `claude-max-api-proxy`라는 걸 백그라운드로 띄워서, Claude Code CLI를 OpenAI 호환 API로 감싸서 사용합니다. 제 OAuth 토큰(`sk-ant-oat01-...`)이 이 프록시에 저장되어 있었고요.

GoClaw도 같은 방식이 되겠지 싶어서 `.env`에 이 OAuth 토큰을 `GOCLAW_ANTHROPIC_API_KEY`로 넣었습니다.

```
GOCLAW_ANTHROPIC_API_KEY=sk-ant-oat01-...
```

결과: **401 Unauthorized.**

알고 보니 OAuth 토큰은 Claude Code CLI가 내부적으로 쓰는 것일 뿐, **Anthropic 공식 API에선 받아주지 않았습니다.** 종량제 API 키(`sk-ant-api03-...`)와 완전히 다른 물건이에요.

여기서 두 가지 선택지가 있었습니다:
1. 종량제 API 키를 새로 발급받아서 쓴다 → **월 구독료 + 사용료 이중 지출**
2. `claude-max-api-proxy`를 GoClaw에서도 쓴다 → **복잡도 증가**

저는 2번을 선택했어요. 별도 Docker 컨테이너로 프록시를 띄우고, GoClaw에서 OpenAI 호환 엔드포인트로 연결하는 방식입니다.

### 함정 2: 프록시가 127.0.0.1에만 바인딩한다

프록시 컨테이너를 띄웠는데, GoClaw에서 접근이 안 됐습니다.

```
Error: connection refused
```

`claude-max-api-proxy`의 소스를 까봤더니 이런 코드가 있더군요:

```js
const { port, host = "127.0.0.1" } = config;
```

`127.0.0.1`에 **하드코딩**되어 있었습니다. CLI 플래그로 바꿀 방법도 없었어요. 할 수 없이 Docker Compose에서 `sed`로 소스를 패치하는 꼼수를 썼습니다:

```yaml
command: >
  sh -c "npm install -g claude-max-api-proxy &&
         sed -i 's/host = \"127.0.0.1\"/host = \"0.0.0.0\"/' ...server/index.js &&
         claude-max-api"
```

이런 건 문서에 안 적혀 있죠. 직접 부딪혀야 알 수 있는 것들입니다.

### 함정 3: 모델 이름이 다르다

GoClaw에서 에이전트를 만들고 모델로 `claude-opus-4-6`을 지정했더니:

```
Error: unsupported model "claude-opus-4-6" (valid: sonnet, opus, haiku)
```

Claude CLI는 **별칭**만 받습니다. `opus`, `sonnet`, `haiku`. 이게 제일 허무한 실수였어요. 문서에도 잘 안 나와 있는 부분입니다.

### 함정 4: 부트스트랩 파일이 디스크에서 안 읽힌다

Friday의 인격(SOUL.md), 메모리(MEMORY.md), 아이덴티티(IDENTITY.md) 같은 파일을 워크스페이스 디렉토리에 복사해 넣었습니다. OpenClaw에선 이렇게 했었거든요.

그런데 Friday가 완전히 초기화됐습니다. 자기 이름도 몰랐고, 저를 "누구냐"고 물었어요. **"안녕! 나는 이제 막 깨어난 참이야 😄"**

알고 보니 GoClaw의 `open` 타입 에이전트는 **디스크가 아닌 PostgreSQL에서** 부트스트랩 파일을 읽습니다. 디스크에 복사해봤자 쳐다보지도 않아요. `agent_context_files` 테이블에 직접 집어넣거나, WebSocket RPC로 전송해야 합니다.

```python
await ws.send(json.dumps({
    "method": "agents.files.set",
    "params": {"agentId": "default", "name": "SOUL.md", "content": content}
}))
```

그리고 함정 안의 함정이 있었어요. `MEMORY.md`는 이 API에서 **허용되지 않는 파일명**이었습니다. 소스를 까보니 허용 목록에 `MEMORY.json`만 있고 `MEMORY.md`는 없더라고요. 결국 PostgreSQL에 직접 INSERT를 해야 했습니다.

한글이 포함된 4KB짜리 MEMORY.md를 SQL에 바로 넣으려니 따옴표 escape 지옥에 빠지고... Python 스크립트로 쿼리를 조립하고 docker exec로 psql에 파이프로 쏴서 겨우 넣었습니다.

이 과정에서 배운 교훈: **파일은 디스크에 있지만 실제 "에이전트의 뇌"는 DB에 있다.** GoClaw의 메인 아키텍처 결정 중 하나입니다.

### 함정 5: 대시보드에서 에이전트 설정 저장이 안 된다

Web Dashboard에서 에이전트의 모델을 바꾸고 Save를 누르니:

```
Failed to update agent
Something went wrong. Please try again later.
```

서버 로그엔 에러가 안 찍히고, 클라이언트 쪽에만 메시지가 떴어요. 한참 뒤에 알아낸 원인은 **RBAC 권한 문제**였습니다. `admin` 사용자가 기본적으로 **owner 역할이 아니었습니다.** 환경변수로 지정해야 했어요:

```bash
GOCLAW_OWNER_IDS=admin,system
```

이건 어디에도 안 적혀 있었습니다. 직접 소스를 읽어서 알아냈어요.

### 함정 6: Slack 봇은 하나의 게이트웨이에만 연결된다

OpenClaw과 GoClaw을 **병렬로** 띄워서 Slack 연결을 테스트하려 했습니다. 결과는? **Slack 봇이 두 곳 모두에 연결을 시도하다가 혼란에 빠졌습니다.** 어디에 응답해야 할지 모르는 거죠.

Slack Socket Mode의 특성상 하나의 앱 토큰은 하나의 게이트웨이에만 연결 가능합니다. 병렬 운영이 불가능하다는 얘기였어요. OpenClaw을 완전히 끄고 나서야 GoClaw이 정상적으로 Slack 메시지를 받기 시작했습니다.

"병렬 운영으로 다운타임 없이 이전" 전략이 부분적으로만 가능했다는 얘깁니다. Slack 같은 Socket Mode 채널은 결국 순단이 생길 수밖에 없어요.

## 이전 후: 달라진 것들

우여곡절 끝에 이전이 끝났고, **"넌 누구야?"**라고 물었을 때 Friday가 이렇게 답했습니다:

> "Sir(현진우님)의 AI 어시스턴트 Friday입니다 🖤"

그 순간의 안도감이 지금도 생생합니다.

이전 후 달라진 것들:

**1. 리소스 사용량이 30배 줄었다**
- OpenClaw: 1.2GB RAM
- GoClaw: 38MB RAM

Mac mini의 팬이 잠잠해졌습니다.

**2. 팀원들이 각자의 Friday를 쓴다**
같은 Slack 채널에서 A와 B가 동시에 다른 질문을 해도, 각자의 맥락이 독립적으로 유지됩니다. A의 회의록 정리 대화와 B의 PR 리뷰 대화가 섞이지 않아요. PostgreSQL 멀티테넌트의 힘입니다.

**3. 에이전트를 여러 개 만들 수 있다**
Friday 외에도 코드 리뷰 전문 **Jarvis**, 간단한 질문용 **Haiku 봇**을 추가했습니다. 각자 다른 모델, 다른 인격, 다른 워크스페이스. 대시보드에서 GUI로 관리합니다.

**4. Web Dashboard가 있다**
OpenClaw은 CLI 기반이라 설정 변경마다 json 파일을 편집해야 했는데, GoClaw은 React로 만든 대시보드에서 모든 걸 할 수 있습니다. 에이전트 편집, 채널 관리, 세션 히스토리, LLM 트레이스까지요.

## 배운 점

3시간의 시행착오에서 얻은 교훈입니다.

**1. "공식 문서 30분"은 이상적인 경우다**
어떤 마이그레이션 가이드든 실제로는 1.5~3배 걸린다고 생각해야 합니다. 특히 내 환경에 특수한 조건(Claude Max 구독, 기존 인증 토큰, 기존 워크스페이스 파일)이 있으면 더 그렇죠.

**2. OAuth 토큰 ≠ API 키**
Claude Max 구독으로 돌릴 수 있다는 말은 "CLI를 통해서만" 가능하다는 뜻이었어요. 직접 API로는 안 됩니다. 구독만 쓰려면 CLI를 중간에 끼워야 해요.

**3. 데이터의 실제 위치를 확인해라**
"파일로 보이는 것"이 실제로 파일에 저장된 건지 DB에 저장된 건지 확인해야 합니다. GoClaw은 파일처럼 보이지만 실체는 DB 레코드였어요. 이걸 모르고 디스크에 복사해봤자 소용없었습니다.

**4. 권한 설정은 환경변수를 먼저 확인해라**
대시보드 에러가 나면 RBAC 관련 환경변수부터 확인하는 게 빠릅니다. 로그에 안 찍히는 에러가 꽤 있어요.

**5. 마이그레이션의 진짜 비용은 "학습 시간"이다**
전환 자체는 명령어 몇 줄이지만, 새 시스템의 **멘탈 모델**을 형성하는 게 진짜 비용입니다. GoClaw의 부트스트랩 파일 시스템, RBAC, 에이전트 타입, 채널 인스턴스 같은 개념을 이해하는 데 이틀 걸렸어요.

## 지금 쓰고 있는 구조

현재는 이렇게 돌아가고 있습니다:

```
┌─ Mac mini (집) ───────────────────────────────────┐
│                                                   │
│  Docker Compose:                                  │
│  ├─ goclaw (게이트웨이, 38MB RAM)                 │
│  ├─ postgres (pgvector, 멀티테넌트)               │
│  └─ claude-proxy (Max 구독 → OpenAI-compat)       │
│                                                   │
│  → Slack Socket Mode                              │
│  → Friday / Jarvis / Haiku 봇 3종                 │
│  → 팀원 5명이 각자 독립 세션                      │
└───────────────────────────────────────────────────┘
```

Claude Max 구독료 월 $20으로, 팀 전체가 여러 에이전트를 쓸 수 있습니다. API 종량제 비용은 0원이에요.

## 누구에게 추천하나

**이런 분들에게 GoClaw을 추천합니다:**
- 팀에서 Slack 봇으로 AI 에이전트를 같이 쓰고 싶은 분
- Claude Max 구독료만으로 API 사용을 하고 싶은 분
- 에이전트마다 다른 인격/모델을 주고 싶은 분
- 운영 리소스를 최소화하고 싶은 분 (VPS $5짜리에서도 돌아갑니다)

**이런 분들은 다시 생각해보세요:**
- 혼자 쓸 거면 OpenClaw로 충분합니다. 굳이 이전할 필요 없어요.
- Slack/Telegram 외 채널(Line, KakaoTalk, Matrix 등)이 필수면 OpenClaw이 더 많이 지원합니다.
- Docker/PostgreSQL 운영 경험이 전혀 없으면 초기 학습 비용이 큽니다.

## 마무리

기술 선택은 결국 **"무엇을 최적화하고 싶은가"**의 문제입니다. 저는 **"팀원들이 각자의 AI 비서를 독립적으로 쓸 수 있다"**는 걸 최적화하고 싶었고, GoClaw이 그걸 가장 잘 해줬습니다.

3시간의 삽질은 분명 뼈아팠지만, 지금 돌아보면 "내 시스템이 어떻게 동작하는지 제대로 이해하게 된" 유익한 시간이었어요. 마이그레이션 가이드를 따라 하는 것보다 한 번 부딪혀보는 게 훨씬 오래 남습니다.

함께 부딪혀볼 분들을 위해 마이그레이션 가이드를 따로 정리했습니다:
→ https://feel-nextel-civil-receptors.trycloudflare.com

혹시 같은 여정을 해보신 분, 또는 준비 중이신 분이 있으면 GPTers 디스코드로 편하게 얘기 나누면 좋겠습니다.

---

*이 글에 등장한 "Friday"는 제 실제 Slack 봇입니다. 이 글도 Friday가 초안을 잡는 걸 도와줬어요.* 🖤
