import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { claimsShowtimes, compactHistory, drawsCard, systemInstruction, withoutIds } from "../services/agentChat.js";

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

  it("spots a reply that says it shows showtimes", () => {
    for (const reply of [
      "Here are the showtimes at Seatora Downtown for this weekend.",
      "Here are the 18 showtimes this Saturday.",
      "I found 4 comedy shows on Saturday.",
      "Great! I see two comedy showtimes at Downtown this weekend.",
      "There are 3 shows on Saturday.",
      // Saying there are none without having searched is just as unchecked
      "There are no showtimes matching that.",
    ]) {
      assert.equal(claimsShowtimes(reply), true, reply);
    }
    for (const reply of [
      "Which movie or time would you like?",
      "How many seats would you like?",
      "Your booking for 2 seats is ready to confirm.",
      "The show starts at 19:00.",
    ]) {
      assert.equal(claimsShowtimes(reply), false, reply);
    }
  });

  it("takes IDs out of replies, and nothing else", () => {
    const id = "6908a1b2c3d4e5f6a7b8c9d0";
    assert.equal(withoutIds(`The Crumb Conspiracy (ID: ${id}) at 15:00.`), "The Crumb Conspiracy at 15:00.");
    assert.equal(
      withoutIds(`- Sat 13:00 · Starlit Garden · showtime ID ${id}\n- Sun 18:00 · Velocity Run [${id}]`),
      "- Sat 13:00 · Starlit Garden\n- Sun 18:00 · Velocity Run"
    );
    for (const text of ["Seats A1-A2 are free.", "Price: $11 - evening", "Your booking ref is ABC123."]) {
      assert.equal(withoutIds(text), text);
    }
    assert.match(systemInstruction(new Date()), /never IDs/);
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

  it("gives the model the coming days with their weekdays, in cinema time", () => {
    // Monday 2 November 2026, 20:00 in Cairo (UTC+2)
    const rules = systemInstruction(new Date("2026-11-02T18:00:00Z"));
    assert.match(rules, /Mon 2026-11-02 \(today\), Tue 2026-11-03 \(tomorrow\)/);
    assert.match(rules, /Sat 2026-11-07, Sun 2026-11-08\./);
    assert.doesNotMatch(rules, /2026-11-09/);
    // Just before midnight in Cairo it's already the next day there
    assert.match(systemInstruction(new Date("2026-11-02T22:30:00Z")), /Tue 2026-11-03 \(today\)/);
  });

  it("stays short, since it's sent with every model call", () => {
    assert.ok(systemInstruction(new Date(), { loggedIn: false }).length / 4 < 700);
  });

  it("tells the model how to format replies and never to draw cards", () => {
    const rules = systemInstruction(new Date());
    assert.match(rules, /never tables/);
    assert.match(rules, /never say you can't show them, and don't write them out yourself/);
    assert.match(rules, /with what you know .* without asking first/);
    assert.match(rules, /Never write a card, a button/);
    assert.match(rules, /getAvailableSeats/);
    assert.match(rules, /call searchShowtimes in that turn, even if you searched before/);
  });
});
