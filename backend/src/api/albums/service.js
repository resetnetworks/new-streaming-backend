// src/modules/album/services/album.service.js
import { AlbumRepository } from "../repositories/album.repository.js";
import { Song } from "../../song/domain/song.model.js"; // adjust path if needed
import { NotFoundError, BadRequestError } from "../../../errors/index.js";
import { uploadToS3 } from "../../../utils/s3Uploader.js";
import { shapeAlbumResponse, shapeAlbumWithSongs } from "../dto/album.dto.js";
import { hasAccessToSong } from "../../../utils/accessControl.js";
import { Artist } from "../../artist/domain/artist.model.js";

export const AlbumService = {
  create: async (data, coverImageFile) => {
    if (data.accessType === "purchase-only" && (!data.price || data.price <= 0)) {
      throw new BadRequestError("Purchase-only albums must have a valid price.");
    }

    const coverImageUrl = coverImageFile
      ? await uploadToS3(coverImageFile, "covers")
      : "";

    const processedGenre = Array.isArray(data.genre)
      ? data.genre
      : typeof data.genre === "string"
      ? data.genre.split(",").map((g) => g.trim())
      : [];

    const album = await AlbumRepository.create({
      ...data,
      genre: processedGenre,
      coverImage: coverImageUrl,
      price: data.accessType === "purchase-only" ? data.price : 0,
    });

    return shapeAlbumResponse(album);
  },

  getAll: async (page = 1, limit = 10) => {
    const skip = (page - 1) * limit;
    const { albums, total } = await AlbumRepository.findAll(skip, limit);
    return {
      albums: albums.map(shapeAlbumResponse),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  getById: async (id, user) => {
    const album = await AlbumRepository.findBySlugOrId(id);
    if (!album) throw new NotFoundError("Album not found");

    const shapedSongs = await Promise.all(
      (album.songs || []).map(async (song) => {
        const access = await hasAccessToSong(user, song);
        return {
          _id: song._id,
          title: song.title,
          duration: song.duration,
          coverImage: song.coverImage,
          audioUrl: access ? song.audioUrl : null,
        };
      })
    );

    return shapeAlbumResponse({ ...album, songs: shapedSongs });
  },

  deleteById: async (id) => {
    const album = await AlbumRepository.findById(id);
    if (!album) throw new NotFoundError("Album not found");

    await Song.updateMany({ _id: { $in: album.songs } }, { $unset: { album: "" } });
    await album.deleteOne();
  },

  update: async (id, data, coverImageFile) => {
    const album = await AlbumRepository.findById(id);
    if (!album) throw new NotFoundError("Album not found");

    Object.assign(album, data);

    if (coverImageFile) {
      album.coverImage = await uploadToS3(coverImageFile, "covers");
    }

    if (typeof data.genre === "string") {
      album.genre = data.genre.split(",").map((g) => g.trim());
    }

    await album.save();
    return shapeAlbumResponse(album.toObject());
  },

  getByArtist: async (artistId, page = 1, limit = 10) => {
    const artist = /^[a-f\d]{24}$/i.test(artistId)
      ? await Artist.findById(artistId).lean()
      : await Artist.findOne({ slug: artistId }).lean();

    if (!artist) throw new NotFoundError("Artist not found");

    const skip = (page - 1) * limit;
    const { albums, total } = await AlbumRepository.findAllByArtist(artist._id, skip, limit);

    const shapedAlbums = albums.map((album) => ({
      ...shapeAlbumResponse(album),
      artist: {
        name: artist.name,
        slug: artist.slug,
        image: artist.image,
      },
    }));

    return {
      artist,
      albums: shapedAlbums,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  getAllWithoutPagination: async () => {
    const albums = await AlbumRepository.findAllWithoutPagination();
    return albums.map(shapeAlbumWithSongs);
  },
};
