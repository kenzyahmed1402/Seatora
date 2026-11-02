import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compactHistory, drawsCard, systemInstruction } from "../services/agentChat.js";

describe("assistant replies", () => {
  it("spots a reply that draws its own card or button", () => {
    for (const reply of [
      "[Confirm Booking] (click to proceed to PayPal)",
      "Here’s a booking card for 2 seats (A1, A2) at $11 each.",
      "Here's your card.",
      "Press Confirm on the card below.",
      "Click here to pay.",
    ]) {
      assert.equal(drawsCard(reply), true, reply);
    }
    for (const reply of [
      "Which seats would you like?",
      "Once you choose, I'll prepare a booking card.",
      "Here are the movies: [Orbit of Ashes] is on at 20:00.",
      "You can cancel up to 2 hours before the show.",
    ]) {
      assert.equal(drawsCard(reply), false, reply);
    }
  });

  it("shortens earlier search results, so the model searches again instead of listing from memory", () => {
    const history = [
      { role: "user", parts: [{ text: "What's on?" }] },
      { role: "model", parts: [{ functionCall: { name: "searchShowtimes", args: {} } }, { functionCall: { name: "getMyBookings", args: {} } }] },
      {
        role: "user",
        parts: [
          { functionResponse: { name: "searchShowtimes", response: { output: [{ showtime: "s1" }, { showtime: "s2" }] } } },
          { functionResponse: { name: "getMyBookings", response: { output: [{ booking: "b1" }] } } },
        ],
      },
      { role: "user", parts: [{ functionResponse: { name: "searchShowtimes", response: { error: "Invalid date" } } }] },
    ];
    const compact = compactHistory(history);
    assert.deepEqual(compact[2].parts[0].functionResponse, {
      name: "searchShowtimes",
      response: { output: { showtimesShownToCustomer: 2, note: "Shown to the customer earlier. Search again to see or use them." } },
    });
    // Other tools' results and refusals stay as they were
    assert.deepEqual(compact[2].parts[1], history[2].parts[1]);
    assert.deepEqual(compact[3], history[3]);
    assert.deepEqual(compact.slice(0, 2), history.slice(0, 2));
  });

  it("gives the model the coming days with their weekdays and search windows", () => {
    // Monday 2 November 2026, 20:00 in Cairo (UTC+2)
    const rules = systemInstruction(new Date("2026-11-02T18:00:00Z"));
    assert.match(rules, /Today, Monday 2 November: from 2026-11-01T22:00:00.000Z to 2026-11-02T22:00:00.000Z/);
    assert.match(rules, /Saturday 7 November: from 2026-11-06T22:00:00.000Z to 2026-11-07T22:00:00.000Z/);
    assert.match(rules, /Sunday 8 November/);
    assert.doesNotMatch(rules, /Monday 9 November/);
  });

  it("tells the model how to format replies and never to draw cards", () => {
    const rules = systemInstruction(new Date());
    assert.match(rules, /never tables/);
    assert.match(rules, /never say you can't show them, and don't write them out yourself/);
    assert.match(rules, /search right away with what you know/);
    assert.match(rules, /Never write a card, a button/);
    assert.match(rules, /getAvailableSeats/);
    assert.match(rules, /call searchShowtimes in that turn, even if you searched before/);
  });
});
