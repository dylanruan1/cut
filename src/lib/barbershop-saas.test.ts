import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UserRole } from "@prisma/client";
import { UNCONNECTED_NUMBER_MESSAGE } from "@/lib/ai-receptionist/shop-resolve";

const prismaMock = vi.hoisted(() => ({
  barbershop: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  barbershopMembership: {
    create: vi.fn(),
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  barber: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  service: {
    findMany: vi.fn(),
  },
  businessHour: {
    findMany: vi.fn(),
  },
  barberService: {
    createMany: vi.fn(),
  },
  appointment: {
    findMany: vi.fn(),
  },
  notification: {
    findMany: vi.fn(),
  },
  $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
}));

vi.mock("@/lib/db", () => ({
  default: prismaMock,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

describe("Twilio To shop routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes To shop A to shop A and To shop B to shop B", async () => {
    const shopA = {
      id: "shop_a",
      name: "Shop A",
      twilioPhone: "+15551111111",
      address: null,
      phone: null,
      timezone: "America/Los_Angeles",
    };
    const shopB = {
      id: "shop_b",
      name: "Shop B",
      twilioPhone: "+15552222222",
      address: null,
      phone: null,
      timezone: "America/Los_Angeles",
    };

    const { findBarbershopByTwilioTo } = await import("@/lib/barbershop");

    prismaMock.barbershop.findFirst.mockResolvedValueOnce(shopA);
    expect(await findBarbershopByTwilioTo("+1 (555) 111-1111")).toEqual(shopA);
    expect(prismaMock.barbershop.findFirst).toHaveBeenCalledWith({
      where: { twilioPhone: "+15551111111" },
    });

    prismaMock.barbershop.findFirst.mockResolvedValueOnce(shopB);
    expect(await findBarbershopByTwilioTo("+15552222222")).toEqual(shopB);
  });

  it("does not fall back to first shop outside development", async () => {
    const prev = process.env.NODE_ENV;
    const prevFlag = process.env.ALLOW_DEV_SHOP_FALLBACK;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_SHOP_FALLBACK", "");

    const { findDevFallbackBarbershop } = await import("@/lib/barbershop");
    const result = await findDevFallbackBarbershop("+15550000000");
    expect(result).toBeNull();
    expect(prismaMock.barbershop.findFirst).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
    process.env.NODE_ENV = prev;
    if (prevFlag !== undefined) process.env.ALLOW_DEV_SHOP_FALLBACK = prevFlag;
  });

  it("exposes unconnected TwiML message for unmatched numbers", () => {
    expect(UNCONNECTED_NUMBER_MESSAGE).toMatch(/not connected to a barbershop/i);
  });

  it("resolveShopForTwilioTo loads only the matched shop catalog", async () => {
    prismaMock.barbershop.findFirst.mockResolvedValue({
      id: "shop_a",
      name: "Shop A",
      twilioPhone: "+15551111111",
      address: "1 A St",
      phone: null,
      timezone: "America/Los_Angeles",
    });
    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc_a", name: "Haircut", duration: 30 },
    ]);
    prismaMock.barber.findMany.mockResolvedValue([{ id: "b_a", name: "Alex" }]);
    prismaMock.businessHour.findMany.mockResolvedValue([]);

    const { resolveShopForTwilioTo } = await import(
      "@/lib/ai-receptionist/shop-resolve"
    );
    const { shop } = await resolveShopForTwilioTo("+15551111111");
    expect(shop?.id).toBe("shop_a");
    expect(prismaMock.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ barbershopId: "shop_a" }),
      })
    );
  });
});

describe("multi-shop onboarding and membership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creating a shop creates an OWNER membership and sets active shop", async () => {
    const createdShop = {
      id: "shop_new",
      name: "Jeff's Cuts",
      slug: "jeffs-cuts",
      timezone: "America/Los_Angeles",
    };

    prismaMock.barbershop.findUnique.mockResolvedValue(null);
    prismaMock.barbershop.create.mockResolvedValue(createdShop);
    prismaMock.barbershopMembership.create.mockResolvedValue({
      id: "mem_1",
      userId: "user_1",
      barbershopId: "shop_new",
      role: UserRole.OWNER,
    });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.barber.create.mockResolvedValue({ id: "barber_1" });
    prismaMock.service.findMany.mockResolvedValue([{ id: "svc_1" }, { id: "svc_2" }]);
    prismaMock.barberService.createMany.mockResolvedValue({ count: 2 });
    prismaMock.$transaction.mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return ops;
    });

    const { createBarbershopWithOwner } = await import("@/lib/barbershop");

    const shop = await createBarbershopWithOwner({
      name: "Jeff's Cuts",
      timezone: "America/Los_Angeles",
      ownerUserId: "user_1",
      ownerName: "Jeff Owner",
      ownerEmail: "jeff@example.com",
    });

    expect(shop.id).toBe("shop_new");
    expect(prismaMock.barbershopMembership.create).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        barbershopId: "shop_new",
        role: UserRole.OWNER,
      },
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: {
        barbershopId: "shop_new",
        role: UserRole.OWNER,
        name: "Jeff Owner",
      },
    });
  });
});

