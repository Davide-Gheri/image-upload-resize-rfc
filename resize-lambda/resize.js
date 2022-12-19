
const sharp = require('sharp');
const aws = require('aws-sdk');
const stream = require('stream');

aws.config.update({
    accessKeyId: process.env.AWS_KEY,
    secretAccessKey: process.env.AWS_SECRET,
});

const s3 = new aws.S3({
    signatureVersion: 'v4',
});

const BUCKET = process.env.BUCKET;
const URL = `http://${BUCKET}.s3-website.${process.env.REGION}.amazonaws.com`;

/**
 * get a ReadStream to an S3 object
 * @param Bucket
 * @param Key
 * @returns {*}
 */
function readStreamFromS3({ Bucket, Key }) {
    return s3.getObject({ Bucket, Key }).createReadStream();
}

/**
 * get a WriteStream to an S3 object and a promise resolved when upload is done
 * @param Bucket
 * @param Key
 * @param ContentType
 * @returns {{writeStream: module:stream.internal.PassThrough, uploadFinished: *}}
 */
function writeStreamToS3({ Bucket, Key, ContentType }) {
    const pass = new stream.PassThrough();

    return {
        writeStream: pass,
        uploadFinished: s3.upload({
            Body: pass,
            Bucket,
            Key,
            ContentType,
        }).promise(),
    }
}

function streamToSharp({ width, height }) {
    return sharp()
        .resize(width, height);
}

/**
 * This handler runs when the URL points to a non-existent object in the bucket
 * The function get the existing file, resize it as requested and store the resized version back to S3, redirecting the client to that
 * The file now exists so this won't run again
 *
 * The Bucket must be configured as Website hosting and the image url must be formatted as:
 * https://bucket-name.s3-website.aws-region.amazonaws.com/WIDTHxHEIGHT/filename.jpeg
 *
 * It works because that path does not exists (yet) in s3. Te function creates the resized image and stores it in that path.
 * Subsequent calls will hit the newly created file
 *
 * @param event
 */
exports.handler = async function(event) {
    // Key is everything after the bucket URL: WIDTHxHEIGHT/filename.jpeg
    const key = event.queryStringParameters.key;
    //Get width and height from the url
    const match = key.match(/(\d+)x(\d+)\/(.*)/);

    if (!match) {
        return {
            statusCode: 400,
            body: 'Invalid resize options'
        }
    }

    // get the dimensions of the new image
    const width = parseInt(match[1], 10);
    const height = parseInt(match[2], 10);

    if (isNaN(width) || isNaN(height)) {
        return {
            statusCode: 400,
            body: 'Invalid resize options'
        }
    }

    const originalKey = match[3];
    // create the new name of the image, note this has a '/' - S3 will create a directory
    const newKey = `${width}x${height}/${originalKey}`;
    const imageLocation = `${URL}/${newKey}`;

    try {
        // Get the original image stream
        const readStream = readStreamFromS3({ Bucket: BUCKET, Key: originalKey });
        // Create a sharp stream to resize the image
        const resizeStream = streamToSharp({ width, height });

        // Create the write stream to store the resized image back to S3
        const {
            writeStream,
            uploadFinished,
        } = writeStreamToS3({ Bucket: BUCKET, Key: newKey });

        // Pipe the streams together and wait for upload to finish
        readStream.pipe(resizeStream).pipe(writeStream);
        const uploaded = await uploadFinished;

        console.log('Data:', {
            uploaded,
            URL,
            imageLocation,
            fullKey: key,
        });

        // Redirect the client to the newly created image
        return {
            statusCode: 301,
            headers: {
                location: imageLocation,
            },
            body: '',
        }
    } catch (e) {
        console.log(e)

        return {
            statusCode: 500,
            body: e.message,
        }
    }
}
