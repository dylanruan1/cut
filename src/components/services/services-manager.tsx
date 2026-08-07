"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Clock, DollarSign } from "lucide-react";
import { createService, updateService, deleteService } from "@/actions/appointments";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { formatDuration } from "@/lib/dates";
import { EmptyState } from "@/components/shared/empty-state";
import { Scissors } from "lucide-react";

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  price: number;
  depositAmount?: number | null;
  color: string;
  isActive: boolean;
}

interface ServicesManagerProps {
  services: Service[];
  canManage: boolean;
}

export function ServicesManager({ services: initialServices, canManage }: ServicesManagerProps) {
  const router = useRouter();
  const [services, setServices] = useState(initialServices);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      duration: Number(formData.get("duration")),
      price: Number(formData.get("price")),
      depositAmount: formData.get("depositAmount")
        ? Number(formData.get("depositAmount"))
        : null,
      color: formData.get("color") as string,
    };

    const result = editing
      ? await updateService(editing.id, data)
      : await createService(data);

    setLoading(false);
    if (result?.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    } else if (result?.service) {
      const saved = result.service as Service;
      setServices((prev) => {
        const idx = prev.findIndex((s) => s.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...prev[idx], ...saved };
          return next;
        }
        return [...prev, { ...saved, isActive: saved.isActive ?? true }];
      });
      toast({ title: "Success", description: editing ? "Service updated" : "Service created" });
      setDialogOpen(false);
      setEditing(null);
      router.refresh();
    }
  }

  async function handleDelete(id: string) {
    await deleteService(id);
    setServices((prev) => prev.filter((s) => s.id !== id));
    toast({ title: "Removed", description: "Service deactivated" });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Services</h1>
          <p className="text-muted-foreground mt-1">Manage your service menu</p>
        </div>
        {canManage && (
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            Add service
          </Button>
        )}
      </div>

      {services.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="No services yet"
          description="Add your first service to start booking appointments."
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((service) => (
            <Card
              key={service.id}
              className="cursor-pointer hover:shadow-glass transition-shadow"
              onClick={() => {
                if (canManage) {
                  setEditing(service);
                  setDialogOpen(true);
                }
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: service.color }}
                  />
                  <CardTitle className="text-base">{service.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {service.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {service.description}
                  </p>
                )}
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDuration(service.duration)}
                  </span>
                  <span className="flex items-center gap-1 font-medium">
                    <DollarSign className="h-3 w-3" />
                    {formatCurrency(service.price)}
                  </span>
                  {service.depositAmount ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {formatCurrency(service.depositAmount)} deposit
                    </span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Service" : "New Service"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={editing?.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" defaultValue={editing?.description ?? ""} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (min)</Label>
                <Input id="duration" name="duration" type="number" min={5} defaultValue={editing?.duration ?? 30} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Price ($)</Label>
                <Input id="price" name="price" type="number" min={0} step="0.01" defaultValue={editing?.price ?? 0} required />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="depositAmount">Deposit ($, optional)</Label>
                <Input
                  id="depositAmount"
                  name="depositAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  defaultValue={editing?.depositAmount ?? ""}
                />
                <p className="text-xs text-muted-foreground">
                  Charged when customers book online. Leave blank for no
                  deposit. Requires payouts to be connected in Settings.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <Input id="color" name="color" type="color" defaultValue={editing?.color ?? "#007AFF"} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              {editing && (
                <Button type="button" variant="destructive" onClick={() => handleDelete(editing.id)}>
                  Remove
                </Button>
              )}
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : editing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
