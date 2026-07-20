import { requireShopUser } from "@/lib/auth";
import prisma from "@/lib/db";
import { CalendarView } from "@/components/calendar/calendar-view";
import { serializeForClient } from "@/lib/serializers";

export default async function CalendarPage() {
  const user = await requireShopUser();

  const [barbers, services] = await Promise.all([
    prisma.barber.findMany({
      where: { barbershopId: user.barbershopId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.service.findMany({
      where: { barbershopId: user.barbershopId, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const serializedBarbers = serializeForClient(barbers);
  const serializedServices = serializeForClient(services);

  return (
    <CalendarView
      barbers={serializedBarbers.map((b) => ({
        id: b.id,
        name: b.name,
        color: b.color,
        photoUrl: b.photoUrl,
      }))}
      services={serializedServices.map((s) => ({
        id: s.id,
        name: s.name,
        duration: s.duration,
        price: s.price,
        color: s.color,
      }))}
      timezone={user.barbershop.timezone}
    />
  );
}
