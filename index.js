const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000

// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  // credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))


const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@cluster0.qiowubl.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const userCollection = client.db('SoulMateConnectDB').collection('users')
const biodatasCollection = client.db('SoulMateConnectDB').collection('biodatas')




async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
     // jwt related api 
     
        // jwt related api 
        app.post('/jwt', async (req, res) => {
          const user = req.body;
          const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '365d' })
          res.send({ token })
      })

      // middlewares 
      const verifyToken = (req, res, next) => {
          // console.log('inside verify token', req.headers.authorization);
          if (!req.headers.authorization) {
              return res.status(401).send({ message: 'unauthorized access' })
          }
          const token = req.headers.authorization.split(' ')[1]
          jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
              if (err) {
                  return res.status(401).send({ message: 'unauthorized access' })
              }
              req.decoded = decoded;
              next()
          })
      }

      // verify admin  (have to verify after verify token)
      const verifyAdmin = async (req, res, next) => {
          const email = req.decoded.email;
          const query = { email: email }
          const user = await userCollection.findOne(query)
          const isAdmin = user?.role === 'admin'
          if (!isAdmin) {
              return res.send(403).send({ message: 'forbidden access' })
          }
          next()
      }

      app.post('/users', async (req, res) => {
        const user = req.body;

        // insert email if user doesn't exists 
        const query = { email: user.email }
        const existingUser = await userCollection.findOne(query)
        if (existingUser) {
            return res.send({ message: 'user already exists', insertedId: null })
        }
        const result = await userCollection.insertOne(user)
        res.send(result)
    })
    
    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
          return res.status(403).send({ message: 'forbidden access' })
      }

      const query = { email: email }
      const user = await userCollection.findOne(query)

      let admin = false
      if (user) {
          admin = user?.role === 'admin'
      }

      res.send({ admin })
  })


    app.get('/biodatas', async (req, res) => {
      const result = await biodatasCollection.find().toArray()
      res.send(result)

    })
    app.get('/biodata-details/:id', verifyToken, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await biodatasCollection.findOne(query)
      res.send(result)

    })













    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Hello from SoulMateConnect Server..')
})

app.listen(port, () => {
  console.log(`SoulMateConnect is running on port ${port}`)
})