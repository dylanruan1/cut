"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Plus, Mail, Phone, UserMinus, Users, Copy, Check } from "lucide-react";
import { inviteTeamMember, removeBarber } from "@/actions/appointments";
import { toast } from "@/hooks/use-toast";
import { getInitials, formatPhone } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { BarberPinControl } from "@/components/team/barber-pin-control";
import { WorkingHoursDialog } from "@/components/team/working-hours-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Barber {
  id: string;
  name: string;
  /** Handle for their personal booking link. Null until backfilled. */
  slug?: string | null;
  email: string;
  phone: string | null;
  photoUrl: string | null;
  color: string;
  isActive: boolean;
  /** Whether a cash-verification PIN is set. The PIN itself never leaves the server. */
  hasVerifyPin?: boolean;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  /** Used to rebuild the invite link. Cut sends no email, so this must stay visible. */
  token: string;
}

interface TeamManagerProps {
  barbers: Barber[];
  invitations: Invitation[];
  canManage: boolean;
  shopSlug: string;
}

export function TeamManager({
  barbers,
  invitations,
  canManage,
  shopSlug,
}: TeamManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<"BARBER" | "RECEPTIONIST">("BARBER");

  async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const result = await inviteTeamMember({
      email: formData.get("email") as string,
      role,
    });
    setLoading(false);
    if (result?.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    } else {
      // Deliberately does NOT say "sent" — Cut has no email service, so nothing
      // was delivered. The link now lives in the Pending list, where it can be
      // copied at any time.
      // The seat notice rides along with the success toast rather than
      // interrupting with its own. Adding a barber succeeded; the price is
      // information, not a problem, and a second popup would read as one.
      toast({
        title: "Invite link created",
        description: result?.seatNotice
          ? `Copy it from the Pending list below and send it to them. ${result.seatNotice}`
          : "Copy it from the Pending list below and send it to them.",
      });
      setDialogOpen(false);
      window.location.reload();
    }
  }

  async function handleRemove(barberId: string) {
    await removeBarber(barberId);
    toast({ title: "Removed", description: "Barber has been deactivated" });
    window.location.reload();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Team</h1>
          <p className="text-muted-foreground mt-1">Manage barbers and staff</p>
        </div>
        {canManage && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Invite
          </Button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {barbers.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <EmptyState
              icon={Users}
              title="No team members yet"
              description="Invite barbers and receptionists so they can manage appointments for this shop."
            />
            {canManage && (
              <div className="flex justify-center -mt-2 mb-4">
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Invite
                </Button>
              </div>
            )}
          </div>
        ) : (
        barbers.map((barber) => (
          <Card key={barber.id}>
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={barber.photoUrl ?? undefined} />
                  <AvatarFallback style={{ backgroundColor: `${barber.color}20`, color: barber.color }}>
                    {getInitials(barber.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{barber.name}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Mail className="h-3 w-3" />
                    {barber.email}
                  </p>
                  {barber.phone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {formatPhone(barber.phone)}
                    </p>
                  )}
                </div>
              </div>
              {canManage && (
                <>
                  <BarberPinControl
                    barberId={barber.id}
                    barberName={barber.name}
                    hasPin={Boolean(barber.hasVerifyPin)}
                  />
                  <div className="mt-2">
                    <WorkingHoursDialog
                      barberId={barber.id}
                      barberName={barber.name}
                    />
                  </div>
                  {barber.slug && (
                    <BarberLink shopSlug={shopSlug} barberSlug={barber.slug} />
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-destructive"
                        onClick={() => handleRemove(barber.id)}
                      >
                        <UserMinus className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Deactivate this barber for the active shop</TooltipContent>
                  </Tooltip>
                </>
              )}
            </CardContent>
          </Card>
        ))
        )}
      </div>

      {/* Gated on canManage: the link below is a working credential — anyone
          holding it can create an account on this shop. */}
      {canManage && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending Invitations</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cut doesn&apos;t email these. Copy each link and send it to the
              person yourself — by text, WhatsApp, or however you reach them.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invitations.map((inv) => (
                <div key={inv.id} className="rounded-xl bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">{inv.role}</p>
                    </div>
                    <Badge variant="warning">Pending</Badge>
                  </div>
                  <CopyInviteLink token={inv.token} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BARBER">Barber</SelectItem>
                  <SelectItem value="RECEPTIONIST">Receptionist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading ? "Sending..." : "Send invitation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * A barber's personal booking link.
 *
 * Shown on their card so the owner can hand it straight to them. The whole
 * point is that the barber puts it in their own Instagram bio — a shop with
 * six chairs then has six people promoting it instead of one.
 */
function BarberLink({
  shopSlug,
  barberSlug,
}: {
  shopSlug: string;
  barberSlug: string;
}) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(`${window.location.origin}/book/${shopSlug}/${barberSlug}`);
  }, [shopSlug, barberSlug]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  }

  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-muted-foreground">
        Their booking link
      </p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate border bg-muted/40 px-2 py-1.5 text-xs">
          {url || "…"}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={!url}
          onClick={copy}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * The invite link, always visible and copyable.
 *
 * Built from window.location.origin rather than NEXT_PUBLIC_APP_URL, because
 * that env var has been wrong before (it pointed at a dead ngrok tunnel) and a
 * broken invite link is invisible until someone complains.
 */
function CopyInviteLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  // window isn't available during server rendering.
  useEffect(() => {
    setUrl(`${window.location.origin}/invite/${token}`);
  }, [token]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Select the link and copy it manually.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <code className="flex-1 truncate rounded-lg border bg-background px-2 py-1.5 text-xs text-muted-foreground">
        {url || "…"}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copy}
        disabled={!url}
        className="shrink-0"
      >
        {copied ? (
          <>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Copied
          </>
        ) : (
          <>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy link
          </>
        )}
      </Button>
    </div>
  );
}
