"use client";

import { MailPlus, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { NoPermissionState } from "@/components/states/no-permission-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { can } from "@/domain/auth/permissions";
import { ROLE_LABELS } from "@/domain/auth/roles";

import { INTAKES, PENDING_INVITATIONS, USERS, WORKSPACE } from "../fixtures";
import { FictionalBadge } from "../components/fictional-badge";
import { PhaseDialog } from "../components/phase-dialog";
import { fmt } from "../format";
import { previewOnly } from "../notify";
import { usePersona } from "../persona";

function Field({
  id,
  label,
  help,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {help ? (
        <p id={`${id}-help`} className="text-caption text-subtle-foreground">
          {help}
        </p>
      ) : null}
    </div>
  );
}

export function SettingsScreen() {
  const { role } = usePersona();
  const [workspace, setWorkspace] = useState({
    name: WORKSPACE.name,
    prefix: WORKSPACE.salesOrderPrefix,
  });
  const [rules, setRules] = useState({
    independent: WORKSPACE.requireIndependentApproval,
    tolerance: WORKSPACE.priceTolerancePct,
    threshold: String(Math.round(WORKSPACE.confidenceThreshold * 100)),
    lookback: String(WORKSPACE.duplicateLookbackDays),
  });

  if (!can(role, "settings.change")) {
    return <NoPermissionState roleNeeded="Owner or Admin" action="change workspace settings" />;
  }

  const saveNote =
    "In the product, saving requires MFA and is recorded in the audit log with old and new values. Nothing was saved.";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Settings"
        description={`Workspace settings for ${WORKSPACE.name}.`}
        meta={<FictionalBadge />}
      />
      <Tabs defaultValue="workspace">
        <TabsList>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="rules">Order rules</TabsTrigger>
        </TabsList>

        <TabsContent value="workspace">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Workspace</CardTitle>
                <CardDescription>Identity, currency and formatting.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field id="ws-name" label="Workspace name">
                <Input
                  id="ws-name"
                  value={workspace.name}
                  onChange={(e) => setWorkspace({ ...workspace, name: e.target.value })}
                />
              </Field>
              <Field id="ws-legal" label="Legal name">
                <Input id="ws-legal" value={WORKSPACE.legalName} readOnly />
              </Field>
              <Field
                id="ws-currency"
                label="Base currency"
                help={`Locked: ${INTAKES.length} customer POs exist. The Owner can change it only before the first one.`}
              >
                <Input
                  id="ws-currency"
                  value={WORKSPACE.currency}
                  readOnly
                  aria-describedby="ws-currency-help"
                />
              </Field>
              <Field
                id="ws-tz"
                label="Time zone"
                help="All times are shown in this time zone and stored in UTC."
              >
                <Input
                  id="ws-tz"
                  value={WORKSPACE.timeZone}
                  readOnly
                  aria-describedby="ws-tz-help"
                />
              </Field>
              <Field
                id="ws-locale"
                label="Number and date format"
                help={`For example ${fmt.date("2026-10-14")} and ${fmt.money("1240.50")}.`}
              >
                <Input
                  id="ws-locale"
                  value={WORKSPACE.locale}
                  readOnly
                  aria-describedby="ws-locale-help"
                />
              </Field>
              <Field
                id="ws-prefix"
                label="Sales order prefix"
                help={`Next number looks like ${workspace.prefix || "SO"}-2026-000413.`}
              >
                <Input
                  id="ws-prefix"
                  value={workspace.prefix}
                  maxLength={6}
                  aria-describedby="ws-prefix-help"
                  onChange={(e) =>
                    setWorkspace({
                      ...workspace,
                      prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                    })
                  }
                />
              </Field>
            </CardContent>
            <CardFooter className="justify-end">
              <Button variant="primary" onClick={() => previewOnly(saveNote)}>
                Save workspace settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Members</CardTitle>
                <CardDescription>
                  One role per person in this workspace. Owners and Admins must use MFA.
                </CardDescription>
              </div>
              <PhaseDialog
                trigger={
                  <Button size="sm" variant="primary">
                    <MailPlus aria-hidden />
                    Invite member
                  </Button>
                }
                title="Invite a member"
                description="Invitations are emailed, single-use and expire after 7 days."
                phase="2"
                feature="Invitations and member management"
              />
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="hidden md:table-cell">Last active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {USERS.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <span className="block text-navy-900">{u.name}</span>
                      <span className="text-caption text-muted-foreground">{u.email}</span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        {ROLE_LABELS[u.role]}
                        {u.role === "owner" || u.role === "admin" ? (
                          <ShieldCheck
                            aria-label="MFA required"
                            className="size-3.5 text-success-700"
                          />
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge tone={u.status === "active" ? "success" : "neutral"}>
                        {u.status === "active" ? "Active" : "Suspended"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {fmt.relative(u.lastActiveAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {PENDING_INVITATIONS.map((i) => (
                  <TableRow key={i.email}>
                    <TableCell>
                      <span className="block text-navy-900">{i.email}</span>
                      <span className="text-caption text-muted-foreground">
                        Invited by {i.invitedBy}
                      </span>
                    </TableCell>
                    <TableCell>{ROLE_LABELS[i.role]}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge tone="warning">Invitation pending</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      Expires {fmt.dateTime(i.expiresAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Order rules</CardTitle>
                <CardDescription>
                  How review and approval behave. Every change is audited.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
                <div>
                  <Label htmlFor="rule-independent">Require independent approval</Label>
                  <p
                    id="rule-independent-help"
                    className="mt-0.5 text-caption text-subtle-foreground"
                  >
                    The person who submits a customer PO cannot approve it.
                  </p>
                </div>
                <Switch
                  id="rule-independent"
                  checked={rules.independent}
                  aria-describedby="rule-independent-help"
                  onCheckedChange={(v) => setRules({ ...rules, independent: v })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  id="rule-tolerance"
                  label="Price tolerance (%)"
                  help="0 means exact match at 4 decimals."
                >
                  <Input
                    id="rule-tolerance"
                    inputMode="decimal"
                    value={rules.tolerance}
                    aria-describedby="rule-tolerance-help"
                    onChange={(e) => setRules({ ...rules, tolerance: e.target.value })}
                  />
                </Field>
                <Field
                  id="rule-threshold"
                  label="Confidence threshold (%)"
                  help="Values below this must be confirmed one by one."
                >
                  <Input
                    id="rule-threshold"
                    inputMode="numeric"
                    value={rules.threshold}
                    aria-describedby="rule-threshold-help"
                    onChange={(e) => setRules({ ...rules, threshold: e.target.value })}
                  />
                </Field>
                <Field
                  id="rule-lookback"
                  label="Duplicate look-back (days)"
                  help="Window for possible duplicate warnings."
                >
                  <Input
                    id="rule-lookback"
                    inputMode="numeric"
                    value={rules.lookback}
                    aria-describedby="rule-lookback-help"
                    onChange={(e) => setRules({ ...rules, lookback: e.target.value })}
                  />
                </Field>
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button variant="primary" onClick={() => previewOnly(saveNote)}>
                Save order rules
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
