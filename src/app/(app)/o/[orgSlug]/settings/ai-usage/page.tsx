import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/domain/auth/permissions";
import { workspaceFormat } from "@/features/workspace/format";
import { requireWorkspace } from "@/server/auth/context";
import { serverEnv } from "@/server/env";

export const metadata: Metadata = { title: "AI usage" };

const OUTCOME: Record<string, string> = {
  started: "In progress",
  succeeded: "Succeeded",
  failed: "Failed",
};

function dayAgo() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

export default async function AiUsagePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { supabase, workspace } = await requireWorkspace(
    orgSlug,
    `/o/${orgSlug}/settings/ai-usage`,
  );
  if (!can(workspace.role, "settings.change")) {
    return (
      <Card>
        <NoPermissionState roleNeeded="Owner or Admin" action="see AI usage" />
      </Card>
    );
  }
  const env = serverEnv();
  const since = dayAgo();
  const [{ count: today }, { data: events }] = await Promise.all([
    supabase
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", workspace.id)
      .gt("created_at", since),
    supabase
      .from("ai_usage_events")
      .select(
        "id, provider, model, outcome, error_code, pages, total_tokens, duration_ms, created_at",
      )
      .eq("organization_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const fmt = workspaceFormat(workspace);
  const provider =
    env.AI_EXTRACTION_PROVIDER === "gemini"
      ? `Google Gemini (${env.GEMINI_MODEL})${env.GEMINI_API_KEY ? "" : ", API key not set"}`
      : "Simulated (fictional fixtures only, no AI calls)";

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <PageHeader
        title="AI usage"
        description="Calls to the AI extraction provider. Limits keep usage within the provider's free tier; when a limit is reached, documents wait or can be entered manually. No document content is stored here."
      />
      <Card>
        <CardHeader>
          <CardTitle>Provider and limits</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-small sm:grid-cols-2">
            <div>
              <dt className="text-subtle-foreground">Extraction provider</dt>
              <dd className="font-medium text-navy-900" data-testid="ai-provider">
                {provider}
              </dd>
            </div>
            <div>
              <dt className="text-subtle-foreground">This workspace, last 24 hours</dt>
              <dd className="font-medium text-navy-900" data-testid="ai-usage-today">
                {today ?? 0} of {env.AI_MAX_REQUESTS_PER_WORKSPACE_PER_DAY} calls
              </dd>
            </div>
            <div>
              <dt className="text-subtle-foreground">All workspaces</dt>
              <dd className="font-medium text-navy-900">
                {env.AI_MAX_REQUESTS_PER_MINUTE} calls a minute, {env.AI_MAX_REQUESTS_PER_DAY} a day
              </dd>
            </div>
            <div>
              <dt className="text-subtle-foreground">Documents sent to AI</dt>
              <dd className="font-medium text-navy-900">
                Up to {env.AI_MAX_PAGES} pages and{" "}
                {Math.round(env.AI_MAX_DOCUMENT_BYTES / (1024 * 1024))} MB
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent calls</CardTitle>
        </CardHeader>
        <CardContent>
          {events && events.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="text-right">Pages</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Seconds</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">
                        {fmt.dateTime(e.created_at)}
                      </TableCell>
                      <TableCell className="font-mono text-small">{e.model}</TableCell>
                      <TableCell>
                        {OUTCOME[e.outcome] ?? e.outcome}
                        {e.error_code ? (
                          <span className="block font-mono text-caption text-subtle-foreground">
                            {e.error_code}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{e.pages ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e.total_tokens ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e.duration_ms == null ? "—" : (e.duration_ms / 1000).toFixed(1)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-small text-subtle-foreground" data-testid="ai-usage-empty">
              No AI calls yet. With the simulated provider, extraction never calls an AI service.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
