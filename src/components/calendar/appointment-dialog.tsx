"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createAppointment, updateAppointment, deleteAppointment } from "@/actions/appointments";
import { formatDateTimeLocalInTimezone } from "@/lib/datetime";
import { toast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";

interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: {
    id: string;
    startTime: string;
    status: string;
    notes: string | null;
    barberId: string;
    serviceId: string;
    client: { name: string; phone: string; email: string | null };
  } | null;
  defaultDate?: Date;
  defaultBarberId?: string;
  barbers: Array<{ id: string; name: string; color: string }>;
  services: Array<{ id: string; name: string; duration: number; price: number }>;
  timezone: string;
  onSuccess: () => void;
}

export function AppointmentDialog({
  open,
  onOpenChange,
  appointment,
  defaultDate,
  defaultBarberId,
  barbers,
  services,
  timezone,
  onSuccess,
}: AppointmentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [barberId, setBarberId] = useState("");
  const [status, setStatus] = useState("PENDING");
  const isEdit = !!appointment;

  useEffect(() => {
    if (open) {
      setServiceId(appointment?.serviceId ?? services[0]?.id ?? "");
      setBarberId(appointment?.barberId ?? defaultBarberId ?? barbers[0]?.id ?? "");
      setStatus(appointment?.status ?? "PENDING");
    }
  }, [open, appointment, services, barbers, defaultBarberId]);

  const defaultStart = appointment
    ? appointment.startTime
    : defaultDate ?? new Date();
  const defaultStartLocal = formatDateTimeLocalInTimezone(defaultStart, timezone);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      clientName: formData.get("clientName") as string,
      clientPhone: formData.get("clientPhone") as string,
      clientEmail: formData.get("clientEmail") as string,
      serviceId,
      barberId,
      startTime: formData.get("startTime") as string,
      notes: formData.get("notes") as string,
      status,
    };

    const result = isEdit
      ? await updateAppointment(appointment!.id, data)
      : await createAppointment(data);

    setLoading(false);

    if (result?.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "Success", description: isEdit ? "Appointment updated" : "Appointment created" });
      onOpenChange(false);
      onSuccess();
    }
  }

  async function handleDelete() {
    if (!appointment) return;
    setLoading(true);
    const result = await deleteAppointment(appointment.id);
    setLoading(false);
    if (result?.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Appointment cancelled" });
      onOpenChange(false);
      onSuccess();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Appointment" : "New Appointment"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clientName">Client name</Label>
              <Input
                id="clientName"
                name="clientName"
                defaultValue={appointment?.client.name}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientPhone">Phone</Label>
              <Input
                id="clientPhone"
                name="clientPhone"
                type="tel"
                defaultValue={appointment?.client.phone}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="clientEmail">Email (optional)</Label>
            <Input
              id="clientEmail"
              name="clientEmail"
              type="email"
              defaultValue={appointment?.client.email ?? ""}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Service</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.duration}m)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Barber</Label>
              <Select value={barberId} onValueChange={setBarberId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select barber" />
                </SelectTrigger>
                <SelectContent>
                  {barbers.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Date & time</Label>
              <Input
                id="startTime"
                name="startTime"
                type="datetime-local"
                defaultValue={defaultStartLocal}
                required
              />
            </div>
            {isEdit && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    <SelectItem value="NO_SHOW">No Show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={appointment?.notes ?? ""}
              rows={2}
            />
          </div>
          <DialogFooter className="gap-2">
            {isEdit && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
                <Trash2 className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={loading || !serviceId || !barberId}>
              {loading ? "Saving..." : isEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
