import prisma from "@/lib/db";

/**
 * First-run setup checklist.
 *
 * A brand-new shop lands on an empty dashboard with no idea it already has a
 * public booking page, a walk-in QR code, and an AI receptionist. This computes
 * what's genuinely done from real shop data — no flags to keep in sync — so the
 * list is always honest and disappears once the shop is actually set up.
 */

export type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
  /** Optional — shown when the item unlocks a paid feature. */
  upgrade?: boolean;
};

export type SetupChecklist = {
  items: ChecklistItem[];
  doneCount: number;
  total: number;
  complete: boolean;
  /**
   * The public booking link currently shows customers "not booking online
   * yet" instead of a booking form.
   *
   * Worth saying out loud rather than leaving as an unticked checklist line:
   * the link is already printed on stickers and sitting in Instagram bios, so
   * a shop can be quietly turning people away — most often after deleting the
   * starter services to add its own.
   */
  bookingLinkDead: boolean;
};

export async function getSetupChecklist(
  barbershopId: string
): Promise<SetupChecklist> {
  const [
    shop,
    serviceCount,
    barberCount,
    onlineBookingCount,
    queueCount,
    customHours,
  ] = await Promise.all([
      prisma.barbershop.findUnique({
        where: { id: barbershopId },
        select: {
          address: true,
          phone: true,
          twilioPhone: true,
          connectStatus: true,
          plan: true,
        },
      }),
      prisma.service.count({ where: { barbershopId, isActive: true } }),
      prisma.barber.count({ where: { barbershopId, isActive: true } }),
      // Proof the booking link is actually out there being used.
      prisma.appointment.count({
        where: { barbershopId, source: { in: ["online", "ai_receptionist"] } },
      }),
      // Proof the walk-in QR has been scanned by someone.
      prisma.queueEntry.count({ where: { barbershopId } }),
      // Onboarding seeds Mon–Sat 9–6; treat any deviation as "reviewed".
      prisma.businessHour.count({
        where: {
          barbershopId,
          NOT: { openTime: "09:00", closeTime: "18:00" },
          isClosed: false,
        },
      }),
    ]);

  const items: ChecklistItem[] = [
    {
      id: "profile",
      title: "Add your shop details",
      description: "Address and phone number so customers can find you.",
      href: "/settings",
      done: Boolean(shop?.address?.trim() && shop?.phone?.trim()),
    },
    {
      id: "hours",
      title: "Check your opening hours",
      description: "We started you on Mon–Sat, 9am–6pm. Adjust if that's wrong.",
      href: "/settings",
      done: customHours > 0,
    },
    {
      id: "services",
      title: "Review your services and prices",
      description: "Set what you charge and how long each cut takes.",
      href: "/services",
      done: serviceCount > 0,
    },
    {
      id: "team",
      title: "Add your barbers",
      description: "Invite your team so customers can book with them by name.",
      href: "/team",
      done: barberCount > 1,
    },
    {
      id: "booking-link",
      title: "Share your booking link",
      description: "Put it in your Instagram bio and Google profile.",
      href: "/settings",
      done: onlineBookingCount > 0,
    },
    {
      id: "walk-in",
      title: "Print your walk-in QR code",
      description: "Customers scan it to join the line without waiting around.",
      href: "/queue-code",
      done: queueCount > 0,
    },
    {
      id: "payouts",
      title: "Connect payouts",
      description: "Take deposits and card payments straight to your bank.",
      href: "/settings",
      done: shop?.connectStatus === "ACTIVE",
    },
    {
      id: "ai-phone",
      title: "Turn on the AI receptionist",
      description: "Answers your phone and books appointments automatically.",
      href: "/settings",
      done: Boolean(shop?.twilioPhone),
      upgrade: shop?.plan !== "AI_RECEPTIONIST",
    },
  ];

  const bookingLinkDead = serviceCount === 0 || barberCount === 0;

  const doneCount = items.filter((i) => i.done).length;
  return {
    items,
    bookingLinkDead,
    doneCount,
    total: items.length,
    complete: doneCount === items.length,
  };
}
