const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const res = require('express/lib/response');
const query = require('express/lib/middleware/query');
const port = process.env.PORT || 5000;
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
        const userCollectino = client.db("manufacturePart").collection("users");
        const reviewCollectino = client.db("manufacturePart").collection("reviews");

        // api for loading all products
        app.get('/products', async (req, res) => {
            const query = {};
            const cursor = productCollection.find(query);
            const product = await cursor.toArray();
            res.send(product);
        });

        // for loading reviews
        app.get('/review', async (req, res) => {
            const query = {};
            const cursor = reviewCollectino.find(query);
            const review = await cursor.toArray();
            res.send(review);
        });

        // loading single product 
        app.get('/singleProduct', async (req, res) => {
            const query = {};
            const cursor = productCollection.find(query).project({ name: 1 });
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

        // for loading users 
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollectino.find().toArray();
            console.log(users);
            res.send(users);
        });

        // showing user profile
        app.get('/showUpdateProfile/:email', async (req, res) => {
            const userEmail = req.params.email;
            const query = { email: userEmail };
            const user = await userCollectino.find(query).toArray();
            res.send({success: true, user});
        });

        // searching admin 
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollectino.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        });

        // getting all the booking 
        app.get('/booking', async (req, res) => {
            const query = {};
            const cursor = bookingCollectino.find(query);
            const product = await cursor.toArray();
            res.send(product);
        });

        // getting booking by ID for payment 
        app.get('/payment/:id',verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const paymentBooking = await bookingCollectino.findOne(query);
            res.send(paymentBooking);
        });

        // for getting all the booking orders
        app.get('/booking/:email', verifyJWT, async (req, res) => {
            const clientEmail = req.query.clientEmail;
            const decodedEmail = req.decoded.email;
            if (clientEmail === decodedEmail) {
                const query = { clientEmail: clientEmail };
                const booking = await bookingCollectino.find(query).toArray();
                return res.send(booking);
            }
            else {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
        });

        // payment intent 
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const product = req.body;
            const price = product.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({clientSecret: paymentIntent.client_secret})
        });

        // adding review 
        app.post('/review', async (req, res) => {
            const review = req.body;
            const result = await reviewCollectino.insertOne(review);
            res.send({ success: true, result });
        });

        // adding new product by admin 
        app.post('/products', async (req, res) => {
            const newProduct = req.body;
            const result = await productCollection.insertOne(newProduct);
            res.send(result);
        });

        // adding orders
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { productID: booking.productID, quantity: booking.quantity, clientEmail: booking.clientEmail };
            const exist = await bookingCollectino.findOne(query);
            if (exist) {
                return res.send({ success: false, booking: exist });
            }
            const result = await bookingCollectino.insertOne(booking);
            return res.send({ success: true, result });
        });

        // adding user to database
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollectino.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: 60 * 60 })
            res.send({ result, token });
        });

        // making admin 
        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollectino.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollectino.updateOne(filter, updateDoc);
                res.send(result);
            }
            else {
                res.status(403).send({ message: 'Forbidden Request. You are not an Admin...' })
            }
        });

        // updating profile 
        app.put('/updateProfile/:email', async (req, res) => {
            const email = req.params.email;
            const profile = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: profile,
            };
            const result = await userCollectino.updateOne(filter, updateDoc, options);
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