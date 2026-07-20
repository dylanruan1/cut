"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Phone, Mail, Calendar, Star } from "lucide-react";
import { searchClients } from "@/actions/appointments";
import { formatPhone, getInitials, formatCurrency } from "@/lib/utils";
import { formatShortDate, formatTime, getStatusColor, getStatusLabel } from "@/lib/dates";
import { EmptyState } from "@/components/shared/empty-state";

interface ClientResult {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  visitCount: number;
  lastVisitAt: string | null;
  favoriteBarber: { name: string } | null;
  appointments: Array<{
    id: string;
    startTime: string;
    status: string;
    service: { name: string; price: number };
    barber: { name: string };
  }>;
}

export function ClientSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientResult[]>([]);
  const [selected, setSelected] = useState<ClientResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSearch(value: string) {
    setQuery(value);
    if (value.length < 2) {
      setResults([]);
      setSelected(null);
      return;
    }
    startTransition(async () => {
      const data = await searchClients(value);
      setResults(data);
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Clients</h1>
        <p className="text-muted-foreground mt-1">Search by name, phone, or email</p>
      </div>

      <div className="relative max-w-lg">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search clients..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-11 h-12 rounded-2xl"
          aria-label="Search clients"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-2">
          {isPending && <p className="text-sm text-muted-foreground">Searching...</p>}
          {!isPending && query.length >= 2 && results.length === 0 && (
            <EmptyState icon={Search} title="No clients found" description="Try a different search term" />
          )}
          {results.map((client) => (
            <Card
              key={client.id}
              className={`cursor-pointer transition-all hover:shadow-glass ${
                selected?.id === client.id ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => setSelected(client)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>{getInitials(client.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{client.name}</p>
                  <p className="text-sm text-muted-foreground">{formatPhone(client.phone)}</p>
                </div>
                <Badge variant="secondary">{client.visitCount} visits</Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="lg:col-span-2">
          {selected ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14">
                    <AvatarFallback className="text-lg">{getInitials(selected.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle>{selected.name}</CardTitle>
                    <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {formatPhone(selected.phone)}
                      </span>
                      {selected.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {selected.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl bg-muted/50 p-4 text-center">
                    <p className="text-2xl font-semibold">{selected.visitCount}</p>
                    <p className="text-xs text-muted-foreground">Lifetime visits</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-4 text-center">
                    <p className="text-sm font-medium">
                      {selected.lastVisitAt
                        ? formatShortDate(selected.lastVisitAt)
                        : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Last visit</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-4 text-center">
                    <p className="text-sm font-medium flex items-center justify-center gap-1">
                      {selected.favoriteBarber ? (
                        <>
                          <Star className="h-3 w-3 text-yellow-500" />
                          {selected.favoriteBarber.name}
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Favorite barber</p>
                  </div>
                </div>

                {selected.notes && (
                  <div>
                    <h3 className="font-medium mb-2">Notes</h3>
                    <p className="text-sm text-muted-foreground bg-muted/50 rounded-xl p-3">
                      {selected.notes}
                    </p>
                  </div>
                )}

                <div>
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Recent appointments
                  </h3>
                  {selected.appointments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No appointments yet</p>
                  ) : (
                    <div className="space-y-2">
                      {selected.appointments.map((apt) => (
                        <div
                          key={apt.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-muted/30"
                        >
                          <div>
                            <p className="text-sm font-medium">{apt.service.name}</p>
                            <p className="text-xs text-muted-foreground">
                              with {apt.barber.name} · {formatShortDate(apt.startTime)} at{" "}
                              {formatTime(apt.startTime)}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge className={getStatusColor(apt.status)} variant="outline">
                              {getStatusLabel(apt.status)}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatCurrency(apt.service.price)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <p className="text-sm">Select a client to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
