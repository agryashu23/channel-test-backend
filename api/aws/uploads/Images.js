const { v4: uuidv4 } = require("uuid");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const os = require("os");
const thumbsupply = require("thumbsupply");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs").promises;
const path = require("path");
const multer = require("multer");
const ogs = require("open-graph-scraper");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");
const { PassThrough } = require("stream");

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});


async function compressImageToMaxSize(fileBuffer, maxSize = 300 * 1024, format = "jpeg") {
  const sharpInstance = sharp(fileBuffer);
  const metadata = await sharpInstance.metadata();

  let quality = 80;
  let width = metadata.width;
  let outputBuffer = await sharp(fileBuffer)[format]({ quality }).toBuffer();

  while (outputBuffer.length > maxSize && quality > 20) {
    width = Math.round(width * 0.9);
    quality -= 10;
    outputBuffer = await sharp(fileBuffer)
      .resize({ width })
      [format]({ quality })
      .toBuffer();
  }

  return outputBuffer;
}


async function uploadSingleImage(file, name) {
  const myUUID = uuidv4();
  const resizedImageBuffer = await compressImageToMaxSize(file.buffer);

  const putObjectParams = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `${name}/image_${myUUID}.jpg`,
    Body: resizedImageBuffer,
    ContentType: "image/jpeg",
  };

  await s3Client.send(new PutObjectCommand(putObjectParams));
  console.log(
    `https://${process.env.CLOUDFRONT_PATH}/${name}/image_${myUUID}.jpg`
  );

  return `https://${process.env.CLOUDFRONT_PATH}/${name}/image_${myUUID}.jpg`;
}

async function deleteImageFromS3(imageUrl) {
  try {
    const bucketName = process.env.AWS_S3_BUCKET;
    const s3Region = process.env.AWS_REGION;

    const urlParts = imageUrl.split(`https://${process.env.CLOUDFRONT_PATH}/`);
    const imageKey = urlParts[1];
    if (!imageKey) {
      return;
    }
    const deleteParams = {
      Bucket: bucketName,
      Key: imageKey,
    };
    await s3Client.send(new DeleteObjectCommand(deleteParams));
    console.log(`Image deleted successfully: ${imageUrl}`);
  } catch (err) {
    console.error("Error deleting image from S3:", err);
    throw new Error("Failed to delete image from S3");
  }
}

async function uploadSingleImageLogo(file, name) {
  const myUUID = uuidv4();
  const resizedImageBuffer = await compressImageToMaxSize(file.buffer);
  const putObjectParams = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `${name}/image_${myUUID}.jpg`,
    Body: resizedImageBuffer,
    ContentType: "image/jpeg",
  };
  await s3Client.send(new PutObjectCommand(putObjectParams));
  return `https://${process.env.CLOUDFRONT_PATH}/${name}/image_${myUUID}.jpg`;
}

async function uploadSingleImageNewsletter(file) {
  const myUUID = uuidv4();
  const resizedImageBuffer = await compressImageToMaxSize(file.buffer);
  const putObjectParams = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `newsletter/image_${myUUID}.jpg`,
    Body: resizedImageBuffer,
    ContentType: "image/jpeg",
  };
  await s3Client.send(new PutObjectCommand(putObjectParams));
  return `https://${process.env.CLOUDFRONT_PATH}/newsletter/image_${myUUID}.jpg`;
}

async function uploadMultipleImages(files, name) {
  try {
    const myUUID = uuidv4();
    let uploadPromises = files.map(async (file, index) => {
      const resizedImageBuffer = await compressImageToMaxSize(file.buffer);
      const putObjectParams = {
        Bucket: "chips-social",
        Key: `${name}/image_${myUUID}_${index}.jpg`,
        Body: resizedImageBuffer,
        ContentType: "image/jpeg",
      };
      return s3Client.send(new PutObjectCommand(putObjectParams));
    });

    await Promise.all(uploadPromises);
    return files.map(
      (file, index) =>
        `https://${process.env.CLOUDFRONT_PATH}/${name}/image_${myUUID}_${index}.jpg`
    );
  } catch (error) {
    console.error("Error uploading images:", error);
    throw new Error("Error uploading images");
  }
}

