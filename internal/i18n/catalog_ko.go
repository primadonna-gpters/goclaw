package i18n

func init() {
	register(LocaleKO, map[string]string{
		// Common validation
		MsgRequired:         "%s은(는) 필수입니다",
		MsgInvalidID:        "잘못된 %s ID",
		MsgNotFound:         "%s을(를) 찾을 수 없습니다: %s",
		MsgAlreadyExists:    "%s이(가) 이미 존재합니다: %s",
		MsgInvalidRequest:   "잘못된 요청: %s",
		MsgInvalidJSON:      "잘못된 JSON",
		MsgUnauthorized:     "인증되지 않음",
		MsgPermissionDenied: "권한 거부: %s",
		MsgInternalError:    "내부 오류: %s",
		MsgInvalidSlug:      "%s은(는) 유효한 슬러그여야 합니다 (소문자, 숫자, 하이픈만 허용)",
		MsgFailedToList:     "%s 목록을 가져올 수 없습니다",
		MsgFailedToCreate:   "%s을(를) 생성할 수 없습니다: %s",
		MsgFailedToUpdate:   "%s을(를) 업데이트할 수 없습니다: %s",
		MsgFailedToDelete:   "%s을(를) 삭제할 수 없습니다: %s",
		MsgFailedToSave:     "%s을(를) 저장할 수 없습니다: %s",
		MsgInvalidUpdates:   "잘못된 업데이트",

		// Agent
		MsgAgentNotFound:       "에이전트를 찾을 수 없습니다: %s",
		MsgCannotDeleteDefault: "기본 에이전트는 삭제할 수 없습니다",
		MsgUserCtxRequired:     "사용자 컨텍스트가 필요합니다",

		// Chat
		MsgRateLimitExceeded: "요청 한도 초과 — 잠시 기다려 주세요",
		MsgNoUserMessage:     "사용자 메시지를 찾을 수 없습니다",
		MsgUserIDRequired:    "user_id는 필수입니다",
		MsgMsgRequired:       "메시지는 필수입니다",

		// Channel instances
		MsgInvalidChannelType: "잘못된 channel_type",
		MsgInstanceNotFound:   "인스턴스를 찾을 수 없습니다",

		// Cron
		MsgJobNotFound:     "작업을 찾을 수 없습니다",
		MsgInvalidCronExpr: "잘못된 cron 표현식: %s",

		// Config
		MsgConfigHashMismatch: "설정이 변경되었습니다 (해시 불일치)",

		// Exec approval
		MsgExecApprovalDisabled: "실행 승인이 활성화되지 않았습니다",

		// Pairing
		MsgSenderChannelRequired: "senderId와 channel은 필수입니다",
		MsgCodeRequired:          "코드는 필수입니다",
		MsgSenderIDRequired:      "sender_id는 필수입니다",

		// HTTP API
		MsgInvalidAuth:           "잘못된 인증",
		MsgMsgsRequired:          "messages는 필수입니다",
		MsgUserIDHeader:          "X-GoClaw-User-Id 헤더는 필수입니다",
		MsgFileTooLarge:          "파일이 너무 크거나 잘못된 multipart 폼입니다",
		MsgMissingFileField:      "'file' 필드가 없습니다",
		MsgInvalidFilename:       "잘못된 파일명",
		MsgChannelKeyReq:         "channel과 key는 필수입니다",
		MsgMethodNotAllowed:      "허용되지 않는 메서드",
		MsgStreamingNotSupported: "스트리밍이 지원되지 않습니다",
		MsgOwnerOnly:             "소유자만 %s할 수 있습니다",
		MsgNoAccess:              "이 %s에 대한 접근 권한이 없습니다",
		MsgAlreadySummoning:      "에이전트가 이미 소환 중입니다",
		MsgSummoningUnavailable:  "소환을 사용할 수 없습니다",
		MsgNoDescription:         "에이전트에 재소환할 설명이 없습니다",
		MsgInvalidPath:           "잘못된 경로",

		// Scheduler
		MsgQueueFull:    "세션 대기열이 가득 찼습니다",
		MsgShuttingDown: "게이트웨이가 종료 중입니다. 잠시 후 다시 시도해 주세요",

		// Provider
		MsgProviderReqFailed: "%s: 요청 실패: %s",

		// Unknown method
		MsgUnknownMethod: "알 수 없는 메서드: %s",

		// Not implemented
		MsgNotImplemented: "%s은(는) 아직 구현되지 않았습니다",

		// Agent links
		MsgLinksNotConfigured:   "에이전트 링크가 구성되지 않았습니다",
		MsgInvalidDirection:     "방향은 outbound, inbound 또는 bidirectional이어야 합니다",
		MsgSourceTargetSame:     "소스와 대상은 서로 다른 에이전트여야 합니다",
		MsgCannotDelegateOpen:   "오픈 에이전트에게 위임할 수 없습니다 — 사전 정의된 에이전트만 위임 대상이 될 수 있습니다",
		MsgNoUpdatesProvided:    "제공된 업데이트가 없습니다",
		MsgInvalidLinkStatus:    "상태는 active 또는 disabled여야 합니다",

		// Teams
		MsgTeamsNotConfigured:   "팀이 구성되지 않았습니다",
		MsgAgentIsTeamLead:      "에이전트가 이미 팀 리더입니다",
		MsgCannotRemoveTeamLead: "팀 리더는 제거할 수 없습니다",

		// Channels
		MsgCannotDeleteDefaultInst: "기본 채널 인스턴스는 삭제할 수 없습니다",
		MsgCannotRemoveLastWriter:  "마지막 파일 관리자는 제거할 수 없습니다",

		// Skills
		MsgSkillsUpdateNotSupported: "파일 기반 스킬은 skills.update를 지원하지 않습니다",
		MsgCannotResolveSkillID:     "파일 기반 스킬의 ID를 확인할 수 없습니다",

		// Logs
		MsgInvalidLogAction: "action은 'start' 또는 'stop'이어야 합니다",

		// Config
		MsgRawConfigRequired: "raw 설정은 필수입니다",
		MsgRawPatchRequired:  "raw 패치는 필수입니다",

		// Storage / File
		MsgCannotDeleteSkillsDir: "스킬 디렉토리는 삭제할 수 없습니다",
		MsgFailedToReadFile:      "파일을 읽을 수 없습니다",
		MsgFileNotFound:          "파일을 찾을 수 없습니다",
		MsgInvalidVersion:        "잘못된 버전",
		MsgVersionNotFound:       "버전을 찾을 수 없습니다",
		MsgFailedToDeleteFile:    "삭제할 수 없습니다",

		// OAuth
		MsgNoPendingOAuth:    "대기 중인 OAuth 플로우가 없습니다",
		MsgFailedToSaveToken: "토큰을 저장할 수 없습니다",

		// Intent Classify
		MsgStatusWorking:       "🔄 요청을 처리하고 있습니다... 잠시만 기다려 주세요.",
		MsgStatusDetailed:      "🔄 요청을 처리하고 있습니다...\n%s (반복 %d회)\n실행 시간: %s\n\n잠시만 기다려 주세요 — 완료되면 응답하겠습니다.",
		MsgStatusPhaseThinking: "단계: 생각 중...",
		MsgStatusPhaseToolExec: "단계: %s 실행 중",
		MsgStatusPhaseTools:    "단계: 도구 실행 중...",
		MsgStatusPhaseCompact:  "단계: 컨텍스트 압축 중...",
		MsgStatusPhaseDefault:  "단계: 처리 중...",
		MsgCancelledReply:      "✋ 취소되었습니다. 다음에 무엇을 하시겠습니까?",
		MsgInjectedAck:         "확인했습니다. 현재 작업에 반영하겠습니다.",

		// Knowledge Graph
		MsgEntityIDRequired:       "entity_id는 필수입니다",
		MsgEntityFieldsRequired:   "external_id, name, entity_type은 필수입니다",
		MsgTextRequired:           "text는 필수입니다",
		MsgProviderModelRequired:  "provider와 model은 필수입니다",
		MsgInvalidProviderOrModel: "잘못된 provider 또는 model",

		// Builtin tool descriptions
		MsgToolReadFile:        "에이전트 워크스페이스에서 경로로 파일 내용을 읽습니다",
		MsgToolWriteFile:       "워크스페이스의 파일에 내용을 기록하며, 필요시 디렉토리를 자동 생성합니다",
		MsgToolListFiles:       "워크스페이스의 지정된 경로에 있는 파일과 디렉토리를 나열합니다",
		MsgToolEdit:            "전체 파일을 다시 쓰지 않고 기존 파일에 찾아 바꾸기 편집을 적용합니다",
		MsgToolExec:            "워크스페이스에서 셸 명령을 실행하고 stdout/stderr를 반환합니다",
		MsgToolWebSearch:       "검색 엔진(Brave 또는 DuckDuckGo)을 사용하여 웹에서 정보를 검색합니다",
		MsgToolWebFetch:        "웹 페이지 또는 API 엔드포인트를 가져와 텍스트 내용을 추출합니다",
		MsgToolMemorySearch:    "의미적 유사성을 사용하여 에이전트의 장기 메모리를 검색합니다",
		MsgToolMemoryGet:       "파일 경로로 특정 메모리 문서를 조회합니다",
		MsgToolKGSearch:        "에이전트의 지식 그래프에서 엔티티, 관계, 관찰을 검색합니다",
		MsgToolReadImage:       "비전 지원 LLM 프로바이더를 사용하여 이미지를 분석합니다",
		MsgToolReadDocument:    "문서 지원 LLM 프로바이더를 사용하여 문서(PDF, Word, Excel, PowerPoint, CSV 등)를 분석합니다",
		MsgToolCreateImage:     "이미지 생성 프로바이더를 사용하여 텍스트 프롬프트에서 이미지를 생성합니다",
		MsgToolReadAudio:       "오디오 지원 LLM 프로바이더를 사용하여 오디오 파일(음성, 음악, 소리)을 분석합니다",
		MsgToolReadVideo:       "비디오 지원 LLM 프로바이더를 사용하여 비디오 파일을 분석합니다",
		MsgToolCreateVideo:     "AI를 사용하여 텍스트 설명에서 비디오를 생성합니다",
		MsgToolCreateAudio:     "AI를 사용하여 텍스트 설명에서 음악이나 효과음을 생성합니다",
		MsgToolTTS:             "텍스트를 자연스러운 음성 오디오로 변환합니다",
		MsgToolBrowser:         "브라우저 자동화: 페이지 탐색, 요소 클릭, 폼 작성, 스크린샷 촬영",
		MsgToolSessionsList:    "모든 채널의 활성 채팅 세션을 나열합니다",
		MsgToolSessionStatus:   "특정 채팅 세션의 현재 상태와 메타데이터를 조회합니다",
		MsgToolSessionsHistory: "특정 채팅 세션의 메시지 기록을 조회합니다",
		MsgToolSessionsSend:    "에이전트를 대신하여 활성 채팅 세션에 메시지를 보냅니다",
		MsgToolMessage:         "연결된 채널(Telegram, Discord 등)에서 사용자에게 사전 메시지를 보냅니다",
		MsgToolCron:            "cron 표현식, 지정 시간 또는 간격을 사용하여 반복 작업을 예약하거나 관리합니다",
		MsgToolSpawn:           "백그라운드 작업을 위한 서브에이전트를 생성하거나 연결된 에이전트에 작업을 위임합니다",
		MsgToolSkillSearch:     "키워드나 설명으로 사용 가능한 스킬을 검색하여 관련 기능을 찾습니다",
		MsgToolUseSkill:        "스킬을 활성화하여 전문 기능을 사용합니다 (트레이싱 마커)",
		MsgToolSkillManage:     "대화 경험에서 스킬을 생성, 수정 또는 삭제합니다",
		MsgToolPublishSkill:    "스킬 디렉토리를 시스템 데이터베이스에 등록하여 검색 가능하게 합니다",
		MsgToolTeamTasks:       "팀 작업 보드에서 작업을 조회, 생성, 업데이트 및 완료합니다",

		MsgSkillNudgePostscript: "이 작업은 여러 단계를 거쳤습니다. 이 과정을 재사용 가능한 스킬로 저장할까요? **\"스킬 저장\"** 또는 **\"건너뛰기\"**로 답해 주세요.",
		MsgSkillNudge70Pct:      "[System] 반복 예산의 70%를 사용했습니다. 이 세션의 패턴을 스킬로 저장할지 고려해 보세요.",
		MsgSkillNudge90Pct:      "[System] 반복 예산의 90%를 사용했습니다. 이 세션에 재사용 가능한 패턴이 있다면 완료 전에 스킬로 저장하는 것을 고려하세요.",

		MsgInvalidRole: "잘못된 역할: 허용 값은 owner, admin, operator, member, viewer입니다",

		MsgContactIDsRequired:  "contact_ids는 필수입니다",
		MsgMergeTargetRequired: "tenant_user_id 또는 create_user 중 정확히 하나가 필요합니다",
		MsgTenantUserNotFound:  "테넌트 사용자를 찾을 수 없습니다",
		MsgTenantMismatch:      "테넌트 사용자가 이 테넌트에 속하지 않습니다",
		MsgTenantScopeRequired: "이 작업에는 테넌트 범위가 필요합니다",
	})
}
