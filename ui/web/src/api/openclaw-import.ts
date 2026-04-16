import { useHttp } from "@/hooks/use-ws";

// --- Types ---

export interface ScanRequest {
  path: string;
}

export interface SkillPreview {
  slug: string;
  name: string;
  description: string;
  source: string; // "workspace" or "shared"
}

export interface AgentPreview {
  id: string;
  workspace_path: string;
  bootstrap_files: number;
  bootstrap_file_names?: string[];
  memory_docs: number;
  skills: number;
  skill_list?: SkillPreview[];
  cron_jobs: number;
  cron_job_names?: string[];
  has_env: boolean;
}

export interface AgentSelectionPayload {
  bootstrap_files: string[];
  skills: string[];
  cron_jobs: string[];
}

export interface ChannelPreview {
  name: string;
  type: string;
  agent_id: string;
  has_credential: boolean;
}

export interface MCPPreview {
  name: string;
  command: string;
  transport: string;
  env_keys: string[];
}

export interface EnvVarPreview {
  key: string;
  source_key: string;
  target_key: string;
  category: string;
}

export interface LargeDirInfo {
  agent_id: string;
  name: string;
  path: string;
  size_human: string;
  size_bytes: number;
}

export interface ScanResult {
  agents: AgentPreview[];
  channels: ChannelPreview[];
  mcp_servers: MCPPreview[];
  env_vars: EnvVarPreview[];
  large_dirs?: LargeDirInfo[];
  warnings: string[];
}

export interface ImportRequest {
  path: string;
  selected_agents: string[];
  include_credentials: boolean;
  workspace_mode: "symlink" | "copy";
  agent_selections?: Record<string, AgentSelectionPayload>;
}

export interface ImportAgentResult {
  agent_key: string;
  summary?: Record<string, number>;
  error?: string;
  skills_imported?: number;
  channels_created?: string[];
  mcp_servers_created?: string[];
}

export interface ImportResult {
  results: ImportAgentResult[];
}

// --- API hook ---

export function useOpenClawImportApi() {
  const http = useHttp();

  async function scanOpenClaw(req: ScanRequest): Promise<ScanResult> {
    return http.post<ScanResult>("/v1/import/openclaw/scan", req);
  }

  async function importOpenClaw(req: ImportRequest): Promise<ImportResult> {
    return http.post<ImportResult>("/v1/import/openclaw", req);
  }

  return { scanOpenClaw, importOpenClaw };
}
