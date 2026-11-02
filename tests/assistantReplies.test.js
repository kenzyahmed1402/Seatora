import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { drawsCard, systemInstruction } from "../services/agentChat.js";

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

  it("tells the model how to format replies and never to draw cards", () => {
    const rules = systemInstruction(new Date());
    assert.match(rules, /never tables/);
    assert.match(rules, /at most 6 showtimes/);
    assert.match(rules, /Never write a card, a button/);
    assert.match(rules, /getAvailableSeats/);
  });
});
