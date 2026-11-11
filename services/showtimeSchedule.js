import Cinema from "../models/cinema.js";
import Screen from "../models/screens.js";
import Movie from "../models/movies.js";
import Showtime from "../models/showTime.js";
import { DEMO_CINEMAS, DEMO_DAYS, DEMO_MOVIES, planShowtimes } from "../scripts/demoCatalogue.js";
import { DEFAULT_TIME_ZONE, localParts, zonedTime } from "../utils/timezone.js";
import { MongoRateLimitStore } from "../utils/rateLimitStore.js";

// Keeps the demo schedule running: the seed plans one week of showtimes, so
// without this the site has nothing to show a week later. When showtimes
// are searched, the next DEMO_DAYS days are planned again the way the seed
// does it, and a screen gets showtimes only on a day it has none, so nothing
// added by hand is overlapped or doubled. Only the demo catalogue (the
// cinemas, screens and movies the seed created, found by name) is used;
// with any other catalogue nothing is added. SHOWTIME_AUTOFILL=off turns
// it off.

const MINUTE = 60 * 1000;
// Checked at most this often by each running instance...
const INSTANCE_INTERVAL_MS = 10 * MINUTE;
// ...and this often across all of them (the count is kept in MongoDB)
const SHARED_INTERVAL_MS = 60 * MINUTE;

const sharedRuns = new MongoRateLimitStore("schedule:");
sharedRuns.init({ windowMs: SHARED_INTERVAL_MS });

const dayKey = (date, timeZone) => {
  const { year, month, day } = localParts(date, timeZone);
  return `${year}-${month}-${day}`;
};

// Adds the missing showtimes for the next `days` days. Returns how many were
// added.
export const fillSchedule = async ({ now = new Date(), timeZone = process.env.CINEMA_TZ || DEFAULT_TIME_ZONE, days = DEMO_DAYS } = {}) => {
  const cinemas = await Cinema.find({ name: { $in: DEMO_CINEMAS.map((cinema) => cinema.name) } }).lean();
  const movies = await Movie.find({ title: { $in: DEMO_MOVIES.map((movie) => movie.title) } }).lean();
  if (cinemas.length === 0 || movies.length === 0) return 0;
  const screens = await Screen.find({ cinema: { $in: cinemas.map((cinema) => cinema._id) } }).lean();

  const cinemaIds = DEMO_CINEMAS.map(({ name }) => cinemas.find((cinema) => cinema.name === name)?._id);
  const movieIds = DEMO_MOVIES.map(({ title }) => movies.find((movie) => movie.title === title)?._id);
  const screenId = (cinemaIndex, screenIndex) => {
    const cinema = cinemaIds[cinemaIndex];
    const number = DEMO_CINEMAS[cinemaIndex].screens[screenIndex].screenNumber;
    return cinema && screens.find((screen) => screen.cinema.equals(cinema) && screen.screenNumber === number)?._id;
  };

  // Screens that already have showtimes on a day, from the start of today
  const today = localParts(now, timeZone);
  const from = zonedTime({ year: today.year, month: today.month, day: today.day }, timeZone);
  const to = zonedTime({ year: today.year, month: today.month, day: today.day + days }, timeZone);
  const existing = await Showtime.find({ startTime: { $gte: from, $lt: to } }, { screen: 1, startTime: 1 }).lean();
  const busy = new Set(existing.map(({ screen, startTime }) => `${screen}|${dayKey(startTime, timeZone)}`));

  const missing = planShowtimes({ now, timeZone, days })
    .map(({ cinemaIndex, screenIndex, movieIndex, startTime, price }) => ({
      screen: screenId(cinemaIndex, screenIndex),
      movie: movieIds[movieIndex],
      startTime,
      price,
    }))
    .filter(({ screen, movie, startTime }) => screen && movie && !busy.has(`${screen}|${dayKey(startTime, timeZone)}`));
  if (missing.length === 0) return 0;

  // Another instance may be adding the same ones: a duplicate (same screen
  // and start) is refused by the unique index and skipped
  try {
    const added = await Showtime.insertMany(missing, { ordered: false });
    return added.length;
  } catch (err) {
    if (err.code === 11000 || err.writeErrors?.every((e) => e.code === 11000)) {
      return err.insertedDocs?.length ?? 0;
    }
    throw err;
  }
};

let lastCheck = 0;
let running;

// Fills the schedule if it's time to check. Never fails the search that
// called it: a problem is logged and the next check tries again.
export const keepScheduleFilled = async (now = Date.now()) => {
  if (process.env.SHOWTIME_AUTOFILL === "off") return;
  if (running) return running;
  if (now - lastCheck < INSTANCE_INTERVAL_MS) return;
  lastCheck = now;
  running = (async () => {
    let claimed = false;
    try {
      claimed = (await sharedRuns.increment("fill")).totalHits === 1;
      if (!claimed) return;
      const added = await fillSchedule();
      if (added > 0) console.log(`Showtime schedule: added ${added} showtimes`);
    } catch (err) {
      console.error(`Showtime schedule check failed: ${err.message}`);
      lastCheck = 0;
      if (claimed) await sharedRuns.decrement("fill").catch(() => {});
    } finally {
      running = undefined;
    }
  })();
  return running;
};

// Forgets when it last checked. For tests; not reachable from any request.
export const resetScheduleCheck = () => {
  lastCheck = 0;
};