async function uploadMultipleImagesChips(files, name) {
  try {
    const myUUID = uuidv4();

    let uploadPromises = files.map(async (file, index) => {
      const resizedImageBuffer = await compressImageToMaxSize(file.buffer);

      const putObjectParams = {
        Bucket: "chips-social",
        Key: `${name}/image_${myUUID}_${index}.jpg`,
        Body: resizedImageBuffer,
        ContentType: "image/jpeg",
      };
      return s3Client.send(new PutObjectCommand(putObjectParams));
    });

    await Promise.all(uploadPromises);
    return files.map(
      (file, index) =>
        `https://${process.env.CLOUDFRONT_PATH}/${name}/image_${myUUID}_${index}.jpg`
    );
  } catch (error) {
    console.error("Error uploading images:", error);
    res.status(500).send("Error uploading images");
  }
}

async function generateThumbnail(videoBuffer) {
  // const customTempDir = process.env.TEMP_DIR_PATH || '/home/ubuntu/temp';
  const customTempDir = path.join(os.tmpdir());
  const tempVideoPath = path.join(customTempDir, `temp_${uuidv4()}.mp4`);
  const thumbnailPath = path.join(customTempDir, `thumb_${uuidv4()}.jpg`);

  try {
    await fs.writeFile(tempVideoPath, videoBuffer);
    await new Promise((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .on("end", () => {
          console.log("Thumbnail created successfully");
          resolve();
        })
        .on("error", (err) => {
          console.error("Error generating thumbnail:", err);
          reject(err);
        })
        .screenshots({
          timestamps: ["00:00:02"],
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
          size: "320x240",
        });
    });
    const thumbnailBuffer = await fs.readFile(thumbnailPath);
    await fs.unlink(tempVideoPath);
    await fs.unlink(thumbnailPath);
    return thumbnailBuffer;
  } catch (error) {
    console.error("Error generating thumbnail:", error);
    await Promise.all([
      fs.promises
        .unlink(tempVideoPath)
        .catch((e) => console.error("Failed to delete temp video file:", e)),
      fs.promises
        .unlink(thumbnailPath)
        .catch((e) => console.error("Failed to delete thumbnail file:", e)),
    ]);
    throw error;
  }
}

async function compressVideo(buffer) {
  const customTempDir = path.join(os.tmpdir());
  const tempVideoPath = path.join(customTempDir, `temp_${uuidv4()}.mp4`);
  const compressedVideoPath = path.join(
    customTempDir,
    `compressed_${uuidv4()}.mp4`
  );

  try {
    await fs.writeFile(tempVideoPath, buffer);
    await new Promise((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .outputOptions([
          "-vcodec libx264",
          "-b:v 1000k",
          "-preset ultrafast",
          "-crf 28",
          "-threads 4",
          "-movflags +faststart",
        ])
        .on("end", () => {
          console.log("Video compression finished");
          resolve();
        })
        .on("error", (err) => {
          console.error(`Error during video compression: ${err.message}`);
          reject(err);
        })
        .save(compressedVideoPath);
    });

    const compressedBuffer = await fs.readFile(compressedVideoPath);
    await fs.unlink(tempVideoPath);
    await fs.unlink(compressedVideoPath);

    return compressedBuffer;
  } catch (error) {
    console.error("Error during video compression:", error);
    throw error;
  }
}

async function uploadMultipleVideos(files, name) {
  try {
    const results = await Promise.all(
      files.map(async (file, index) => {
        const myUUID = uuidv4();
        const ext = path.extname(file.originalname);

        const videoKey = `videos/video_${myUUID}_${index}${ext}`;
        const thumbKey = `thumbnails/thumb_${myUUID}_${index}.jpg`;

        const [compressedVideoBuffer, thumbnailBuffer] = await Promise.all([
          compressVideo(file.buffer),
          generateThumbnail(file.buffer), 
        ]);

        await s3Client.send(
          new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: videoKey,
            Body: compressedVideoBuffer,
            ContentType: file.mimetype,
          })
        );

        await s3Client.send(
          new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: thumbKey,
            Body: thumbnailBuffer,
            ContentType: "image/jpeg",
          })
        );

        return {
          videoUrl: `https://${process.env.CLOUDFRONT_PATH}/${videoKey}`,
          thumbnailUrl: `https://${process.env.CLOUDFRONT_PATH}/${thumbKey}`,
        };
      })
    );
    return {
      urls: results.map((result) => result.videoUrl),
      thumbnails: results.map((result) => result.thumbnailUrl),
    };
  } catch (error) {
    console.error("Error uploading videos:", error);
    throw new Error("Error uploading videos");
  }
}

