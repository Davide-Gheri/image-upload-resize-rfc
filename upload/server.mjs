import express from 'express';
import cors from 'cors';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

const awsOptions = {
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
}

const s3Client = new S3Client(awsOptions);

const app = express();

app.use(cors());

app.get('/upload-url/:key', async (req, res) => {
    const key = req.params.key;
    const bucket = process.env.AWS_BUCKET;
    const conditions = [
        { acl: 'public-read' },
        { bucket },
        ['content-length-range', 0, 10485760],
        ['starts-with', '$key', '']
    ];

    const { url, fields } = await createPresignedPost(s3Client, {
        Bucket: bucket,
        Key: key,
        Conditions: conditions,
        Fields: {
            acl: 'public-read',
        },
        Expires: 3600,
    });

    res.json({
        uploadUrl: url,
        fields,
    })
});

const port = 5000;

app.listen(port, () => console.log(`Server listening on :${port}`));
