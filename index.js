require('dotenv').config();
var express = require('express');

var app = express();
const rasaroute = require("./rasaRoute.js");
rasaroute.start(
  {
    KVBASE_COLLECTION : process.env.KVBASE_COLLECTION,
    MONGODB_URI: process.env.MONGODB_URI
  }, () => {
    app.use("/rasa", rasaroute);
  });

app.get('/', (req, res) => {
  res.write("Hello from RASA connector 0.1.0");
  res.end();
});