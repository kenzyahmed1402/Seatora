import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emailProblem, nameProblem, normalizeName, normalizePhone, passwordProblem, phoneProblem } from "../utils/accountRules.js";

const check = (name) => nameProblem(normalizeName(name));

describe("account rules", () => {
  it("refuses reserved names, including look-alike spellings", () => {
    const reserved = [
      "admin", "Admin", "a d m i n", "Ad-min", "Ádmín", "Administrator", "the admin team",
      "ａｄｍｉｎ", "𝐚𝐝𝐦𝐢𝐧", // fullwidth and styled letters
      "Seatora", "Seatora Support", "PayPal", "Moderator", "Support", "Help Desk", "Staff", "Guest", "Mod",
      "админ", "Модератор", "مدير", "أدمن",
    ];
    for (const name of reserved) assert.match(check(name) ?? "", /reserved/, name);
  });

  it("refuses names mixing look-alike alphabets", () => {
    assert.match(check("Аdmin"), /one alphabet/); // Cyrillic А
    assert.match(check("Jοhn"), /one alphabet/); // Greek ο
  });

  it("refuses digits, symbols and names under 2 letters", () => {
    for (const name of ["admin123", "Jane2", "<script>", "Jane--Doe", "-Jane", "Jane_Doe", "🎬", "J", "J."]) {
      assert.notEqual(check(name), null, name);
    }
  });

  it("accepts real names, including ones that contain a reserved word's letters", () => {
    const names = [
      "Jane", "Mary-Jane O'Brien", "O’Neil", "J. R. Smith", "Dr. Who", "Zoë Saldaña", "Kenzy Ahmed",
      "كنزي أحمد", "Ахмед", "李小龙", "Stafford Lee", "Modesto Diaz", "Edmond", "Teaman",
    ];
    for (const name of names) assert.equal(check(name), null, name);
  });

  it("tidies spaces and styled letters", () => {
    assert.equal(normalizeName("  Jane    Doe "), "Jane Doe");
    assert.equal(normalizeName("Ｊａｎｅ"), "Jane");
  });

  it("refuses easy passwords", () => {
    const owner = { name: "Jane Doe", email: "jane@example.com" };
    for (const password of ["password123", "Password123", "12345678", "aaaaaaaa", "        ", "abababab", "jane@example.com", "JANE", "janedoe", "Jane Doe"]) {
      assert.notEqual(passwordProblem(password, owner), null, password);
    }
    for (const password of ["film-night-42", "a-long-password", "correct horse battery"]) {
      assert.equal(passwordProblem(password, owner), null, password);
    }
    // Other fields of the wrong type don't break the check
    assert.equal(passwordProblem("film-night-42", { name: 5, email: {} }), null);
  });

  it("tidies phone numbers and accepts 7 to 15 digits, optionally after +", () => {
    assert.equal(normalizePhone(" +20 100-123 4567 "), "+201001234567");
    assert.equal(normalizePhone("(010) 012.34567"), "01001234567");
    for (const phone of ["+201001234567", "01001234567", "5551234"]) assert.equal(phoneProblem(phone), null, phone);
    for (const phone of ["12345", "+1234567890123456", "call1234567", "++201001234567"]) assert.notEqual(phoneProblem(phone), null, phone);
  });

  it("refuses .invalid emails, which guests use", () => {
    assert.notEqual(emailProblem("guest-1@guest.invalid"), null);
    assert.notEqual(emailProblem("a@GUEST.INVALID"), null);
    assert.equal(emailProblem("jane@example.com"), null);
  });
});
