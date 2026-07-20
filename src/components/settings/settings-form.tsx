"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateShopSettings } from "@/actions/appointments";
import { toast } from "@/hooks/use-toast";
import { DAYS_OF_WEEK } from "@/lib/dates";
import { getVoiceWebhookUrl } from "@/lib/voice-webhook";

type PhoneSetupMethod = "NEW_TWILIO" | "FORWARD_EXISTING" | "PORT_TO_TWILIO";
type PhoneSetupStatus = "NOT_STARTED" | "PENDING" | "CONNECTED" | "ERROR";

interface Shop {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  instagram: string | null;
  timezone: string;
  logoUrl: string | null;
  twilioPhone: string | null;
  phoneSetupMethod?: PhoneSetupMethod | null;
  phoneSetupStatus?: PhoneSetupStatus | null;
  phonePortingNotes?: string | null;
}

interface BusinessHour {
  id: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

interface SettingsFormProps {
  shop: Shop;
  businessHours: BusinessHour[];
  canManage: boolean;
  voiceWebhookUrl?: string;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Pacific/Honolulu",
];

const SETUP_METHODS: {
  value: PhoneSetupMethod;
  label: string;
  description: string;
}[] = [
  {
    value: "NEW_TWILIO",
    label: "New Twilio number",
    description: "Buy a new Twilio number and connect it to this shop.",
  },
  {
    value: "FORWARD_EXISTING",
    label: "Forward existing number",
    description:
      "Keep your current shop number and forward calls to your Twilio AI number.",
  },
  {
    value: "PORT_TO_TWILIO",
    label: "Port existing number to Twilio",
    description:
      "Transfer your existing shop number to Twilio so the AI receptionist answers calls instantly.",
  },
];

const STATUS_LABELS: Record<PhoneSetupStatus, string> = {
  NOT_STARTED: "Not started",
  PENDING: "Pending",
  CONNECTED: "Connected",
  ERROR: "Error",
};

export function SettingsForm({
  shop,
  businessHours,
  canManage,
  voiceWebhookUrl,
}: SettingsFormProps) {
  const [loading, setLoading] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [setupMethod, setSetupMethod] = useState<PhoneSetupMethod | "">(
    shop.phoneSetupMethod ?? ""
  );

  const webhookUrl = useMemo(
    () => voiceWebhookUrl || getVoiceWebhookUrl(),
    [voiceWebhookUrl]
  );

  const connectionStatus: PhoneSetupStatus =
    shop.phoneSetupStatus ??
    (shop.twilioPhone ? "CONNECTED" : "NOT_STARTED");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const result = await updateShopSettings({
      name: formData.get("name") as string,
      address: formData.get("address") as string,
      phone: formData.get("phone") as string,
      instagram: formData.get("instagram") as string,
      timezone: formData.get("timezone") as string,
      twilioPhone: shop.twilioPhone ?? "",
      phoneSetupMethod: shop.phoneSetupMethod ?? null,
      phoneSetupStatus: shop.phoneSetupStatus ?? undefined,
      phonePortingNotes: shop.phonePortingNotes ?? null,
    });
    setLoading(false);
    if (result?.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Settings updated successfully" });
    }
  }

