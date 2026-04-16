export type AgentStatus = 'idle' | 'typing' | 'tool' | 'cron' | 'error';

export interface AgentState {
  id: string;
  name: string;
  status: AgentStatus;
  sprite: string;
  detail?: string;
  session_count: number;
  last_activity: string;
}

export interface PixelEvent {
  type: 'snapshot' | 'agent_status' | 'agent_added' | 'agent_removed' | 'activity' | 'cron_fire';
  agents?: AgentState[];
  agent_id?: string;
  agent?: AgentState;
  status?: AgentStatus;
  detail?: string;
  message?: string;
  ts?: string;
}
