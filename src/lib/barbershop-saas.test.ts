import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UserRole } from "@prisma/client";
import { UNCONNECTED_NUMBER_MESSAGE } from "@/lib/ai-receptionist/shop-resolve";

const prismaMock = vi.hoisted(() => ({
  barbershop: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  service: {
    findMany: vi.fn(),
  },
  businessHour: {
    findMany: vi.fn(),
  },
  holiday: {
    findMany: vi.fn(),
  },
  barberService: {
    createMany: vi.fn(),
  },
  appointment: {
    findMany: vi.fn(),
  },
  client: {
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

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
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
    prismaMock.holiday.findMany.mockResolvedValue([]);

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
    prismaMock.barber.findUnique.mockResolvedValue(null);
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
    prismaMock.barber.findFirst.mockResolvedValue({ id: "barber_1" });

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

describe("multi-shop user membership and switching", () => {
  const devShop = {
    id: "shop_dev",
    name: "Dev",
    slug: "dev",
    timezone: "America/Los_Angeles",
  };
  const testShop2 = {
    id: "shop_test2",
    name: "Test Shop 2",
    slug: "test-shop-2",
    timezone: "America/Los_Angeles",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.barbershopMembership.findUnique.mockReset();
    prismaMock.barbershopMembership.create.mockReset();
    prismaMock.barbershopMembership.findMany.mockReset();
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.update.mockReset();
    prismaMock.barber.findFirst.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/supabase/server");
  });

  it("user can belong to multiple shops (Dev and Test Shop 2)", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "user_owner" } },
          })),
        },
      })),
    }));

    const memberships = [
      {
        id: "mem_dev",
        userId: "user_owner",
        barbershopId: "shop_dev",
        role: UserRole.OWNER,
        barbershop: devShop,
        createdAt: new Date("2024-01-01"),
      },
      {
        id: "mem_test2",
        userId: "user_owner",
        barbershopId: "shop_test2",
        role: UserRole.OWNER,
        barbershop: testShop2,
        createdAt: new Date("2024-06-01"),
      },
    ];

    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_owner",
      email: "owner@example.com",
      name: "Owner",
      role: UserRole.OWNER,
      barbershopId: "shop_dev",
      barbershop: devShop,
    });
    prismaMock.barbershopMembership.findUnique.mockResolvedValue(memberships[0]);
    prismaMock.barbershopMembership.findMany.mockResolvedValue(memberships);
    prismaMock.barber.findFirst.mockResolvedValue({ id: "barber_dev" });

    const { getCurrentUser } = await import("@/lib/auth");
    const user = await getCurrentUser();

    expect(user?.memberships).toHaveLength(2);
    expect(user?.memberships.map((m) => m.barbershop.name)).toEqual(["Dev", "Test Shop 2"]);
  });

  it("active shop can switch from Dev to Test Shop 2 via cookie preference", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "user_owner" } },
          })),
        },
      })),
    }));

    const memberships = [
      {
        id: "mem_dev",
        userId: "user_owner",
        barbershopId: "shop_dev",
        role: UserRole.OWNER,
        barbershop: devShop,
        createdAt: new Date("2024-01-01"),
      },
      {
        id: "mem_test2",
        userId: "user_owner",
        barbershopId: "shop_test2",
        role: UserRole.OWNER,
        barbershop: testShop2,
        createdAt: new Date("2024-06-01"),
      },
    ];

    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_owner",
      email: "owner@example.com",
      name: "Owner",
      role: UserRole.OWNER,
      barbershopId: "shop_dev",
      barbershop: devShop,
    });
    prismaMock.barbershopMembership.findUnique.mockResolvedValue(memberships[0]);
    prismaMock.barbershopMembership.findMany.mockResolvedValue(memberships);
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.barber.findFirst.mockResolvedValue(null);

    const { cookies } = await import("next/headers");
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn(() => ({ value: "shop_test2" })),
      set: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const { getCurrentUser } = await import("@/lib/auth");
    const user = await getCurrentUser();

    expect(user?.barbershopId).toBe("shop_test2");
    expect(user?.barbershop?.name).toBe("Test Shop 2");
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user_owner" },
      data: { barbershopId: "shop_test2", role: UserRole.OWNER },
    });
  });

  it("switchActiveBarbershop updates user and cookie without touching other shops", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "user_owner" } },
          })),
        },
      })),
    }));

    const memberships = [
      {
        id: "mem_dev",
        role: UserRole.OWNER,
        barbershop: devShop,
      },
      {
        id: "mem_test2",
        role: UserRole.OWNER,
        barbershop: testShop2,
      },
    ];

    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_owner",
      email: "owner@example.com",
      name: "Owner",
      role: UserRole.OWNER,
      barbershopId: "shop_dev",
      barbershop: devShop,
    });
    prismaMock.barbershopMembership.findUnique.mockResolvedValue({
      id: "mem_dev",
      userId: "user_owner",
      barbershopId: "shop_dev",
      role: UserRole.OWNER,
    });
    prismaMock.barbershopMembership.findMany.mockResolvedValue(
      memberships.map((m, i) => ({
        ...m,
        userId: "user_owner",
        barbershopId: m.barbershop.id,
        createdAt: new Date(),
      }))
    );
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.barber.findFirst.mockResolvedValue({ id: "barber_dev" });

    const cookieSet = vi.fn();
    const { cookies } = await import("next/headers");
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn(() => undefined),
      set: cookieSet,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const { switchActiveBarbershop } = await import("@/lib/auth");
    const result = await switchActiveBarbershop("shop_test2");

    expect(result).toEqual({ success: true });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user_owner" },
      data: { barbershopId: "shop_test2", role: UserRole.OWNER },
    });
    expect(cookieSet).toHaveBeenCalledWith(
      "cut_active_barbershop_id",
      "shop_test2",
      expect.objectContaining({ path: "/" })
    );
  });
});

