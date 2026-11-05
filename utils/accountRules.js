// Rules for the name, email and password people sign up with (POST
// /auth/register and /auth/upgrade). Accounts made by the app itself (the
// admin seed, guests) don't go through them.

export const NAME_MAX_LENGTH = 50;
const NAME_MIN_LETTERS = 2;

// Letters of any alphabet (with their accents), in words joined by a space,
// a hyphen, an apostrophe or a full stop: "Mary-Jane", "O'Brien", "J. R. Smith".
// No digits or symbols.
const NAME_FORMAT = /^\p{L}[\p{L}\p{M}]*(?:(?:\. |[ '’.-])\p{L}[\p{L}\p{M}]*)*\.?$/u;

// Fullwidth and styled letters become plain ones ("ａｄｍｉｎ", "𝐚𝐝𝐦𝐢𝐧"), and
// runs of spaces become one
export const normalizeName = (value) => value.normalize("NFKC").trim().replace(/\s+/g, " ");

// Cyrillic and Greek letters that look like Latin ones
const LOOKALIKES = {
  а: "a", в: "b", е: "e", ё: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x",
  і: "i", ї: "i", ј: "j", ԁ: "d", ѕ: "s", ӏ: "l", п: "n", ь: "b",
  α: "a", β: "b", ε: "e", η: "n", ι: "i", κ: "k", μ: "u", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x",
};

// What a name reads as: lower case, no accents, look-alikes replaced, Arabic
// letter variants unified, and nothing but letters, so "A d-m í n" and
// "Аdmin" (Cyrillic А) both read "admin"
const skeleton = (text, { lookalikes = true } = {}) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/./gu, (char) => (lookalikes && LOOKALIKES[char]) || char)
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "")
    .replace(/[^\p{L}]/gu, "");

// Names that would pass for the cinema, its staff or the system. These are
// refused anywhere in a name...
const RESERVED_ANYWHERE = [
  "admin", "seatora", "cinemate", "paypal", "moderator", "superuser", "sysadmin", "webmaster",
  // Cyrillic and Arabic: admin, manager, management, support, Seatora, PayPal
  "админ", "адмін", "администратор", "модератор",
  "ادمن", "مدير", "اداره", "الدعم", "سيتورا", "بايبال",
];
// ...and these as a whole word, or as the whole name ("Support", "Help Desk"),
// since they're also parts of real names (Stafford, Modesto)
const RESERVED_WORDS = new Set([
  "root", "system", "support", "staff", "team", "owner", "official", "mod", "operator", "help", "helpdesk",
  "security", "service", "guest", "bot", "anonymous", "null", "undefined",
]);

const isReserved = (name) => {
  const whole = skeleton(name);
  const plain = skeleton(name, { lookalikes: false });
  if (RESERVED_ANYWHERE.some((word) => whole.includes(word) || plain.includes(word))) return true;
  return RESERVED_WORDS.has(whole) || name.split(/[ '’.-]+/).some((word) => RESERVED_WORDS.has(skeleton(word)));
};

// The problem with a (normalized) name, or null if it's fine
export const nameProblem = (name) => {
  if (!NAME_FORMAT.test(name)) {
    return "name can only contain letters, with a space, hyphen, apostrophe or full stop between words";
  }
  if ((name.match(/\p{L}/gu) ?? []).length < NAME_MIN_LETTERS) {
    return `name must have at least ${NAME_MIN_LETTERS} letters`;
  }
  // Mixing these is how look-alike names are made
  const scripts = [/\p{Script=Latin}/u, /\p{Script=Cyrillic}/u, /\p{Script=Greek}/u].filter((script) => script.test(name));
  if (scripts.length > 1) {
    return "name must be written in one alphabet";
  }
  if (isReserved(name)) {
    return "This name is reserved. Please use your own name";
  }
  return null;
};

// A phone number as people type it: spaces, dashes, dots and brackets go,
// a leading + stays ("+20 100-123 4567" becomes "+201001234567")
export const normalizePhone = (value) => value.trim().replace(/[\s().-]/g, "");

// 7 to 15 digits (the international maximum), optionally after a +
export const phoneProblem = (phone) =>
  /^\+?\d{7,15}$/.test(phone) ? null : "phone must be a phone number of 7 to 15 digits, optionally starting with +";

// .invalid can never receive mail (RFC 2606). Guest accounts use
// @guest.invalid, so nobody can sign up with an address that looks like one.
export const emailProblem = (email) =>
  /\.invalid$/i.test(email) ? "email must be an address you can receive mail at" : null;

// The passwords tried first when guessing
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword",
  "12345678", "123456789", "1234567890", "0123456789", "87654321", "qwertyui", "qwertyuiop", "qwerty123",
  "qwerty12", "1q2w3e4r", "1qaz2wsx", "zaq12wsx", "asdfghjkl", "abcd1234", "abc12345", "abcdefgh",
  "iloveyou", "sunshine", "princess", "football", "baseball", "superman", "trustno1", "welcome1",
  "letmein1", "admin123", "monkey123", "dragon123", "seatora", "seatora1", "seatora123", "cinema123",
]);

// The problem with a password, or null if it's fine. The length limits are
// checked by the validator.
export const passwordProblem = (password, { name, email } = {}) => {
  const lower = password.toLowerCase();
  const text = (value) => (typeof value === "string" ? value : "");
  const own = [text(email), text(email).split("@")[0], text(name), skeleton(text(name))]
    .filter((value) => value.length > 0)
    .map((value) => value.toLowerCase());
  // "aaaaaaaa", "abababab", eight spaces
  const tooFewCharacters = new Set(lower).size < 4 || lower.trim() === "";
  if (tooFewCharacters || COMMON_PASSWORDS.has(lower) || own.includes(lower) || own.includes(skeleton(lower))) {
    return "password is too easy to guess. Try a longer phrase, or mix in other words";
  }
  return null;
};
