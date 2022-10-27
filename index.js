const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
var jwt = require("jsonwebtoken");

require("dotenv").config();
// const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("Saikat");
});

app.use(cors());
app.use(express.json());

// mongo db connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qj4thqm.mongodb.net/?retryWrites=true&w=majority`;

const verifyJwt = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  // verify a token symmetric
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    // bar
    next();
  });
};

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    await client.connect();

    const servicesCollection = client
      .db("doctors-portals")
      .collection("services");
    const bookingCollection = client
      .db("doctors-portals")
      .collection("booking");
    const UserCollection = client
      .db("doctors-portals")
      .collection("User");
    const doctorsCollection = client
      .db("doctors-portals")
      .collection("doctors");

    const verifyAdmin = async (req, res, next) => {
      const requster = req.decoded.email;

      const requsterAccount = await UserCollection.findOne({ email: requster });
      if (requsterAccount.role === "admin") {
        next()
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    }

    //all user api
    app.get("/user", verifyJwt, async (req, res) => {
      const users = await UserCollection.find().toArray();
      res.send(users);
    });

    app.get("/admin/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;
      const user = await UserCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    //admin user
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await UserCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ result, token });
    });

    //user email address verifay

    app.put("/user/admin/:email", verifyJwt, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await UserCollection.updateOne(filter, updateDoc);

      res.send(result);

    });
    // service api

    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query).project({ name: 1 });
      const service = await cursor.toArray();
      res.send(service);
    });

    app.get("/available", async (req, res) => {
      const date = req.query.date;

      const query = { date: date };
      //step 1: get all booking all day . out put: [{},{},{},{}]
      const booking = await bookingCollection.find(query).toArray();
      //step 2: get all service

      const services = await servicesCollection.find().toArray();
      //step 3: for each service, find booking for the service
      services.forEach((service) => {
        //step 4: find booking for that service , out put: [{},{},{},{}]
        const serviceBooking = booking.filter(
          (b) => b.treatment === service.name
        );
        //step 5: selet slot for the service booking:["","","","",""]
        const bookedSlot = serviceBooking.map((s) => s.slot);
        // step 6: selet thos thst are not in booked slot
        const available = service.slots.filter(
          (slot) => !bookedSlot.includes(slot)
        );
        service.slots = available;
      });
      res.send(services);
    });

    //doctors api
    app.post('/doctors', verifyJwt, verifyAdmin, async (req, res) => {
      const doctors = req.body
      const result = await doctorsCollection.insertOne(doctors)
      res.send(result)
    })

    app.get("/mybooking", verifyJwt, async (req, res) => {
      const patient = req.query.patientEmail;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patientEmail: patient };
        console.log(decodedEmail);
        console.log(patient);
        //step 1: get all booking all day . out put: [{},{},{},{}]
        const booking = await bookingCollection.find(query).toArray();
        return res.send(booking);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });

    //booking post api
    // app.post ('/booking)
    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patientName: booking.patientName,
      };
      const exist = await bookingCollection.findOne(query);
      if (exist) {
        return res.send({ seccess: false, booking: exist });
      }
      const result = await bookingCollection.insertOne(booking);
      res.send({ seccess: true, result });
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log("listen port", port);
});
//name: doctors-portals
//password: q9PaUk5Rw2YVwk8o
