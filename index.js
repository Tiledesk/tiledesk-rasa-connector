require('dotenv').config();
var express = require('express');

var app = express();
const rasa = require("@tiledesk/tiledesk-rasa-connector");
//const rasa = require("./rasaRoute");
const rasaRoute = rasa.router;
app.use("/rasa", rasaRoute);

rasa.startRasa(
  {
    KVBASE_COLLECTION : process.env.KVBASE_COLLECTION,
    MONGODB_URI: process.env.MONGODB_URI,
    API_ENDPOINT: process.env.API_ENDPOINT,
    //chatbotInfo: { // solo per test, ignorare in prod
    //  serverUrl: 'http://34.254.90.35/webhooks/rest/webhook'
    //},
    log: true
  }, () => {
    console.log("RASA route successfully started.");
    var port = process.env.PORT || 3000;
    app.listen(port, function () {
      console.log('RASA connector listening on port ', port);
    });
  }
);

//go();

function go() {
  throw "ERRROROROROR"
}

app.get('/', (req, res) => {
  res.write("Hello from RASA connector");
  res.end();
});