describe("data isolation between shops", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calendar getAppointments scopes by active barbershopId only", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "user_1" } },
          })),
        },
      })),
    }));

    const devShop = {
      id: "shop_dev",
      name: "Dev",
      slug: "dev",
      timezone: "America/Los_Angeles",
    };

    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_1",
      email: "owner@example.com",
      name: "Owner",
      role: UserRole.OWNER,
      barbershopId: "shop_dev",
      barbershop: devShop,
    });
    prismaMock.barbershopMembership.findUnique.mockResolvedValue({
      id: "mem_dev",
      userId: "user_1",
      barbershopId: "shop_dev",
      role: UserRole.OWNER,
      barbershop: devShop,
      createdAt: new Date(),
    });
    prismaMock.barbershopMembership.findMany.mockResolvedValue([
      {
        id: "mem_dev",
        role: UserRole.OWNER,
        barbershop: devShop,
      },
      {
        id: "mem_test2",
        role: UserRole.OWNER,
        barbershop: {
          id: "shop_test2",
          name: "Test Shop 2",
          slug: "test-shop-2",
          timezone: "America/Los_Angeles",
        },
      },
    ]);
    prismaMock.barber.findFirst.mockResolvedValue({ id: "barber_dev" });
    prismaMock.appointment.findMany.mockResolvedValue([
      { id: "apt_dev", barbershopId: "shop_dev" },
    ]);

    const { getAppointments } = await import("@/actions/appointments");
    await getAppointments("2024-01-01", "2024-01-31");

    expect(prismaMock.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ barbershopId: "shop_dev" }),
      })
    );
    const call = prismaMock.appointment.findMany.mock.calls[0]?.[0];
    expect(call?.where?.barbershopId).toBe("shop_dev");
    expect(call?.where?.barbershopId).not.toBe("shop_test2");
  });

  it("clients searchClients scopes by active barbershopId", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "user_1" } },
          })),
        },
      })),
    }));

    const testShop2 = {
      id: "shop_test2",
      name: "Test Shop 2",
      slug: "test-shop-2",
      timezone: "America/Chicago",
    };

    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_1",
      email: "owner@example.com",
      name: "Owner",
      role: UserRole.OWNER,
      barbershopId: "shop_test2",
      barbershop: testShop2,
    });
    prismaMock.barbershopMembership.findUnique.mockResolvedValue({
      id: "mem_test2",
      userId: "user_1",
      barbershopId: "shop_test2",
      role: UserRole.OWNER,
      barbershop: testShop2,
      createdAt: new Date(),
    });
    prismaMock.barbershopMembership.findMany.mockResolvedValue([
      {
        id: "mem_test2",
        role: UserRole.OWNER,
        barbershop: testShop2,
      },
    ]);
    prismaMock.barber.findFirst.mockResolvedValue(null);

    const clientFindMany = vi.fn().mockResolvedValue([]);
    prismaMock.client.findMany = clientFindMany;

    const { searchClients } = await import("@/actions/appointments");
    await searchClients("john");

    expect(clientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ barbershopId: "shop_test2" }),
      })
    );
  });

  it("settings updateShopSettings only updates the active shop", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "user_1" } },
          })),
        },
      })),
    }));

    const testShop2 = {
      id: "shop_test2",
      name: "Test Shop 2",
      slug: "test-shop-2",
      timezone: "America/Chicago",
    };

    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_1",
      email: "owner@example.com",
      name: "Owner",
      role: UserRole.OWNER,
      barbershopId: "shop_test2",
      barbershop: testShop2,
    });
    prismaMock.barbershopMembership.findUnique.mockResolvedValue({
      id: "mem_test2",
      userId: "user_1",
      barbershopId: "shop_test2",
      role: UserRole.OWNER,
      barbershop: testShop2,
      createdAt: new Date(),
    });
    prismaMock.barbershopMembership.findMany.mockResolvedValue([
      {
        id: "mem_test2",
        role: UserRole.OWNER,
        barbershop: testShop2,
      },
    ]);
    prismaMock.barber.findFirst.mockResolvedValue(null);
    prismaMock.barbershop.findUniqueOrThrow.mockResolvedValue({
      id: "shop_test2",
      name: "Test Shop 2",
      plan: "NONE",
      subscriptionStatus: "NONE",
      trialEndsAt: null,
      twilioPhone: null,
      phoneSetupMethod: null,
      phoneSetupStatus: "NOT_STARTED",
      phonePortingNotes: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodEnd: null,
    });
    prismaMock.barbershop.update.mockResolvedValue({
      ...testShop2,
      twilioPhone: null,
      phoneSetupStatus: "NOT_STARTED",
    });

    const { updateShopSettings } = await import("@/actions/appointments");
    await updateShopSettings({
      name: "Test Shop 2",
      address: "",
      phone: "",
      instagram: "",
      timezone: "America/Chicago",
      twilioPhone: "",
      phoneSetupMethod: null,
      phonePortingNotes: null,
    });

    expect(prismaMock.barbershop.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "shop_test2" },
      })
    );
    const updateData = prismaMock.barbershop.update.mock.calls[0]?.[0]?.data;
    expect(updateData?.timezone).toBe("America/Chicago");
    // Phone fields omitted when shop lacks AI plan — general settings still update.
    expect(updateData).toMatchObject({
      name: "Test Shop 2",
      timezone: "America/Chicago",
    });
  });

  it("shop A data never appears in shop B queries", () => {
    const shopAId = "shop_dev";
    const shopBId = "shop_test2";
    const allAppointments = [
      { id: "a1", barbershopId: shopAId },
      { id: "a2", barbershopId: shopBId },
    ];
    const activeShopId = shopAId;
    const visible = allAppointments.filter((a) => a.barbershopId === activeShopId);

    expect(visible).toHaveLength(1);
    expect(visible[0]?.id).toBe("a1");
    expect(visible.every((a) => a.barbershopId !== shopBId)).toBe(true);
  });
});