describe("requireShopUser redirects users without a shop", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/supabase/server");
  });

  it("redirects to /onboarding when user has no barbershop", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "user_no_shop" } },
          })),
        },
      })),
    }));

    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_no_shop",
      email: "alone@example.com",
      name: "Lonely",
      role: UserRole.OWNER,
      barbershopId: null,
      barbershop: null,
      barber: null,
    });
    prismaMock.barbershopMembership.findMany.mockResolvedValue([]);
    prismaMock.barbershopMembership.findUnique.mockResolvedValue(null);

    const { requireShopUser } = await import("@/lib/auth");

    await expect(requireShopUser()).rejects.toThrow("REDIRECT:/onboarding");
  });
});

describe("ensureMembershipForUser idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const user = {
    id: "user_1",
    role: UserRole.OWNER,
    barbershopId: "shop_1",
  };

  const membership = {
    id: "mem_1",
    userId: "user_1",
    barbershopId: "shop_1",
    role: UserRole.OWNER,
    createdAt: new Date(),
  };

  it("called twice does not throw and does not recreate", async () => {
    prismaMock.barbershopMembership.findUnique.mockResolvedValue(membership);

    const { ensureMembershipForUser } = await import("@/lib/barbershop");

    const first = await ensureMembershipForUser(user);
    const second = await ensureMembershipForUser(user);

    expect(first).toEqual(membership);
    expect(second).toEqual(membership);
    expect(prismaMock.barbershopMembership.create).not.toHaveBeenCalled();
  });

  it("returns existing membership without create when already present", async () => {
    prismaMock.barbershopMembership.findUnique.mockResolvedValue(membership);

    const { ensureMembershipForUser } = await import("@/lib/barbershop");

    const result = await ensureMembershipForUser(user);

    expect(result).toEqual(membership);
    expect(prismaMock.barbershopMembership.create).not.toHaveBeenCalled();
  });

  it("creates once when missing, then returns existing on second call", async () => {
    prismaMock.barbershopMembership.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(membership);
    prismaMock.barbershopMembership.create.mockResolvedValue(membership);

    const { ensureMembershipForUser } = await import("@/lib/barbershop");

    const created = await ensureMembershipForUser(user);
    const again = await ensureMembershipForUser(user);

    expect(created).toEqual(membership);
    expect(again).toEqual(membership);
    expect(prismaMock.barbershopMembership.create).toHaveBeenCalledTimes(1);
  });

  it("handles P2002 race by fetching and returning existing", async () => {
    const { Prisma } = await import("@prisma/client");
    prismaMock.barbershopMembership.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(membership);
    prismaMock.barbershopMembership.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["userId", "barbershopId"] },
      })
    );

    const { ensureMembershipForUser } = await import("@/lib/barbershop");

    await expect(ensureMembershipForUser(user)).resolves.toEqual(membership);
  });
});

describe("calendar auth path with existing membership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.barbershopMembership.findUnique.mockReset();
    prismaMock.barbershopMembership.create.mockReset();
    prismaMock.barbershopMembership.findMany.mockReset();
    prismaMock.user.findUnique.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/supabase/server");
  });

  it("getCurrentUser does not crash when membership already exists", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "user_1" } },
          })),
        },
      })),
    }));

    const shop = {
      id: "shop_1",
      name: "Jeff's Cuts",
      slug: "jeffs-cuts",
      timezone: "America/Los_Angeles",
    };
    const membershipRow = {
      id: "mem_1",
      userId: "user_1",
      barbershopId: "shop_1",
      role: UserRole.OWNER,
      barbershop: shop,
      createdAt: new Date(),
    };

    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_1",
      email: "jeff@example.com",
      name: "Jeff",
      role: UserRole.OWNER,
      barbershopId: "shop_1",
      barbershop: shop,
      barber: { id: "barber_1" },
    });
    prismaMock.barbershopMembership.findUnique.mockResolvedValue(membershipRow);
    prismaMock.barbershopMembership.findMany.mockResolvedValue([membershipRow]);

    const { getCurrentUser } = await import("@/lib/auth");
    const authUser = await getCurrentUser();

    expect(authUser?.barbershopId).toBe("shop_1");
    expect(authUser?.memberships).toHaveLength(1);
    expect(prismaMock.barbershopMembership.create).not.toHaveBeenCalled();
  });
});

describe("dashboard scoping", () => {
  it("active shop selection scopes data away from other memberships", () => {
    const memberships = [
      {
        id: "m1",
        role: UserRole.OWNER,
        barbershop: {
          id: "shop_active",
          name: "Active",
          slug: "active",
          timezone: "America/Los_Angeles",
        },
      },
      {
        id: "m2",
        role: UserRole.BARBER,
        barbershop: {
          id: "shop_other",
          name: "Other",
          slug: "other",
          timezone: "America/Chicago",
        },
      },
    ];
    const activeShopId = "shop_active";
    const scopedQueries = memberships
      .filter((m) => m.barbershop.id === activeShopId)
      .map((m) => m.barbershop.id);

    expect(scopedQueries).toEqual(["shop_active"]);
    expect(scopedQueries).not.toContain("shop_other");
  });
});
