import { useHttp } from "@/hooks/use-ws";

// --- Types ---

export interface ScanRequest {
  path: string;
}

export interface AgentPreview {
  id: string;
  workspace_path: string;
  bootstrap_files: number;
  memory_docs: number;
  skills: number;
  cron_jobs: number;
  has_env: boolean;
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

export interface ScanResult {
  agents: AgentPreview[];
  channels: ChannelPreview[];
  mcp_servers: MCPPreview[];
  env_vars: EnvVarPreview[];
  warnings: string[];
}

export interface ImportRequest {
  path: string;
  selected_agents: string[];
  include_credentials: boolean;
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
    return http.post<ImportResult>("/v1/import/openclaw/import", req);
  }

  return { scanOpenClaw, importOpenClaw };
}
