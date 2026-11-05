import express from "express";
import {
  createMovie,
  getMovies,
  getMovieById,
  updateMovie,
  deleteMovie,
} from "../controllers/movieController.js";
import validateObjectId from "../middlewares/validateObjectId.js";
import { validateMovie, validateMovieUpdate } from "../validators/movieValidator.js";
import { protect, restrictTo } from "../middlewares/auth.js";
import publicCache from "../middlewares/publicCache.js";

const MoviesRouter = express.Router();

// The same for everyone, so the CDN can keep it briefly (the home page)
MoviesRouter.get("/", publicCache(30, 300), getMovies);
MoviesRouter.get("/:id", validateObjectId(), getMovieById);
MoviesRouter.post("/", protect, restrictTo("ADMIN"), validateMovie, createMovie);
MoviesRouter.put("/:id", protect, restrictTo("ADMIN"), validateObjectId(), validateMovieUpdate, updateMovie);
MoviesRouter.delete("/:id", protect, restrictTo("ADMIN"), validateObjectId(), deleteMovie);

export default MoviesRouter;
