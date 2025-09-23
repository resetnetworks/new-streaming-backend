import { Album } from "../models/Album.js";

import { Song } from "../models/Song.js";
import {
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
} from "../errors/index.js";
import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";
import { isAdmin } from "../utils/authHelper.js";
import { uploadToS3 } from "../utils/s3Uploader.js";
import { Artist } from "../models/Artist.js";
import { shapeAlbumResponse } from "../dto/album.dto.js";
import { hasAccessToSong } from "../utils/accessControl.js";
import { convertCurrencies } from "../utils/convertCurrencies.js";

// Album Controllers

// Create a new album (Admin only)
// - Handles optional file upload to S3 for cover image
// - Accepts basic album info and genre as comma-separated string
export const createAlbum = async (req, res) => {
  // 🔒 Admin check
  if (!isAdmin(req.user)) {
    throw new UnauthorizedError("Access denied. Admins only.");
  }

  // 📥 Extract data
  const { title, description, artist, releaseDate,  accessType, genre } =
    req.body;
    let { basePrice } = req.body;
 if(typeof basePrice === "string"){
  basePrice = JSON.parse(basePrice);
 }
  // ✅ Required validation
  if (!title || !artist || !releaseDate) {
    throw new BadRequestError("Title, artist, and release date are required.");
  }

  // 💰 Validate price if purchase-only
  if (accessType === "purchase-only" && (!basePrice.amount || basePrice <= 0)) {
    throw new BadRequestError("Purchase-only albums must have a valid price.");
  }

  // ☁️ Handle cover image upload
  const coverImageUrl = req.files?.coverImage?.[0]?.location;
  

  // 🎵 Normalize genre field
  const processedGenre =
    typeof genre === "string" ? genre.split(",").map((g) => g.trim()) : genre;

    const convertedPrices = basePrice.amount ? await convertCurrencies(basePrice.currency, basePrice.amount) : [];

  // 📦 Create album
  const newAlbum = await Album.create({
    title,
    description,
    artist,
    releaseDate,
    accessType: accessType || "subscription",
    basePrice: accessType === "purchase-only" ? basePrice : {},
    convertedPrices: accessType === "purchase-only" ? convertedPrices : [],
    coverImage: coverImageUrl,
    genre: processedGenre,
    price:12
  });
  console.log("New Album Created:", newAlbum);

  // 🎯 Return shaped response
  const shaped = shapeAlbumResponse(newAlbum);
  res.status(StatusCodes.CREATED).json({ success: true, album: shaped });
};

// Get a paginated list of all albums
// - Supports `page` and `limit` query parameters
// - Populates songs with selected fields
export const getAllAlbums = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, parseInt(req.query.limit) || 10);
  const skip = (page - 1) * limit;

  // 📦 Fetch albums with populated fields and lean objects
  const [albums, total] = await Promise.all([
    Album.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("songs", "title duration coverImage")
      .populate("artist", "name slug")
      .lean(),
    Album.countDocuments(),
  ]);

  // 🧠 Transform using DTO
  const shapedAlbums = albums.map(shapeAlbumResponse);

  res.status(StatusCodes.OK).json({
    success: true,
    albums: shapedAlbums,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
};

// Delete an album by ID (Admin only)
// - Also unlinks album reference from associated songs
export const deleteAlbum = async (req, res) => {
  if (!isAdmin(req.user)) {
    throw new UnauthorizedError("Access denied. Admins only.");
  }

  const album = await Album.findById(req.params.id);
  if (!album) {
    throw new NotFoundError("Album not found");
  }

  // Optional: Remove album reference from songs
  await Song.updateMany(
    { _id: { $in: album.songs } },
    { $unset: { album: "" } }
  );

  await album.deleteOne();

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Album deleted successfully",
  });
};

