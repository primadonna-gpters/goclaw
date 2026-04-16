import { useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, CheckCircle, XCircle, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import {
  useOpenClawImportApi,
  type ScanResult,
  type ImportResult,
  type AgentPreview,
  type EnvVarPreview,
} from "@/api/openclaw-import";
import { ROUTES } from "@/lib/constants";

type Step = "select" | "preview" | "results";

const ENV_CATEGORY_LABELS: Record<string, string> = {
  goclaw_mapped: "GoClaw mapped",
  cron_only: "Cron only",
  unknown: "Unknown",
};

interface AgentSelection {
  bootstrapFiles: Set<string>;
  skills: Set<string>;
  cronJobs: Set<string>;
}

function AgentCard({
  agent,
  selected,
  onToggle,
  selection,
  onSelectionChange,
}: {
  agent: AgentPreview;
  selected: boolean;
  onToggle: () => void;
  selection: AgentSelection;
  onSelectionChange: (sel: AgentSelection) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Defensive: ensure Set fields are always valid Sets (sel may be undefined or partial)
  const sel = selection;
  const safeSelection: AgentSelection = {
    bootstrapFiles: sel?.bootstrapFiles instanceof Set ? sel.bootstrapFiles : new Set<string>(),
    skills: sel?.skills instanceof Set ? sel.skills : new Set<string>(),
    cronJobs: sel?.cronJobs instanceof Set ? sel.cronJobs : new Set<string>(),
  };

  const toggleItem = (set: Set<string>, key: string): Set<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  return (
    <div
      className={`rounded-md border transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"
      }`}
    >
      <div className="p-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{agent.id}</p>
            <p className="text-xs text-muted-foreground truncate">{agent.workspace_path}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-xs">
                {safeSelection.bootstrapFiles.size}/{agent.bootstrap_files} files
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {agent.memory_docs} memory docs
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {safeSelection.skills.size}/{agent.skills} skills
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {safeSelection.cronJobs.size}/{agent.cron_jobs} cron jobs
              </Badge>
              {agent.has_env && (
                <Badge variant="outline" className="text-xs">has .env</Badge>
              )}
            </div>
          </div>
          {selected && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {selected && expanded && (
        <div className="border-t px-3 py-2 space-y-3 text-xs">
          {/* Bootstrap Files */}
          {(agent.bootstrap_file_names?.length ?? 0) > 0 && (
            <div>
              <p className="font-medium mb-1 text-muted-foreground">Bootstrap Files</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {agent.bootstrap_file_names?.map((name) => (
                  <label key={name} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={safeSelection.bootstrapFiles.has(name)}
                      onChange={() => onSelectionChange({
                        ...safeSelection,
                        bootstrapFiles: toggleItem(safeSelection.bootstrapFiles, name),
                      })}
                      className="h-3 w-3 accent-primary"
                    />
                    <span className="font-mono">{name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Skills */}
          {(agent.skill_list?.length ?? 0) > 0 && (
            <div>
              <p className="font-medium mb-1 text-muted-foreground">Skills</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {agent.skill_list?.map((sk) => (
                  <label key={sk.slug} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={safeSelection.skills.has(sk.slug)}
                      onChange={() => onSelectionChange({
                        ...safeSelection,
                        skills: toggleItem(safeSelection.skills, sk.slug),
                      })}
                      className="h-3 w-3 accent-primary"
                    />
                    <span className="truncate">{sk.name || sk.slug}</span>
                    {sk.source === "shared" && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">shared</Badge>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Cron Jobs */}
          {(agent.cron_job_names?.length ?? 0) > 0 && (
            <div>
              <p className="font-medium mb-1 text-muted-foreground">Cron Jobs</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {agent.cron_job_names?.map((name) => (
                  <label key={name} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={safeSelection.cronJobs.has(name)}
                      onChange={() => onSelectionChange({
                        ...safeSelection,
                        cronJobs: toggleItem(safeSelection.cronJobs, name),
                      })}
                      className="h-3 w-3 accent-primary"
                    />
                    <span className="font-mono truncate">{name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EnvVarGroup({ vars, category }: { vars: EnvVarPreview[]; category: string }) {
  if (vars.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {ENV_CATEGORY_LABELS[category] ?? category} ({vars.length})
      </p>
      <div className="rounded-md border divide-y text-xs font-mono">
        {vars.map((v) => (
          <div key={v.key} className="px-3 py-1.5 flex items-center gap-2">
            <span className="text-muted-foreground flex-1 truncate">{v.source_key}</span>
            {v.source_key !== v.target_key && (
              <>
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{v.target_key}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentResultRow({ result }: { result: ImportResult["results"][number] }) {
  const isError = !!result.error;
  return (
    <div className={`rounded-md border p-3 space-y-1 ${isError ? "border-destructive/40 bg-destructive/5" : "border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20"}`}>
      <div className="flex items-center gap-2">
        {isError ? (
          <XCircle className="h-4 w-4 text-destructive shrink-0" />
        ) : (
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
        )}
        <span className="text-sm font-medium font-mono">{result.agent_key}</span>
      </div>
      {isError && (
        <p className="text-xs text-destructive pl-6">{result.error}</p>
      )}
      {!isError && result.summary && (
        <div className="pl-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {Object.entries(result.summary).map(([k, v]) => (
            <span key={k}>{k}: {v}</span>
          ))}
          {(result.skills_imported ?? 0) > 0 && (
            <span>skills: {result.skills_imported}</span>
          )}
          {(result.channels_created?.length ?? 0) > 0 && (
            <span>channels: {result.channels_created!.join(", ")}</span>
          )}
          {(result.mcp_servers_created?.length ?? 0) > 0 && (
            <span>mcp: {result.mcp_servers_created!.join(", ")}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function ImportOpenClawPage() {
  const navigate = useNavigate();
  const { scanOpenClaw, importOpenClaw } = useOpenClawImportApi();

  const [step, setStep] = useState<Step>("select");
  const [sourcePath, setSourcePath] = useState("~/.openclaw");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [agentSelections, setAgentSelections] = useState<Record<string, AgentSelection>>({});
  const [includeCredentials, setIncludeCredentials] = useState(true);
  const [workspaceMode, setWorkspaceMode] = useState<"symlink" | "copy">("symlink");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleScan = async () => {
    setScanError("");
    setScanning(true);
    try {
      const result = await scanOpenClaw({ path: sourcePath });
      setScanResult(result);
      setSelectedAgents(new Set(result.agents.map((a) => a.id)));
      // Initialize per-agent selections with everything selected by default
      const sels: Record<string, AgentSelection> = {};
      for (const a of result.agents) {
        sels[a.id] = {
          bootstrapFiles: new Set(a.bootstrap_file_names ?? []),
          skills: new Set((a.skill_list ?? []).map((s) => s.slug)),
          cronJobs: new Set(a.cron_job_names ?? []),
        };
      }
      setAgentSelections(sels);
      setStep("preview");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Scan failed";
      setScanError(msg);
    } finally {
      setScanning(false);
    }
  };

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (!scanResult) return;
    setImportError("");
    setImporting(true);
    try {
      // Build agent_selections from Sets for only the selected agents
      const selections: Record<
        string,
        { bootstrap_files: string[]; skills: string[]; cron_jobs: string[] }
      > = {};
      for (const id of selectedAgents) {
        const sel = agentSelections[id];
        if (!sel) continue;
        selections[id] = {
          bootstrap_files: Array.from(sel.bootstrapFiles),
          skills: Array.from(sel.skills),
          cron_jobs: Array.from(sel.cronJobs),
        };
      }
      const result = await importOpenClaw({
        path: sourcePath,
        selected_agents: Array.from(selectedAgents),
        include_credentials: includeCredentials,
        workspace_mode: workspaceMode,
        agent_selections: selections,
      });
      setImportResult(result);
      setStep("results");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setImportError(msg);
    } finally {
      setImporting(false);
    }
  };

  const envByCategory = (category: string) =>
    scanResult?.env_vars.filter((v) => v.category === category) ?? [];

  const successCount = importResult?.results.filter((r) => !r.error).length ?? 0;
  const errorCount = importResult?.results.filter((r) => !!r.error).length ?? 0;

  return (
    <div className="p-4 sm:p-6 pb-10 space-y-6">
      <PageHeader
        title="Import from OpenClaw"
        description="Migrate agents, channels, MCP servers and environment variables from an OpenClaw installation."
      />

      {/* Step indicator */}
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2 text-sm mb-6">
          {(["select", "preview", "results"] as Step[]).map((s, i) => {
            const labels = ["1. Source", "2. Preview", "3. Results"];
            const isActive = step === s;
            const isDone =
              (s === "select" && (step === "preview" || step === "results")) ||
              (s === "preview" && step === "results");
            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <span
                  className={
                    isActive
                      ? "font-semibold text-foreground"
                      : isDone
                      ? "text-muted-foreground line-through"
                      : "text-muted-foreground"
                  }
                >
                  {labels[i]}
                </span>
              </div>
            );
          })}
        </div>

        {/* Step 1: Source selection */}
        {step === "select" && (
          <div className="space-y-4">
            <div className="rounded-md border p-4 space-y-4">
              <div>
                <Label htmlFor="source-path">OpenClaw installation path</Label>
                <p className="text-xs text-muted-foreground mb-1.5">
                  Path to the OpenClaw data directory on the server
                </p>
                <div className="flex gap-2">
                  <Input
                    id="source-path"
                    value={sourcePath}
                    onChange={(e) => setSourcePath(e.target.value)}
                    placeholder="~/.openclaw"
                    className="font-mono text-base md:text-sm flex-1"
                    disabled={scanning}
                  />
                  <Button onClick={handleScan} disabled={scanning || !sourcePath.trim()}>
                    {scanning ? "Scanning…" : "Scan"}
                  </Button>
                </div>
              </div>
              {scanError && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{scanError}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Preview & selection */}
        {step === "preview" && scanResult && (
          <div className="space-y-6">
            {/* Warnings — only show for selected agents + non-agent warnings */}
            {(() => {
              const filtered = scanResult.warnings.filter((w) => {
                const match = w.match(/^\[([^\]]+)\]/);
                if (!match || !match[1]) return true;
                return selectedAgents.has(match[1]);
              });
              if (filtered.length === 0) return null;
              return (
                <div className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium">Warnings</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {filtered.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })()}

            {/* Agents */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Agents ({scanResult.agents.length})
                </h3>
                <div className="flex gap-2 text-xs">
                  <button
                    className="text-primary hover:underline"
                    onClick={() => setSelectedAgents(new Set(scanResult.agents.map((a) => a.id)))}
                  >
                    Select all
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    className="text-primary hover:underline"
                    onClick={() => setSelectedAgents(new Set())}
                  >
                    Deselect all
                  </button>
                </div>
              </div>
              {scanResult.agents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No agents found.</p>
              ) : (
                <div className="space-y-2">
                  {scanResult.agents.map((agent) => {
                    const sel = agentSelections[agent.id] ?? {
                      bootstrapFiles: new Set<string>(),
                      skills: new Set<string>(),
                      cronJobs: new Set<string>(),
                    };
                    return (
                      <AgentCard
                        key={agent.id}
                        agent={agent}
                        selected={selectedAgents.has(agent.id)}
                        onToggle={() => toggleAgent(agent.id)}
                        selection={sel}
                        onSelectionChange={(newSel) =>
                          setAgentSelections((prev) => ({ ...prev, [agent.id]: newSel }))
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Channels */}
            {scanResult.channels.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Channels ({scanResult.channels.length})
                </h3>
                <div className="rounded-md border divide-y text-sm">
                  {scanResult.channels.map((ch, i) => (
                    <div key={i} className="px-3 py-2 flex items-center gap-3">
                      <span className="font-medium flex-1 truncate">{ch.name}</span>
                      <Badge variant="outline" className="text-xs">{ch.type}</Badge>
                      {ch.has_credential && (
                        <Badge variant="secondary" className="text-xs">has credential</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MCP Servers */}
            {scanResult.mcp_servers.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">
                  MCP Servers ({scanResult.mcp_servers.length})
                </h3>
                <div className="rounded-md border divide-y text-sm">
                  {scanResult.mcp_servers.map((mcp, i) => (
                    <div key={i} className="px-3 py-2 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{mcp.name}</span>
                        <Badge variant="outline" className="text-xs">{mcp.transport}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono truncate">{mcp.command}</p>
                      {(mcp.env_keys?.length ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          env: {mcp.env_keys?.join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Environment variables */}
            {scanResult.env_vars.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">
                  Environment Variables ({scanResult.env_vars.length})
                </h3>
                <EnvVarGroup vars={envByCategory("goclaw_mapped")} category="goclaw_mapped" />
                <EnvVarGroup vars={envByCategory("cron_only")} category="cron_only" />
                <EnvVarGroup vars={envByCategory("unknown")} category="unknown" />
              </div>
            )}

            {/* Options */}
            <div className="rounded-md border p-4 space-y-3">
              <h3 className="text-sm font-semibold">Options</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Include credentials</p>
                  <p className="text-xs text-muted-foreground">
                    Import channel tokens and API keys stored in the OpenClaw vault
                  </p>
                </div>
                <Switch
                  checked={includeCredentials}
                  onCheckedChange={setIncludeCredentials}
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-sm font-medium">Large directory handling</p>
                <p className="text-xs text-muted-foreground">
                  How to handle large workspace directories (operations, archives, assets, etc.)
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`flex-1 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      workspaceMode === "symlink"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                    onClick={() => setWorkspaceMode("symlink")}
                  >
                    <span className="font-medium">Symlink</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Saves disk space. OpenClaw directory must be kept.
                    </p>
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      workspaceMode === "copy"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                    onClick={() => setWorkspaceMode("copy")}
                  >
                    <span className="font-medium">Copy</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Independent. OpenClaw can be fully removed after.
                    </p>
                  </button>
                </div>
              </div>
            </div>

            {importError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{importError}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("select")}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || selectedAgents.size === 0}
              >
                {importing
                  ? "Migrating…"
                  : `Start Migration (${selectedAgents.size} agent${selectedAgents.size === 1 ? "" : "s"})`}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {step === "results" && importResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {errorCount === 0 ? (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-5 w-5" />
                  <span className="text-sm font-medium">
                    Migration complete — {successCount} agent{successCount === 1 ? "" : "s"} imported
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="text-sm font-medium">
                    {successCount} succeeded, {errorCount} failed
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {importResult.results.map((r, i) => (
                <AgentResultRow key={i} result={r} />
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("select");
                  setScanResult(null);
                  setImportResult(null);
                  setSelectedAgents(new Set());
                }}
              >
                Import more
              </Button>
              <Button onClick={() => navigate(ROUTES.AGENTS)}>
                Go to Agents
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
