import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, useTestDatabase } from "./helpers.js";
import Cinema from "../models/cinema.js";
import Screen from "../models/screens.js";
import Movie from "../models/movies.js";
import Showtime from "../models/showTime.js";
import { DEMO_CINEMAS, DEMO_MOVIES, planShowtimes } from "../scripts/demoCatalogue.js";
import { fillSchedule, resetScheduleCheck } from "../services/showtimeSchedule.js";
import { localParts, zonedTime } from "../utils/timezone.js";

useTestDatabase();

const timeZone = "Africa/Cairo";
const DAY = 24 * 60 * 60 * 1000;

// The demo catalogue as the seed creates it, without showtimes
const demoCatalogue = async () => {
  const cinemas = await Cinema.insertMany(DEMO_CINEMAS.map(({ name, location }) => ({ name, location })));
  await Screen.insertMany(
    DEMO_CINEMAS.flatMap((cinema, i) =>
      cinema.screens.map((screen) => ({ ...screen, capacity: screen.rows * screen.seatsPerRow, cinema: cinemas[i]._id }))
    )
  );
  await Movie.insertMany(DEMO_MOVIES);
};

describe("showtime schedule", () => {
  afterEach(() => {
    process.env.SHOWTIME_AUTOFILL = "off";
    resetScheduleCheck();
  });

  it("plans the coming week for the demo catalogue, once", async () => {
    await demoCatalogue();
    const now = new Date();
    const added = await fillSchedule({ now, timeZone });
    assert.equal(added, planShowtimes({ now, timeZone }).length);
    assert.equal(await Showtime.countDocuments(), added);
    assert.equal(await fillSchedule({ now, timeZone }), 0);
  });

  it("adds the days that ran out, and leaves days that have showtimes alone", async () => {
    await demoCatalogue();
    const lastWeek = new Date(Date.now() - 9 * DAY);
    await fillSchedule({ now: lastWeek, timeZone });
    assert.equal(await Showtime.countDocuments({ startTime: { $gt: new Date() } }), 0);

    // A showtime added by hand tomorrow on one screen: that screen and day stay as they are
    const screen = await Screen.findOne();
    const movie = await Movie.findOne();
    const handMade = await Showtime.create({ screen: screen._id, movie: movie._id, startTime: new Date(Date.now() + DAY), price: 5 });

    const now = new Date();
    assert.ok((await fillSchedule({ now, timeZone })) > 0);
    const { year, month, day } = localParts(handMade.startTime, timeZone);
    const sameDay = await Showtime.find({
      screen: screen._id,
      startTime: { $gte: zonedTime({ year, month, day }, timeZone), $lt: zonedTime({ year, month, day: day + 1 }, timeZone) },
    });
    assert.deepEqual(sameDay.map((s) => String(s._id)), [String(handMade._id)]);
    assert.ok(await Showtime.exists({ startTime: { $gt: new Date(Date.now() + 5 * DAY) } }));
  });

  it("adds nothing to any other catalogue", async () => {
    await Cinema.create({ name: "Another Cinema", location: "Elsewhere" });
    await Movie.create({ title: "Another Movie", genre: "Drama", duration: 90 });
    assert.equal(await fillSchedule({ timeZone }), 0);
  });

  it("runs when showtimes are listed, so the site always has a week to show", async () => {
    await demoCatalogue();
    process.env.SHOWTIME_AUTOFILL = "on";
    const res = await api.get("/showTimes?upcoming=true&limit=5");
    assert.equal(res.status, 200);
    assert.equal(res.body.data.showtimes.length, 5);
  });
});
