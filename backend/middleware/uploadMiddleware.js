// uploadMiddleware.js
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client } from "@aws-sdk/client-s3";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Dynamic folder storage for songs & covers (same level)
const dynamicSongStorage = multerS3({
  s3: s3Client,
  bucket: process.env.AWS_S3_BUCKET,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: (req, file, cb) => {
    const ext = path.extname(file.originalname);

    // Choose folder based on the field name
    let folder;
    if (file.fieldname === "audio") {
      folder = "songs"; // audio goes to /songs
    } else if (file.fieldname === "coverImage") {
      folder = "covers"; // cover image goes to /covers
    } else {
      folder = "other";
    }

    const filename = `${folder}/${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

// Song upload: audio in /songs, cover in /covers
export const songUpload = multer({
  storage: dynamicSongStorage,
}).fields([
  { name: "audio", maxCount: 1 },
  { name: "coverImage", maxCount: 1 },
]);

// Single cover image upload (for albums)
export const singleImageUpload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: process.env.AWS_S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const filename = `covers/${uuidv4()}${ext}`;
      cb(null, filename);
    },
  }),
}).fields([{ name: "coverImage", maxCount: 1 }]);
