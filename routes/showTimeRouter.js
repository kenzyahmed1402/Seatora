import express from "express";
import {
  createShowtime,
  getShowtimes,
  getShowtimeById,
  getSeatMap,
  updateShowtime,
  deleteShowtime,
} from "../controllers/showTimeController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { validateShowtime, validateShowtimeUpdate } from "../validators/showtimeValidator.js";
import { protect, restrictTo } from "../middlewares/auth.js";
import { expireOverdueHolds } from "../utils/bookingHolds.js";
import publicCache from "../middlewares/publicCache.js";

const STRouter = express.Router();

// Seat counts never include holds that have already run out
// The list is the same for everyone, so the CDN can keep it briefly (the
// home page); its seat counts may then be up to 30 s old. The seat map, which
// booking uses, is never cached.
STRouter.get("/", publicCache(30, 300), expireOverdueHolds, getShowtimes);
STRouter.get("/:id", validateObjectId(), expireOverdueHolds, getShowtimeById);
STRouter.get("/:id/seats", validateObjectId(), expireOverdueHolds, getSeatMap);
STRouter.post("/", protect, restrictTo("ADMIN"), validateShowtime, createShowtime);
STRouter.put("/:id", protect, restrictTo("ADMIN"), validateObjectId(), validateShowtimeUpdate, updateShowtime);
STRouter.delete("/:id", protect, restrictTo("ADMIN"), validateObjectId(), deleteShowtime);

export default STRouter;