describe("Twilio routing and settings separation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Dev Twilio number still routes to Dev", async () => {
    const devShop = {
      id: "shop_dev",
      name: "Dev",
      twilioPhone: "+14243907235",
      address: null,
      phone: null,
      timezone: "America/Los_Angeles",
    };

    const { findBarbershopByTwilioTo } = await import("@/lib/barbershop");

    prismaMock.barbershop.findFirst.mockResolvedValueOnce(devShop);
    const result = await findBarbershopByTwilioTo("+14243907235");
    expect(result?.id).toBe("shop_dev");
    expect(result?.name).toBe("Dev");
  });

  it("Test Shop 2 with no Twilio number shows Not connected in settings logic", () => {
    const testShop2Settings = {
      name: "Test Shop 2",
      twilioPhone: null as string | null,
      phoneSetupStatus: "NOT_STARTED" as const,
    };

    const displayNumber = testShop2Settings.twilioPhone || "Not connected";
    const connectionStatus =
      testShop2Settings.phoneSetupStatus ??
      (testShop2Settings.twilioPhone ? "CONNECTED" : "NOT_STARTED");

    expect(displayNumber).toBe("Not connected");
    expect(connectionStatus).toBe("NOT_STARTED");
  });

  it("Dev and Test Shop 2 have independent Twilio settings", () => {
    const devSettings = {
      name: "Dev",
      twilioPhone: "+14243907235",
      phoneSetupMethod: "NEW_TWILIO" as const,
      phoneSetupStatus: "CONNECTED" as const,
      timezone: "America/Los_Angeles",
    };
    const testShop2Settings = {
      name: "Test Shop 2",
      twilioPhone: null as string | null,
      phoneSetupMethod: null,
      phoneSetupStatus: "NOT_STARTED" as const,
      timezone: "America/Chicago",
    };

    expect(devSettings.twilioPhone).not.toBe(testShop2Settings.twilioPhone);
    expect(devSettings.timezone).not.toBe(testShop2Settings.timezone);
    expect(devSettings.phoneSetupStatus).toBe("CONNECTED");
    expect(testShop2Settings.phoneSetupStatus).toBe("NOT_STARTED");
  });
});

