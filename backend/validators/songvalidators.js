import { body, param } from "express-validator";

export const createSongValidator = [
  body("title").trim().notEmpty().withMessage("Title is required"),
  body("artist").notEmpty().withMessage("Artist is required"),
  body("genre").notEmpty().withMessage("Genre is required"),
  // body("price").optional().withMessage("Price must be a number"),
  body("accessType").notEmpty().withMessage("adminAccess is required"),
  body("releaseDate").optional().isISO8601().toDate().withMessage("Invalid release date"),
  body("album").optional().isMongoId().withMessage("Invalid album ID"),
];

export const updateSongValidator = [
  param("id").isMongoId().withMessage("Invalid song ID"),
  body("title").optional().trim(),
  body("artist").optional(),
  body("genre").optional(),
  body("duration").optional(),
  body("price").optional().isNumeric().withMessage("Price must be a number"),
  body("isPremium").optional().isBoolean().withMessage("isPremium must be boolean"),
  body("includeInSubscription").optional().isBoolean().withMessage("includeInSubscription must be boolean"),
  body("releaseDate").optional().isISO8601().toDate().withMessage("Invalid release date"),
  body("album").optional().isMongoId().withMessage("Invalid album ID"),
];

export const songIdValidator = [
  param("id").isMongoId().withMessage("Invalid song ID"),
];