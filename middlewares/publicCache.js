// Lets the hosting platform's CDN (Vercel) keep a public list for a short
// while, so the home page loads without waiting for the server and the
// database each time. Browsers always ask again (max-age=0); the CDN serves
// its copy for `seconds`, then a stale copy while it fetches a new one, for
// up to `staleSeconds`. Only for public data that's the same for everyone:
// seat maps, bookings and anything per user are never cached. Error
// responses replace this with no-store (middlewares/errorHandler.js).
const publicCache = (seconds, staleSeconds) => (req, res, next) => {
  res.setHeader("Cache-Control", `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${staleSeconds}`);
  next();
};

export default publicCache;