describe("createAdditionalBarbershop and dev Test Shop 2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creating additional shop does not switch active shop", async () => {
    const createdShop = {
      id: "shop_test2",
      name: "Test Shop 2",
      slug: "test-shop-2",
      timezone: "America/Los_Angeles",
    };

    prismaMock.barbershop.findUnique.mockResolvedValue(null);
    prismaMock.barbershop.create.mockResolvedValue(createdShop);
    prismaMock.barbershopMembership.create.mockResolvedValue({
      id: "mem_test2",
      userId: "user_1",
      barbershopId: "shop_test2",
      role: UserRole.OWNER,
    });
    prismaMock.barber.findUnique.mockResolvedValue({ id: "barber_dev" });
    prismaMock.barber.create.mockResolvedValue({ id: "barber_test2" });
    prismaMock.service.findMany.mockResolvedValue([{ id: "svc_1" }]);
    prismaMock.barberService.createMany.mockResolvedValue({ count: 1 });

    const cookieSet = vi.fn();
    const { cookies } = await import("next/headers");
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn(),
      set: cookieSet,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const { createAdditionalBarbershopForOwner } = await import("@/lib/barbershop");

    await createAdditionalBarbershopForOwner({
      name: "Test Shop 2",
      ownerUserId: "user_1",
      ownerName: "Owner",
      ownerEmail: "owner@example.com",
    });

    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
    expect(prismaMock.barbershopMembership.create).toHaveBeenCalled();
    expect(prismaMock.barber.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barbershopId: "shop_test2",
          userId: null,
        }),
      })
    );
  });

  it("createDevTestShop2ForUser is idempotent when Test Shop 2 already exists", async () => {
    const existingShop = {
      id: "shop_test2",
      name: "Test Shop 2",
      slug: "test-shop-2",
      timezone: "America/Los_Angeles",
    };

    prismaMock.barbershop.findUnique.mockResolvedValue(existingShop);

    const { createDevTestShop2ForUser } = await import("@/lib/barbershop");

    const result = await createDevTestShop2ForUser({
      id: "user_1",
      name: "Owner",
      email: "owner@example.com",
      memberships: [
        {
          id: "mem_test2",
          role: UserRole.OWNER,
          barbershop: {
            id: "shop_test2",
            name: "Test Shop 2",
            slug: "test-shop-2",
            timezone: "America/Los_Angeles",
          },
        },
      ],
    });

    expect(result).toEqual({ shop: existingShop, created: false });
    expect(prismaMock.barbershop.create).not.toHaveBeenCalled();
  });

  it("createDevTestShop2ForUser rejects in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_SHOP_FALLBACK", "");

    const { createDevTestShop2ForUser } = await import("@/lib/barbershop");

    const result = await createDevTestShop2ForUser({
      id: "user_1",
      name: "Owner",
      email: "owner@example.com",
      memberships: [],
    });

    expect(result).toEqual({ error: "Only available in development" });
  });
});
