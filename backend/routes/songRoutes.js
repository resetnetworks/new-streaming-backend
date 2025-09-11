import express from "express";
import { authenticateUser } from "../middleware/authenticate.js";
import {createSong, updateSong} from "../controllers/songController2.js";
import {
  deleteSong,
  getAllSongs,
  getSongById,
  getSongsMatchingUserGenres,
  getSongsByGenre,
  getSongsByAlbum,
  getSongsByArtist,
  getLikedSongs,
} from "../controllers/songController.js";
import { songUpload } from "../middleware/uploadMiddleware.js";
import {
  createSongValidator,
  updateSongValidator,
  songIdValidator,
} from "../validators/songValidators.js";
import validate from "../middleware/validate.js";

const router = express.Router();

// Like-related
router.get("/liked", authenticateUser, getLikedSongs);

// Genre-matching for user
router.get("/matching-genre", authenticateUser, getSongsMatchingUserGenres);

// CRUD + browse
router.get("/", authenticateUser, getAllSongs);
router.get("/:id", authenticateUser, songIdValidator, validate, getSongById);
router.post("/", authenticateUser, songUpload, createSongValidator, validate, createSong);
router.put("/:id", authenticateUser, songUpload, updateSongValidator, validate, updateSong);
router.delete("/:id", authenticateUser, songIdValidator, validate, deleteSong);

// Filtering routes
router.get("/genre/:genre", authenticateUser, getSongsByGenre);
router.get("/album/:albumId", authenticateUser, getSongsByAlbum);
router.get("/artist/:artistId", authenticateUser, getSongsByArtist);

export default router;
