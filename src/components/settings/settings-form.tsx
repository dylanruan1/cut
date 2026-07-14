"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateShopSettings } from "@/actions/appointments";
import { toast } from "@/hooks/use-toast";
import { DAYS_OF_WEEK } from "@/lib/dates";

interface Shop {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  instagram: string | null;
  timezone: string;
  logoUrl: string | null;
  twilioPhone: string | null;
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
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Pacific/Honolulu",
];

export function SettingsForm({ shop, businessHours, canManage }: SettingsFormProps) {
  const [loading, setLoading] = useState(false);

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
      twilioPhone: formData.get("twilioPhone") as string,
    });
    setLoading(false);
    if (result?.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Settings updated successfully" });
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your barbershop profile</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
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
                  <Label htmlFor="twilioPhone">Twilio phone (AI receptionist)</Label>
                  <Input
                    id="twilioPhone"
                    name="twilioPhone"
                    type="tel"
                    defaultValue={shop.twilioPhone ?? ""}
                    disabled={!canManage}
                    placeholder="+15551234567"
                  />
                  <p className="text-xs text-muted-foreground">
                    Incoming calls to this number are routed to this shop&apos;s receptionist.
                  </p>
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
