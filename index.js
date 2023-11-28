const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000

// middleware
// const corsOptions = {
//   origin: [
//     'http://localhost:5173',
//     'http://localhost:5174',
//     'https://soul-mate-connect.web.app/',
//     'https://soul-mate-connect.firebaseapp.com/'
//   ],
//   // credentials: true,
//   optionSuccessStatus: 200,
// }
// app.use(cors(corsOptions))

app.use(cors())
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
const favouritesCollection = client.db('SoulMateConnectDB').collection('favourites')
const paymentCollection = client.db('SoulMateConnectDB').collection('payments')
const successStoryCollection = client.db('SoulMateConnectDB').collection('successStory')




async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();


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

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      let query = {}
      if (req.query.search) {
        const searchResult = new RegExp(req.query.search, 'i')
        query = { name: searchResult }
      }
      const result = await userCollection.find(query).toArray()
      res.send(result)
    })



    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email }
      const user = await userCollection.findOne(query)
      res.send(user)
    })

    app.patch('/users/:id', async (req, res) => {
      const id = req.params.id;
      const userRole = req.body.userRole;

      const query = { _id: new ObjectId(id) }
      const updateUserRole = {
        $set: {
          role: userRole,

        }
      }
      const updatedUserRole = await userCollection.updateOne(query, updateUserRole)
      res.send({ updatedUserRole, })
    })


    // biodatas api 

    app.get('/biodatas', async (req, res) => {

      console.log(req.query);
      const { minAge, maxAge, biodataType, division } = req.query

      const page = parseInt(req.query.page)
      const size = parseInt(req.query.size)

      const filter = {}

      if (minAge && maxAge) {
        filter.age = {
          $gte: parseInt(minAge),
          $lte: parseInt(maxAge)
        }
      }

      if (biodataType) {
        filter.biodataType = biodataType
      }

      if (division) {
        filter.permanentDivision = division
      }


      const result = await biodatasCollection.find(filter).skip(page * size).limit(size).toArray()
      res.send(result)

    })

    app.get('/biodata-count', async (req, res) => {
      const count = await biodatasCollection.estimatedDocumentCount()

      res.send({ count })
    })





    app.get('/premium-biodatas', async (req, res) => {
      const premiumMembersBiodata = await userCollection.aggregate([
        {
          $match: { role: 'premium' },
        },
        {
          $lookup: {
            from: 'biodatas',
            localField: 'email',
            foreignField: 'email',
            as: 'biodata'
          },
        },
        {
          $unwind: '$biodata'
        },
        {
          $sort: { 'biodata.age': 1 }
        },
        {
          $limit: 6,
        },
        {
          $project: {
            _id: '$biodata._id',
            name: '$biodata.name',
            biodataId: '$biodata.biodataId',
            biodataType: '$biodata.biodataType',
            profileImage: '$biodata.profileImage',
            permanentDivision: '$biodata.permanentDivision',
            age: '$biodata.age',
            occupation: '$biodata.occupation',
          }
        }
      ]).toArray()

      console.log(premiumMembersBiodata);
      res.send(premiumMembersBiodata)
    })

    app.get('/biodatas/:email', async (req, res) => {
      const email = req.params.email
      const result = await biodatasCollection.findOne({ email })
      res.send(result)

    })
    app.get('/biodata-details/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await biodatasCollection.findOne(query)
      res.send(result)

    })

    app.put('/biodatas', async (req, res) => {
      const biodataInfo = req.body;
      const email = biodataInfo.email


      // const updateDoc = {
      //   $set: {
      //     ...biodataInfo,

      //   }
      // }

      const isExist = await biodatasCollection.findOne({ email })
      if (isExist) {
        const result = await biodatasCollection.updateOne({ email }, { $set: req.body })
        res.send(result)
        console.log('line 144 console', result);

      } else {
        const biodataCount = await biodatasCollection.estimatedDocumentCount()
        const newBiodata = {
          ...biodataInfo,
          biodataId: biodataCount + 1

        }
        const result = await biodatasCollection.insertOne(newBiodata)
        res.send(result)
        console.log('line 153 console', result);
      }
    })

    app.patch('/biodatas/status/:id', async (req, res) => {
      const id = req.params.id;
      const biodataStatus = req.body.biodataStatus;

      const query = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          biodataStatus
        }
      }
      const result = await biodatasCollection.updateOne(query, updateDoc)
      // console.log(result);
      res.send(result)
    })

    app.patch('/biodata/make-premium/:id', async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          biodataStatus: 'premium'
        }
      }
      const result = await biodatasCollection.updateOne(query, updateDoc)
      // console.log(result);
      res.send(result)
    })




    // favourites api 
    app.post('/favourites', async (req, res) => {
      const favouriteBiodata = req.body;
      const result = await favouritesCollection.insertOne(favouriteBiodata)
      res.send(result)
    })

    app.get('/favourites/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email }
      const result = await favouritesCollection.find(query).toArray()
      res.send(result)

    })

    app.delete('/favourites/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await favouritesCollection.deleteOne(query)
      console.log(result);
      res.send(result)
    })

    // contact request api 
    app.get('/contact-request', async (req, res) => {
      const pendingContactRequest = { status: 'pending' }
      const result = await paymentCollection.find(pendingContactRequest).toArray()
      console.log(result);
      res.send(result)
    })

    app.patch('/contact-request/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          status: 'approved'
        }
      }
      const result = await paymentCollection.updateOne(query, updateDoc)
      res.send(result)
    })

    app.delete('/contact-request/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await paymentCollection.deleteOne(query)
      res.send(result)
    })



    // payment api 
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(process.env.STRIPE_SECRET_KEY, 'stripe key')
      console.log(amount, 'amount inside the intent')

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'BDT',
        "payment_method_types": [
          "card"
        ],
      });
      console.log(paymentIntent);

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    });

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment)


      res.send({ paymentResult })
    })

    app.get('/payments/:email', verifyToken, async (req, res) => {

      const email = req.params.email;
      const query = { email }

      const result = await paymentCollection.find(query).toArray()
      res.send(result)
    })


    // success story api 

    app.post('/success-story', async (req, res) => {
      const successStory = req.body

      const result = await successStoryCollection.insertOne(successStory)
      res.send(result)
    })

    app.get('/success-story', async (req, res) => {
      const sortedByTimestamp = { marriageTimestamp: -1 }

      const result = await successStoryCollection.find().sort(sortedByTimestamp).toArray()
      res.send(result)
    })


    app.get('/admin-success-story', async (req, res) => {
      const result = await successStoryCollection.aggregate([
        {
          $lookup: {
            from: 'biodatas',
            localField: 'selfBiodataNumber',
            foreignField: 'biodataId',
            as: 'selfBiodata',
          },
        },
        {
          $unwind: '$selfBiodata',
        },
        {
          $lookup: {
            from: 'biodatas',
            localField: 'partnerBiodataNumber',
            foreignField: 'biodataId',
            as: 'partnerBiodata',
          },
        },
        {
          $unwind: '$partnerBiodata',
        },
        {
          $project: {

            maleBiodataId: '$selfBiodata.biodataId',
            femaleBiodataId: '$partnerBiodata.biodataId',
            maleBiodataType: '$selfBiodata.biodataType',
            femaleBiodataType: '$partnerBiodata.biodataType',
            successStoryText: 1
          },
        },
      ]).toArray();



      res.send(result)
    })


    // admin stats api
    app.get('/admin-stats', async (req, res) => {
      const totalBiodataCount = await biodatasCollection?.estimatedDocumentCount()

      const maleQuery = { biodataType: 'male' }
      const totalMaleBiodataCount = (await biodatasCollection.find(maleQuery).toArray()).length

      const femaleQuery = { biodataType: 'female' }
      const totalFemaleBiodataCount = (await biodatasCollection.find(femaleQuery).toArray()).length


      const premiumQuery = { biodataStatus: 'premium' }
      const totalPremiumBiodataCount = (await biodatasCollection.find(premiumQuery).toArray()).length



      const totalRevenueCount = await paymentCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray()
      const revenue = totalRevenueCount.length > 0 ? totalRevenueCount[0].totalRevenue : 0

      console.log(totalBiodataCount, totalMaleBiodataCount, totalFemaleBiodataCount);
      res.send({ totalBiodataCount, totalMaleBiodataCount, totalPremiumBiodataCount, totalFemaleBiodataCount, revenue })
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