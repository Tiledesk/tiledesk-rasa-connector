require('dotenv').config();
var express = require('express');

var app = express();
//const rasa = require("./rasaRoute.js");
const rasa = require("@tiledesk/tiledesk-rasa-connector");

const rasaRouter = rasa.router;
app.use("/rasa", rasaRouter);

rasa.startRasa(
  {
    KVBASE_COLLECTION : process.env.KVBASE_COLLECTION,
    MONGODB_URI: process.env.MONGODB_URI,
    chatbotInfo: {
      serverUrl: 'http://52.16.50.206/webhooks/rest/webhook'
    },
    log: false
  }, () => {
    console.log("RASA route successfully started.");
    var port = process.env.PORT || 3000;
    app.listen(port, function () {
      console.log('RASA connector listening on port ', port);
    });
  });

app.get('/', (req, res) => {
  res.write("Hello from RASA connector");
  res.end();
});