// Get a single album by ID or slug
// - Dynamically detects whether the param is an ObjectId or slug
// - Populates associated songs with selected fields
export const getAlbumById = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  const query = mongoose.Types.ObjectId.isValid(id)
    ? { _id: id }
    : { slug: id };

  const album = await Album.findOne(query)
    .populate(
      "songs",
      "title duration coverImage audioUrl accessType price artist"
    )
    .populate("artist", "name slug")
    .lean();

  if (!album) {
    throw new NotFoundError("Album not found");
  }

  // Access control: hide audioUrl if not authorized
  const shapedSongs = await Promise.all(
    (album.songs || []).map(async (song) => {
      const hasAccess = await hasAccessToSong(user, song);
      return {
        _id: song._id,
        title: song.title,
        duration: song.duration,
        coverImage: song.coverImage,
        audioUrl: hasAccess ? song.audioUrl : null,
      };
    })
  );

  // Return shaped album
  const shapedAlbum = shapeAlbumResponse({ ...album, songs: shapedSongs });

  res.status(StatusCodes.OK).json({ success: true, album: shapedAlbum });
};

// Update an existing album (Admin only)
// - Handles optional file upload for new cover image
// - Allows partial updates for album fields
export const updateAlbum = async (req, res) => {
  // Only admins allowed
  if (!isAdmin(req.user)) {
    throw new UnauthorizedError("Access denied. Admins only.");
  }

  const album = await Album.findById(req.params.id);
  if (!album) {
    throw new NotFoundError("Album not found");
  }

  const { title, description, artist, releaseDate, price, accessType, genre } =
    req.body;

  // Validation for price based on accessType
  if (accessType === "purchase-only") {
    if (!price || price <= 0) {
      throw new BadRequestError(
        "Purchase-only albums must have a valid price."
      );
    }
    album.accessType = "purchase-only";
    album.price = price;
  } else if (accessType === "subscription") {
    album.accessType = "subscription";
    album.price = 0;
  }

  // Optional updates
  if (title) album.title = title;
  if (description) album.description = description;
  if (artist) album.artist = artist;
  if (releaseDate) album.releaseDate = releaseDate;

  if (typeof genre === "string") {
    album.genre = genre.split(",").map((g) => g.trim());
  }

  const coverImageFile = req.files?.coverImage?.[0];
  if (coverImageFile) {
    album.coverImage = await uploadToS3(coverImageFile, "covers");
  }

  await album.save();

  res.status(StatusCodes.OK).json({
    success: true,
    album: shapeAlbumResponse(album.toObject()),
  });
};

// Get all albums for a specific artist
// Get albums for an artist by ID or slug with pagination
export const getAlbumsByArtist = async (req, res) => {
  const { artistId } = req.params;

  // 🔍 Resolve artist by ID or slug
  const artist = mongoose.Types.ObjectId.isValid(artistId)
    ? await Artist.findById(artistId).lean()
    : await Artist.findOne({ slug: artistId }).lean();

  if (!artist) {
    throw new NotFoundError("Artist not found");
  }

  // 📄 Pagination
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const skip = (page - 1) * limit;

  const [albums, total] = await Promise.all([
    Album.find({ artist: artist._id })
      .sort({ releaseDate: -1 })
      .skip(skip)
      .limit(limit)
      .select("title slug coverImage releaseDate accessType basePrice convertedPrices")
      .lean(),
    Album.countDocuments({ artist: artist._id }),
  ]);
 console.log("Albums for artist:", albums);
  // 🧠 Shape albums for frontend + inject artist info into each album
  const shapedAlbums = albums.map((album) => ({
    ...shapeAlbumResponse(album),
    artist: {
      name: artist.name,
      slug: artist.slug,
      image: artist.image,
    },
  }));

  res.status(StatusCodes.OK).json({
    success: true,
    artist: {
      id: artist._id,
      name: artist.name,
      slug: artist.slug,
      image: artist.image,
      subscriptionPrice: artist.subscriptionPrice,
    },
    albums: shapedAlbums,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
};

// Get All Album Without Pagination

export const getAllAlbumsWithoutpagination = async (req, res) => {
  const albums = await Album.find()
    .sort({ createdAt: -1 })
    .populate("songs", "title duration coverImage")
    .populate("artist", "name slug")
    .lean();

  const shapedAlbums = albums.map(shapeAlbumWithSongs);

  res.status(StatusCodes.OK).json({
    success: true,
    albums: shapedAlbums,
    total: shapedAlbums.length,
  });
};