  async function handlePhoneSetupSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPhoneLoading(true);
    const formData = new FormData(e.currentTarget);
    const method = (formData.get("phoneSetupMethod") as string) || null;
    const status = (formData.get("phoneSetupStatus") as PhoneSetupStatus) || undefined;
    const result = await updateShopSettings({
      name: shop.name,
      address: shop.address ?? "",
      phone: shop.phone ?? "",
      instagram: shop.instagram ?? "",
      timezone: shop.timezone,
      twilioPhone: formData.get("twilioPhone") as string,
      phoneSetupMethod: method || null,
      phoneSetupStatus: status,
      phonePortingNotes: (formData.get("phonePortingNotes") as string) || null,
    });
    setPhoneLoading(false);
    if (result?.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Phone setup updated" });
    }
  }

  const selectedMethodHelp = SETUP_METHODS.find((m) => m.value === setupMethod);

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your barbershop profile</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="phone">AI Phone</TabsTrigger>
          <TabsTrigger value="hours">Business Hours</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Shop Information</CardTitle>
              <CardDescription>Basic details about your barbershop</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Business name</Label>
                  <Input id="name" name="name" defaultValue={shop.name} disabled={!canManage} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" name="address" defaultValue={shop.address ?? ""} disabled={!canManage} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" name="phone" type="tel" defaultValue={shop.phone ?? ""} disabled={!canManage} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="instagram">Instagram</Label>
                    <Input id="instagram" name="instagram" defaultValue={shop.instagram ?? ""} disabled={!canManage} placeholder="@yourshop" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <select
                    id="timezone"
                    name="timezone"
                    defaultValue={shop.timezone}
                    disabled={!canManage}
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>
                {canManage && (
                  <Button type="submit" disabled={loading}>
                    {loading ? "Saving..." : "Save changes"}
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="phone" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Receptionist Phone Setup</CardTitle>
              <CardDescription>
                Connect a Twilio number so the AI receptionist answers for{" "}
                <span className="font-medium text-foreground">{shop.name}</span>.
                This app configures routing only — it does not port numbers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePhoneSetupSubmit} className="space-y-5">
                <div className="rounded-xl bg-muted/40 p-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Shop</span>
                    <span className="font-medium text-right">{shop.name}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Connected Twilio number</span>
                    <span className="font-medium text-right font-mono text-xs sm:text-sm">
                      {shop.twilioPhone || "Not connected"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Connection status</span>
                    <span className="font-medium text-right">
                      {STATUS_LABELS[connectionStatus]}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-border/60">
                    <p className="text-muted-foreground mb-1">Voice webhook URL</p>
                    <code className="block text-xs break-all rounded-lg bg-background px-3 py-2 border border-border/50">
                      {webhookUrl}
                    </code>
                    <p className="text-xs text-muted-foreground mt-2">
                      Paste this URL in Twilio Console → Phone Numbers → Voice webhook
                      (A call comes in → HTTP POST).
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="twilioPhone">Twilio phone number</Label>
                  <Input
                    id="twilioPhone"
                    name="twilioPhone"
                    type="tel"
                    defaultValue={shop.twilioPhone ?? ""}
                    disabled={!canManage}
                    placeholder="+15551234567"
                  />
                  <p className="text-xs text-muted-foreground">
                    Incoming calls to this number are matched via Twilio&apos;s{" "}
                    <span className="font-medium">To</span> field and routed to this shop.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phoneSetupMethod">Setup method</Label>
                  <select
                    id="phoneSetupMethod"
                    name="phoneSetupMethod"
                    value={setupMethod}
                    onChange={(e) =>
                      setSetupMethod((e.target.value as PhoneSetupMethod) || "")
                    }
                    disabled={!canManage}
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm"
                  >
                    <option value="">Select a method…</option>
                    {SETUP_METHODS.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                  {selectedMethodHelp && (
                    <p className="text-sm text-muted-foreground rounded-xl bg-muted/30 px-3 py-2">
                      {selectedMethodHelp.description}
                    </p>
                  )}
                  {!selectedMethodHelp && (
                    <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                      {SETUP_METHODS.map((method) => (
                        <li key={method.value}>
                          <span className="font-medium text-foreground/80">
                            {method.label}:
                          </span>{" "}
                          {method.description}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phoneSetupStatus">Connection status</Label>
                  <select
                    id="phoneSetupStatus"
                    name="phoneSetupStatus"
                    defaultValue={connectionStatus}
                    disabled={!canManage}
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm"
                  >
                    {(Object.keys(STATUS_LABELS) as PhoneSetupStatus[]).map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>

                {setupMethod === "PORT_TO_TWILIO" && (
                  <div className="space-y-2">
                    <Label htmlFor="phonePortingNotes">Porting notes</Label>
                    <textarea
                      id="phonePortingNotes"
                      name="phonePortingNotes"
                      defaultValue={shop.phonePortingNotes ?? ""}
                      disabled={!canManage}
                      rows={3}
                      placeholder="Carrier account #, authorized name, target port date…"
                      className="flex w-full rounded-xl border border-input bg-background px-4 py-2 text-sm min-h-[88px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Porting happens in Twilio Console / with your carrier — Cut only stores notes.
                    </p>
                  </div>
                )}

                {setupMethod !== "PORT_TO_TWILIO" && (
                  <input
                    type="hidden"
                    name="phonePortingNotes"
                    defaultValue={shop.phonePortingNotes ?? ""}
                  />
                )}

                {canManage ? (
                  <Button type="submit" disabled={phoneLoading}>
                    {phoneLoading ? "Saving..." : "Save phone setup"}
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Only shop owners can edit phone setup.
                  </p>
                )}
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hours" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Business Hours</CardTitle>
              <CardDescription>When your shop is open</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {businessHours.map((hour) => (
                  <div key={hour.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                    <span className="font-medium text-sm w-24">{DAYS_OF_WEEK[hour.dayOfWeek]}</span>
                    {hour.isClosed ? (
                      <span className="text-sm text-muted-foreground">Closed</span>
                    ) : (
                      <span className="text-sm">
                        {hour.openTime} – {hour.closeTime}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
