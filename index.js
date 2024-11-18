const express = require('express'); 
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require ('dotenv').config()
const app = express();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
// const stripe = require('stripe')(sk_test_51OlOTEBjZP9GYAGg3KjzMOV0FuJovVDY7RUNgw2dtlFd5IuXHJaPoRzdkUvgaBMXGdb9FOk0sPi15tSEBulR6RUZ00LGpHScjR);


const port = process.env.PORT || 5000;


//middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dedsmmq.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const usersCollection = client.db('autoTech').collection('users');
    const serviceCollection = client.db('autoTech').collection('services');
    const bookingCollection = client.db('autoTech').collection('bookings');
    const cartCollection = client.db('autoTech').collection('carts');
    const paymentCollection = client.db('autoTech').collection('payments');

    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

      res.send({ token })
    })

    // Warning: use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden message' });
      }
      next();
    }

    // users related apis
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: 'user already exists' })
      }

      //my code
      // const result = await usersCollection.insertOne(user);
      // res.send(result);

      // generated
      const result = await usersCollection.insertOne(user);
      //todo - uncomment
      res.json({ userId: result.insertedId });
      });

    // security layer: verifyJWT
    // email same
    // check admin
    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);
    })

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    })
    //appointments related apis
    app.get('/appointments', async(req, res) => {
      const result = await bookingCollection.find().toArray();
      res.send(result);
    });

    // app.get('/myappointments', async(req, res) =>{
    //   let query = {};
    //   if(req.query?.email){
    //     query = {email: req.query.email}
    //   }
    //   const result = await bookingCollection.find(query).toArray();
    //   res.send(result);
    // });

    app.post('/appointments', verifyJWT, async(req, res) =>{
      const booking = req.body;
      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });

    // app.patch("/appointments", async(req, res) =>{
    //   const updateAppointments = req.body;
    // })

    app.delete('/appointments/:id', verifyJWT, verifyAdmin, async(req, res) =>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
    })

    // menu related apis
    app.get('/services', async(req, res) =>{
      const cursor = serviceCollection.find();
      const result = await cursor.toArray();
      res.send(result);
      // console.log(result)
    })

    app.get('/service/:id', async(req, res) =>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const options = {
        projection: {title: 1, top: 1, description: 1, detailDescription: 1, img: 1},
      };
      const result = await serviceCollection.findOne(query, options);
      res.send(result);
    });

   

    //Technitian------------------------cart collection apis
    app.get('/carts', verifyJWT, async(req, res) =>{
      const email = req.query.email;
      if(!email){
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'forbidden access' })
      }

      const query = {email: email};
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })


    app.post('/carts', async(req, res) =>{
      const item = req.body;
      console.log(item);
      const result= await cartCollection.insertOne(item);
      res.send(result)
    })

    app.delete('/carts/:id', async (req, res) =>{
      const id = req.params.id;
      const query = { _id: new ObjectId(id)};
      const result = await cartCollection.deleteOne(query);
      res.send(result);

    })
    

    // create payment intent
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(price, amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })


    // payment related api
    app.post('/payments', verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } }
      const deleteResult = await cartCollection.deleteMany(query)

      res.send({ insertResult, deleteResult });
    })

    app.get('/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount();
      const products = await serviceCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      // best way to get sum of the price field is to use group and sum operator
      /*
        await paymentCollection.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: '$price' }
            }
          }
        ]).toArray()
      */

      const payments = await paymentCollection.find().toArray();
      const revenue = payments.reduce( ( sum, payment) => sum + payment.price, 0)

      res.send({
        revenue,
        users,
        products,
        orders
      })
    })


    /**
     * ---------------
     * BANGLA SYSTEM(second best solution)
     * ---------------
     * 1. load all payments
     * 2. for each payment, get the menuItems array
     * 3. for each item in the menuItems array get the menuItem from the menu collection
     * 4. put them in an array: allOrderedItems
     * 5. separate allOrderedItems by category using filter
     * 6. now get the quantity by using length: pizzas.length
     * 7. for each category use reduce to get the total amount spent on this category
     * 
    */
    app.get('/order-stats', verifyJWT, verifyAdmin, async(req, res) =>{
      const pipeline = [
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItems',
            foreignField: '_id',
            as: 'menuItemsData'
          }
        },
        {
          $unwind: '$menuItemsData'
        },
        {
          $group: {
            _id: '$menuItemsData.category',
            count: { $sum: 1 },
            total: { $sum: '$menuItemsData.price' }
          }
        },
        {
          $project: {
            category: '$_id',
            count: 1,
            total: { $round: ['$total', 2] },
            _id: 0
          }
        }
      ];

      const result = await paymentCollection.aggregate(pipeline).toArray()
      res.send(result)

    })



    

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => { 
  res.send('AutoTech Server is running!');
})


app.listen(port, () => {
    console.log(`AutoTech Server is running on port ${port}`);
  })
