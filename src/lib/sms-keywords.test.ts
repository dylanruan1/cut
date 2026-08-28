import { describe, it, expect } from "vitest";
import { classifyInboundSms, helpReply } from "./sms-keywords";

describe("classifyInboundSms", () => {
  it("recognises the carrier-standard stop words", () => {
    for (const w of ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]) {
      expect(classifyInboundSms(w)).toBe("STOP");
    }
  });

  it("ignores case, whitespace and trailing punctuation", () => {
    expect(classifyInboundSms("  stop  ")).toBe("STOP");
    expect(classifyInboundSms("Stop.")).toBe("STOP");
    expect(classifyInboundSms("STOP!")).toBe("STOP");
    expect(classifyInboundSms("help?")).toBe("HELP");
  });

  it("recognises start and help", () => {
    expect(classifyInboundSms("START")).toBe("START");
    expect(classifyInboundSms("unstop")).toBe("START");
    expect(classifyInboundSms("HELP")).toBe("HELP");
    expect(classifyInboundSms("info")).toBe("HELP");
  });

  it("does NOT opt someone out for a sentence containing a keyword", () => {
    // The dangerous case: someone asking to cancel an appointment would be
    // silently unsubscribed from every future message.
    expect(classifyInboundSms("please cancel my appointment")).toBe("NONE");
    expect(classifyInboundSms("can you stop by earlier")).toBe("NONE");
    expect(classifyInboundSms("I need help with my booking")).toBe("NONE");
    expect(classifyInboundSms("STOP BY AT 3")).toBe("NONE");
  });

  it("treats ordinary replies as nothing", () => {
    expect(classifyInboundSms("thanks!")).toBe("NONE");
    expect(classifyInboundSms("")).toBe("NONE");
    expect(classifyInboundSms("👍")).toBe("NONE");
  });
});

describe("helpReply", () => {
  it("names the shop and stays inside one SMS segment", () => {
    const msg = helpReply("Fades Barbershop");
    expect(msg).toContain("Fades Barbershop");
    expect(msg).toContain("STOP");
    expect(msg.length).toBeLessThanOrEqual(160);
  });

  it("falls back to Cut when the shop is unknown", () => {
    expect(helpReply(null)).toContain("Cut");
  });
});
