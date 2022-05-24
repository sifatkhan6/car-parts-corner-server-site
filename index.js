const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const res = require('express/lib/response');
const query = require('express/lib/middleware/query');
const port = process.env.PORT || 5000;
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zczar.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            console.log(err);
            return res.status(403).send({ message: 'Forbidden Access' });
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        await client.connect();
        const productCollection = client.db('manufacturePart').collection('products');
        const bookingCollectino = client.db("manufacturePart").collection("booking");

        // api for loading all products
        app.get('/products', async (req, res) => {
            const query = {};
            const cursor = productCollection.find(query);
            const product = await cursor.toArray();
            res.send(product);
        });

        // get products by id 
        app.get('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const product = await productCollection.findOne(query);
            res.send(product);
        });

        // adding orders
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient };
            const exist = await bookingCollectino.findOne(query);
            if (exist) {
                return res.send({ success: false, booking: exist });
            }
            const result = await bookingCollectino.insertOne(booking);
            return res.send({ success: true, result });
        });
    }
    finally {

    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Server running for Manufacture Parts');
})

app.listen(port, () => {
    console.log('Listening to port', port);
})