async function uploadFileToS3(file) {
  const fileExtension = file.originalname.split(".").pop();
  const fileName = `doc_${uuidv4()}.${fileExtension}`;
  const mimeType = file.mimetype;
  let fileBuffer = file.buffer;

  if (mimeType === "application/pdf") {
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const compressedPdfBytes = await pdfDoc.save({ useObjectStreams: false });
    fileBuffer = Buffer.from(compressedPdfBytes);
  }

  const s3Params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `documents/${fileName}`,
    Body: fileBuffer,
    ContentType: mimeType,
  };

  try {
    const data = await s3Client.send(new PutObjectCommand(s3Params));
    return `https://${process.env.CLOUDFRONT_PATH}/documents/${fileName}`;
  } catch (error) {
    console.error("Error uploading document:", error);
    throw new Error("Failed to upload document");
  }
}

async function uploadMultipleFiles(files, name) {
  try {
    const myUUID = uuidv4();
    let uploadPromises = files.map(async (file, index) => {
      const fileExtension = file.originalname.split(".").pop();
      const fileName = `${name}/file_${myUUID}_${index}.${fileExtension}`;
      let fileBuffer = file.buffer;
      if (file.mimetype === "application/pdf") {
        try {
          const pdfDoc = await PDFDocument.load(fileBuffer, {
            ignoreEncryption: true,
          });
          const compressedPdfBytes = await pdfDoc.save({
            useObjectStreams: false,
          });
          fileBuffer = Buffer.from(compressedPdfBytes);
        } catch (error) {
          console.error(`Failed to process PDF "${file.originalname}":`, error);
          throw new Error(`Failed to process PDF "${file.originalname}"`);
        }
      }
      const putObjectParams = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileName,
        Body: fileBuffer,
        ContentType: file.mimetype,
      };
      return s3Client.send(new PutObjectCommand(putObjectParams));
    });

    await Promise.all(uploadPromises);
    return files.map(
      (file, index) =>
        `https://${
          process.env.CLOUDFRONT_PATH
        }/${name}/file_${myUUID}_${index}.${file.originalname.split(".").pop()}`
    );
  } catch (error) {
    console.error("Error uploading files:", error);
    throw new Error("Error uploading files");
  }
}

async function apiMetadata(url) {
  if (url === null || url === "") {
    return null;
  }
  try {
    const options = { url: decodeURIComponent(url) };
    const results = await ogs(options);
    return results.result;
  } catch (error) {
    console.error("Error fetching metadata:", error);
    return null;
  }
}

async function apiMetadata2(url) {
  if (!url) {
    return null;
  }
  try {
    const decodedUrl = decodeURIComponent(url);
    const options = { url: decodedUrl, timeout: 20000 };
    const results = await ogs(options);
    if (results.error) {
      console.error(`Error fetching metadata for URL ${url}:`, results.error);
      return null;
    }
    return results.result;
  } catch (error) {
    console.error(`Error fetching metadata for URL ${url}:`, error.message);
    return null;
  }
}

//  async function createCollage(imagePaths) {
//    const collageWidth = 400;
//    const collageHeight = 400;
//    const canvas = sharp({
//      create: {
//        width: collageWidth,
//        height: collageHeight,
//        channels: 4,
//        background: { r: 255, g: 255, b: 255, alpha: 1 }
//      }
//    });
//    const imageBuffers = await Promise.all(
//      imagePaths.map(path =>
//        sharp(path)
//          .resize(200, 200)
//          .toBuffer()
//      )
//    );
//    let compositeOptions = [];
//    for (let i = 0; i < imageBuffers.length; i++) {
//      const x = (i % 2) * 200;
//      const y = i < 2 ? 0 : 200;
//      compositeOptions.push({
//        input: imageBuffers[i],
//        top: y,
//        left: x
//      });
//    }
//    return canvas.composite(compositeOptions).png().toBuffer();
//  }
//  app.get('/collage', async (req, res) => {
//    const imagePaths = [
//      'path/to/image1.jpg',
//      'path/to/image2.jpg',
//      'path/to/image3.jpg',
//      'path/to/image4.jpg'
//    ];
//    try {
//      const collageBuffer = await createCollage(imagePaths);
//      res.setHeader('Content-Type', 'image/png');
//      res.send(collageBuffer);
//    } catch (error) {
//      console.error('Failed to create collage:', error);
//      res.status(500).send('Failed to create collage');
//    }
//  });

module.exports = {
  uploadSingleImage,
  uploadSingleImageLogo,
  uploadFileToS3,
  uploadMultipleFiles,
  deleteImageFromS3,
  uploadMultipleImages,
  uploadMultipleImagesChips,
  uploadMultipleVideos,
  apiMetadata,
  apiMetadata2,
};
