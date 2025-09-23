import { StatusCodes } from "http-status-codes";
import { UnauthorizedError } from "../errors/index.js";
import { isAdmin } from "../utils/authHelper.js";
import { createSong as createSongService } from "../services/songService.js";
import { uploadAudioFile, getCoverImage } from "../services/fileService.js";
import { shapeSongResponse } from "../dto/song.dto.js";
import { convertCurrencies } from "../utils/convertCurrencies.js";


export const createSong = async (req, res) => {
  if (!isAdmin(req.user)) throw new UnauthorizedError("Admins only");

  const {
    title,
    artist,
    genre,
    duration,
    basePrice,
    accessType,
    releaseDate,
    albumOnly,
    album
  } = req.body;


  if (!title || !artist || !duration) {
    throw new Error("Title, artist, and duration are required");
  }

  // Normalize genre & albumOnly
  const genreArray = typeof genre === "string" ? genre.split(",").map(g => g.trim()) : genre;
  const albumOnlyBool = typeof albumOnly === "string" ? albumOnly === "true" : !!albumOnly;

  // File handling
  const audioUrl = await uploadAudioFile(req.files?.audio?.[0]);
  const coverImageUrl = await getCoverImage(req.files?.coverImage?.[0], album);
  

  const convertedPrices = basePrice ? await convertCurrencies(basePrice.currency, basePrice.amount) : [];

  // Create song
  const newSong = await createSongService({
    data: {
      title,
      artist,
      genre: genreArray,
      duration,
      basePrice : basePrice ? { amount: parseFloat(basePrice.amount), currency: basePrice.currency } : null,
      accessType,
      releaseDate,
      albumOnly: albumOnlyBool,
      album,
      convertedPrices
    },
    audioUrl,
    coverImageUrl
  });

  // Response shaping
  const response = shapeSongResponse(newSong, false);

  res.status(StatusCodes.CREATED).json({ success: true, song: response });
};

export const updateSong = async (req, res) => {
  if (!isAdmin(req.user)) throw new UnauthorizedError("Admins only");

  const { title, artist, genre, duration, price, accessType, releaseDate, album } = req.body;
  const genreArray = typeof genre === "string" ? genre.split(",").map(g => g.trim()) : genre;

  // File uploads
  const coverImageUrl = await uploadCoverImage(req.files?.coverImage?.[0]);
  const audioUrl = await uploadAudioFile(req.files?.audio?.[0]);

  // Update song via service
  const updatedSong = await updateSongService({
    songId: req.params.id,
    data: {
      title,
      artist,
      genre: genreArray,
      duration,
      price: parseFloat(price),
      accessType,
      releaseDate,
      album,
    },
    coverImageUrl,
    audioUrl
  });

  // Shape response
  const shaped = shapeSongResponse(updatedSong, false);

  res.status(StatusCodes.OK).json({ success: true, song: shaped });
};