// src/modules/album/controllers/album.controller.js
import { StatusCodes } from "http-status-codes";
import { isAdmin } from "../../../utils/authHelper.js";
import { AlbumService } from "../services/album.service.js";

export const AlbumController = {
  createAlbum: async (req, res) => {
    if (!isAdmin(req.user)) throw new UnauthorizedError("Admins only");
    const result = await AlbumService.create(req.body, req.files?.coverImage?.[0]);
    res.status(StatusCodes.CREATED).json({ success: true, album: result });
  },

  getAllAlbums: async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const result = await AlbumService.getAll(Number(page), Number(limit));
    res.status(StatusCodes.OK).json({ success: true, ...result });
  },

  getAlbumById: async (req, res) => {
    const result = await AlbumService.getById(req.params.id, req.user);
    res.status(StatusCodes.OK).json({ success: true, album: result });
  },

  deleteAlbum: async (req, res) => {
    if (!isAdmin(req.user)) throw new UnauthorizedError("Admins only");
    await AlbumService.deleteById(req.params.id);
    res.status(StatusCodes.OK).json({ success: true, message: "Album deleted" });
  },

  updateAlbum: async (req, res) => {
    if (!isAdmin(req.user)) throw new UnauthorizedError("Admins only");
    const result = await AlbumService.update(req.params.id, req.body, req.files?.coverImage?.[0]);
    res.status(StatusCodes.OK).json({ success: true, album: result });
  },

  getAlbumByArtist: async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const result = await AlbumService.getByArtist(req.params.artistId, Number(page), Number(limit));
    res.status(StatusCodes.OK).json({ success: true, ...result });
  },

  getAllAlbumsWithoutPagination: async (req, res) => {
    const result = await AlbumService.getAllWithoutPagination();
    res.status(StatusCodes.OK).json({ success: true, albums: result, total: result.length });
  },
};
