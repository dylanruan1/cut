import { describe, it, expect } from "vitest";
import { detectSpokenLanguage } from "./twilio";

describe("detectSpokenLanguage", () => {
  const english = [
    "I want a haircut tomorrow at 4",
    "yeah can I get a fade with any barber",
    "4",
    "Marcus",
    "yes that's correct thanks",
    "si",
    "I need an appointment for a beard trim",
    "for a haircut",
  ];
  const spanish = [
    "Hola, quiero una cita para un corte",
    "buenos dias, necesito una cita",
    "quisiera un corte de pelo manana",
    "¿Tienen disponible hoy?",
    "me llamo Juan, para una cita por favor",
    "hola",
    "quiero hablar español",
  ];

  it.each(english)("keeps English for: %s", (text) => {
    expect(detectSpokenLanguage(text, "en")).toBe("en");
  });

  it.each(spanish)("detects Spanish for: %s", (text) => {
    expect(detectSpokenLanguage(text, "en")).toBe("es");
  });

  it("stays Spanish on short replies once detected", () => {
    expect(detectSpokenLanguage("si", "es")).toBe("es");
    expect(detectSpokenLanguage("4", "es")).toBe("es");
    expect(detectSpokenLanguage("Juan", "es")).toBe("es");
  });
});
