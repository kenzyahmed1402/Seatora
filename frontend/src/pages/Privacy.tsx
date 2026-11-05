import { ShieldCheck } from "lucide-react";

// What Seatora does with personal data, in plain words. Keep it in step with
// the code: guestService (GUEST_DAYS), AgentConversation (CONVERSATION_HOURS),
// auth.js (cookies), paypalService (what PayPal is sent), rateLimitStore.
const SECTIONS: { title: string; points: string[] }[] = [
  {
    title: "This is a demo",
    points: [
      "Seatora is a demonstration: the movies and cinemas are fictional and payments use PayPal Sandbox, so no real money moves.",
      "Please use made-up details when you book.",
    ],
  },
  {
    title: "What we collect",
    points: [
      "As a guest: the name, email and phone number you give before holding seats.",
      "With an account: your name, email and password (stored only as a secure hash).",
      "Your bookings: the showtime, seats and price, with the name, email and phone they're for.",
      "Messages you send to the assistant.",
    ],
  },
  {
    title: "Why",
    points: [
      "Only to make and show your booking: your details appear on your ticket and in My bookings.",
      "We don't send emails or text messages, and we never sell or share your details.",
    ],
  },
  {
    title: "Who else is involved",
    points: [
      "PayPal handles payments. Seatora never sees card or bank details; PayPal is sent only the booking's reference and amount.",
      "The assistant's replies come from AI services (Google Gemini, and Groq as a backup). They receive the messages you type in the chat, never your name, email or phone, so don't type personal details there.",
    ],
  },
  {
    title: "How long we keep it",
    points: [
      "An unused guest account is deleted after 7 days; one with a booking is kept so the ticket keeps working.",
      "Assistant conversations are deleted 24 hours after the last message.",
      "Bookings are kept as the record of the booking.",
      "To limit abuse, request counts are kept for a short time against a scrambled (hashed) form of your IP address, never the address itself.",
    ],
  },
  {
    title: "Cookies",
    points: [
      "One cookie keeps you logged in (up to 7 days), and one lets a visitor's chat continue (1 day). Both are needed for the site to work.",
      "There are no advertising or tracking cookies.",
    ],
  },
];

export const PrivacyPage = () => (
  <div className="privacy-page">
    <h1 className="section-title">
      <ShieldCheck size={22} aria-hidden="true" /> Privacy
    </h1>
    <div className="privacy-sections">
      {SECTIONS.map(({ title, points }) => (
        <section key={title} className="card privacy-section">
          <h2>{title}</h2>
          <ul>
            {points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  </div>
);
