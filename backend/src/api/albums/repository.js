// src/modules/album/repositories/album.repository.js
import { Album } from "../domain/album.model.js";

export const AlbumRepository = {
  create: async (data) => await Album.create(data),

  findById: async (id) => await Album.findById(id),

  findBySlugOrId: async (identifier) => {
    const isObjectId = /^[a-f\d]{24}$/i.test(identifier);
    return await Album.findOne(isObjectId ? { _id: identifier } : { slug: identifier });
  },

  findAll: async (skip = 0, limit = 10) => {
    const albums = await Album.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("songs", "title duration coverImage")
      .populate("artist", "name slug")
      .lean();

    const total = await Album.countDocuments();

    return { albums, total };
  },

  findAllByArtist: async (artistId, skip = 0, limit = 10) => {
    const [albums, total] = await Promise.all([
      Album.find({ artist: artistId })
        .sort({ releaseDate: -1 })
        .skip(skip)
        .limit(limit)
        .select("title slug coverImage releaseDate accessType price")
        .lean(),
      Album.countDocuments({ artist: artistId }),
    ]);
    return { albums, total };
  },

  deleteById: async (id) => await Album.findByIdAndDelete(id),

  update: async (album) => await album.save(),

  findAllWithoutPagination: async () => {
    return await Album.find()
      .sort({ createdAt: -1 })
      .populate("songs", "title duration coverImage")
      .populate("artist", "name slug")
      .lean();
  },
};
