# Changelog

All notable changes to this project. Dates are in UTC.

## [2.0.0] - 2026-11 (Seatora)

The REST API becomes **Seatora**: a cinema-booking web app with an AI booking agent and PayPal payments.

### Accounts and security
- User accounts with JWT (HTTP-only `SameSite=Strict` session cookie in the browser, Bearer tokens for API clients), `CUSTOMER` and `ADMIN` roles, bcrypt password hashes.
- Guest checkout: a name, email and phone instead of an account; a guest can save the booking as an account later.
- Sign-up rules: names in one alphabet with reserved names refused (including look-alike spellings), reachable emails, no common or guessable passwords.
- Security headers (helmet, content security policy), CORS, rate limits on the API, logins, sign-ups, guests and the assistant, all counted in MongoDB; logins for unknown emails take as long as wrong passwords.
- Request bodies validated and reduced to allowed fields; consistent error responses without internal details.

### Bookings
- Seat holds: unpaid bookings hold their seats for 10 minutes, then expire and free them.
- Safe booking states (pending, confirmed, cancelled, expired, refunded, needs review); paid bookings can't be changed or deleted.
- A cancellation policy (100% refund up to 24 hours before the show, 50% up to 2 hours before) with the exact refund confirmed by the customer.
- A demo schedule that keeps the coming week filled.

### PayPal (Sandbox)
- Orders v2 created by the server from the booking's total; the browser never sends an amount.
- Server-side capture with status, amount, currency, payee and ownership checks; a payment after the hold ran out is refunded and flagged for review.
- Refunds through the Captures refund API.
- Webhooks verified with PayPal's signature-verification API, idempotent and safe against late or repeated delivery.
- The server refuses to start against live PayPal.

### AI booking agent
- A tool-calling agent with an allowlist of read tools and two propose tools that only create a booking or cancellation card; every card is confirmed by the customer's click and checked again by the server.
- Google Gemini with failover to a second Gemini model and to Groq, failure classification, short retries and cooling for rate-limited or overloaded models.
- Showtime results shown as tappable time chips; cards and prices only from tool results; guards against replies that skip a search, draw fake cards or show IDs.
- Compact requests: cinema-time dates, short tool results, earlier searches shortened.

### Web app
- React and TypeScript, served by the same Express app: a dark cinema design, a CSS 3D hall, posters drawn per genre, the Seatora logo.
- What's on with filters; time chips that ask how many seats and open the seat picker with the best seats chosen.
- The assistant page with time chips and booking cards; PayPal on the card, which turns into the ticket once paid.
- Checkout with a hold countdown; a ticket with a QR code, print and image download; My bookings with cancellations and refunds.
- A Privacy page; pages left open across a deploy reload themselves.

### Operations
- Deployment on Vercel with MongoDB Atlas; public lists cached briefly at the CDN.
- GitHub Actions: tests, a web app build and a secret scan on every push.

## [1.0.0] - 2026-08-24

### Added
- A REST API for cinemas, screens with seat layouts, movies and showtimes.
- Seat bookings with protection against double-booking and server-side prices.
- No overlapping showtimes on a screen; safe deletes; pagination, filters and sorting.
- Centralized error handling and request validation.

[2.0.0]: https://github.com/kenzyahmed1402/Seatora/compare/v1.0.0...develop
[1.0.0]: https://github.com/kenzyahmed1402/Seatora/releases/tag/v1.0.0
