require('dotenv').config();
const { parse } = require('querystring');
var express = require('express');
const router = express.Router();
var cors = require('cors');
const uuid = require('uuid');
const bodyParser = require('body-parser');
const https = require('https');
const formidable = require('formidable');
const fs = require('fs');
const request = require('request');
const { TiledeskChatbotClient } = require('@tiledesk/tiledesk-chatbot-client');
const jwt = require('jsonwebtoken');
const { KVBaseMongo } = require('./KVBaseMongo');
var mongodb = require("mongodb");
let db;

//var app = express();
router.use(cors());
router.use(bodyParser.json({limit: '50mb'}));
router.use(bodyParser.urlencoded({ extended: true , limit: '50mb'}));

// const structjson = require('./structJson.js');

// async function getChatbotData(chatbot_id, callback) {
//   get(chatbot_id, function(err, reply) {
//     if (err) throw err;
//     callback(reply.value)
//   })
// }

function runRASAQuery(RASAurl, rasa_sender_id, text, callback) {

  request(
    {
      url: `${RASAurl}`,
      method: 'POST',
      headers: {
        "Content-Type": "application/json"
      },
      json: {
        "message": text,
        "sender": rasa_sender_id
      }
    },
    function(err, res, resbody) {
      console.log("res.statusCode:", res.statusCode)
      if (err) {
        console.log("An error occurred", err);
      }
      else if (res.statusCode >= 400) {
        console.log("status code error: res.statusCode = ", res.statusCode);
      }
      else {
        console.log("RASA REPLY:", resbody);
        callback(resbody);
      }
    }
  );
}

function sendMessage(msg_json, project_id, recipient, token, callback) {
  console.log("Sending message to Tiledesk: " + JSON.stringify(msg_json));
  request({
    url: `${API_ENDPOINT}/${project_id}/requests/${recipient}/messages`,
    headers: {
      'Content-Type' : 'application/json',
      'Authorization':'JWT ' + token
    },
    json: msg_json,
    method: 'POST'
    },
    function(err, res, resbody) {
      callback(err)
    }
  );
}

router.post("/rasabot", async (req, res) => {
  // delete req.body.payload.request.messages;
  console.log(" ******* NEW REQUEST *******\n\n\n")
  console.log('req.body:', JSON.stringify(req.body));
  // console.log("BOT: req.body: " + JSON.stringify(req.body));
  // const project_id = req.body.payload.id_project;
  // const channel = req.body.payload.channel;
  // const channel_name = channel ? channel.name : null;
  // console.log("Channel name", channel_name);
  // console.log('req.body.hook:', JSON.stringify(req.body.hook));
  // console.log("PROJECT-ID:", project_id)
  const API_LOG = process.env.API_LOG === 'true' ? true : false;
  
  var _API_URL = process.env.API_ENDPOINT
  const cbclient = new TiledeskChatbotClient({request: req, response: res, APIURL: _API_URL, APIKEY: '____APIKEY____', log: API_LOG});

  console.log("cbclient.APIURL", cbclient.APIURL)
  console.log("cbclient.tiledeskClient.APIURL",   cbclient.tiledeskClient.APIURL)
  
  var chatbot_id;
  var chatbot_name;
  chatbot_id = cbclient.chatbot_id; // const chatbot_name = req.body.hook._id;
    chatbot_name = cbclient.chatbot_name; // const chatbot_name = req.body.hook.name;
    // console.log("chatbot_id from body:", chatbot_id)
  // }
  console.log("CHATBOT-ID: ", chatbot_id)

  console.log(" ******* TEXT *******" + cbclient.text)
  // RASA Tiledesk payload: HOW TO USE IT?
  let payload = {}
  payload.tiledesk = req.body;
  // RASA Tiledesk payload: END
  let conversation = cbclient.supportRequest;
  // immediately reply back
  res.status(200).send({"success":true});
  // updates request's first text, so agents can see
  // it updated in real time on the panel
  if (cbclient.message_subtype !== "info") {
    var properties = {
      "first_text": cbclient.text
    }
    cbclient.tiledeskClient.updateRequestProperties(conversation.request_id, properties, function(err) {
      console.log("request updated with text: ", cbclient.text)
    });
  }

  const rasa_user_id = conversation.request_id;
  console.log("looking for chatbot", chatbot_id)
  const chatbotInfo = await db.get(chatbot_id);
  console.log("Chatbot found!", chatbotInfo);
  const RASAurl = chatbotInfo.serverUrl;
  runRASAQuery(RASAurl, rasa_user_id, cbclient.text, function(result) {
    console.log("BOT: RASA REPLY: " + JSON.stringify(result));
    if(res.statusCode === 200) {
      if (result && result.length > 0 && result[0].text) {
        cbclient.tiledeskClient.sendSupportMessage(
          conversation.request_id,
          {
            text: result[0].text
          },
          () => {
            console.log("Message sent.");
          }
        );
      }
      
      /* you can optionally check the intent confidence
      var reply = "Intent under confidence threshold, can you rephrase?"
      if (result.intent.confidence > 0.8) {
        reply = result.reply
      }
      */
      
    }
  });
})

function sendBackToTiledesk(cbclient, payload, result) {
  const is_fallback = result.intent.isFallback;
  const intent_confidence = result.intentDetectionConfidence;
  const intent_name = result.intent.displayName;
  console.log("result.intent.isFallback?", is_fallback);
  console.log(`result.intent.displayName: ${intent_name}`);
  console.log(`Confidence: ${intent_confidence}`);
  // const payload_clone = Object.assign({}, payload);
  // const message_object = delete payload_clone.request;
  const intent_info = {
    intent_name: intent_name,
    is_fallback: is_fallback,
    confidence: intent_confidence,
    message: payload.message // ASPETTO ANDREA CHE FACCIA QUESTA PATCH
  }
  // if (is_fallback || (!is_fallback && intent_confidence < 0.7)) {
    // console.log("Fallback or inaccurate confidence. Fallback?", is_fallback, "Confidence?", intent_confidence);
    // console.log("FIRING NOT FOUND TEXT:", cbclient.text)
    // fireNotFoundEvent(cbclient, is_fallback, intent_confidence);
  // }
}

function fireNotFoundEvent(cbclient, is_fallback, confidence) {
  const event = {
    name: "faqbot.answer_not_found",
    attributes: {
      bot: {
          _id: cbclient.chatbot_id,
          name: cbclient.chatbot_name
      },
      message: {
          text: cbclient.text,
          recipient_id: cbclient.request_id
      },
      info: {
        is_fallback: is_fallback,
        intent_confidence: confidence
      }
    }
  };
  console.log("Firing event:", event);
  cbclient.tiledeskClient.fireEvent(event, function(err, result) {
    if (err) {
      console.log("ERROR FIRING EVENT:", err)
    }
    else {
      console.log("EVENT FIRED:", result);
    }
  });
}

router.post('/botcredendials/:project/bots/:chatbot', (req, res) => {
  const chatbot_id = req.params.chatbot;
  console.log("post bot credentials for", chatbot_id)
  console.log('req.body:', JSON.stringify(req.body));
  const data = req.body;
  console.log("DARA::", data)
  //var form = new formidable.IncomingForm();
  // FORM.PARSE in advance: to avoid H18 error
  // Our 503s (H18 errors) were caused by us not consuming POST data from the socket for some requests.
  // src: https://github.com/copleykj/socialize-cloudinary/issues/1
  //form.parse(req, function (err, fields, files) {
    //console.log("Form parsed.")
    verifyAuthorization(req, function(verified) {
      if (!verified) {
        console.log("Post Unauthorized.")
        res.status(403).send({success: false, msg: 'Unauthorized'});
        return
      }
      else {
        console.log("Post Authorized.")
        updateCredentials(chatbot_id, data, res, () => {
          //res.writeHead(200, {'content-type': 'application/json'});
          res.send({"success": true});
          res.end();
        });
      }
    });
});

async function updateCredentials(chatbot_id, data, res, callback) {
  console.log("updating chatbot: ", chatbot_id)
  const value = await db.get(chatbot_id);
  console.log("chatbot found: ", value);
  let content = {}
  if (value) {
    content = value;
  }
  if (data && data.serverUrl && data.serverUrl.trim() != '') {
    content.serverUrl = data.serverUrl
    console.log("value.serverUrl updated.");
  }
  else {
    content.serverUrl = null;
  }
  console.log("saving content: ", JSON.stringify(content));
  await db.set(chatbot_id, content);
  console.log("data saved.");
  callback();
}

router.get('/botcredendials/:project/bots/:chatbot', (req, res) => {
  verifyAuthorization(req, async (verified) => {
    if (!verified) {
      console.log("Get Unauthorized.")
      res.status(403).send({success: false, msg: 'Unauthorized.'});
    }
    else {
      console.log("Get Authorized.")
      const chatbot_id = req.params.chatbot;
      console.log("getting chatbot: ", chatbot_id)
      let response = {};
      try {
        const reply = await db.get(chatbot_id);
        console.log("reply:", reply)
        if (!reply) {
          response.success = false
          response.errMessage = "No bot found"
          res.writeHead(200, {'content-type': 'application/json'});
          res.write(JSON.stringify(response));
          res.end();
          return
        }
        else {
          response.success = true
          response.value = reply;
          //res.writeHead(200, {'content-type': 'application/json'});
          res.send(response);
          res.end();
        }
      }
      catch (err) {
        console.error("error:", err);
        response.success = false
        response.errMessage = err
        res.writeHead(200, {'content-type': 'application/json'});
        res.write(JSON.stringify(response));
        res.end();
        return
      }
    }
  });
});

router.delete('/botcredendials/:project/bots/:chatbot', async (req, res) => {
  verifyAuthorization(req, async (verified) => {
    if (!verified) {
      console.log("Delete Unauthorized.")
      res.status(403).send({success: false, msg: 'Unauthorized'});
    }
    else {
      const chatbot_id = req.params.chatbot;
      console.log("deleting chatbot: ", chatbot_id)
      await db.remove(chatbot_id);
      res.status(200).send({success: true});
      res.end();
    }
  });
});

function verifyAuthorization(req, callback) {
  const chatbot_id = req.params.chatbot;
  const project_id = req.params.project;
  console.log("veryfing user...", JSON.stringify(req.headers))
  var token = getToken(req.headers);
  console.log("got token: ", token)
  if (!token) {
    console.log("No token provided.")
    callback(false)
    return
  }
  getBotDetail(project_id, chatbot_id, token, function(err, bot) {
    console.log("getBotDetail ok", err, bot)
    if (err) {
      console.log("getBotDetail err", err)
      callback(false)
    }
    else if (bot && bot.success && bot.success == false) {
      console.log("getBotDetail bot && bot.success && bot.success == false")
      callback(false)
    }
    else {
      console.log("getBotDetail true")
      callback(true)
    }
  })
}

function getBotDetail(project_id, chatbot_id, token, callback) {
  // e.g. https://tiledesk-server-pre.herokuapp.com/5e51984fc9c41700175e165c/faq_kb/5e519889c9c41700175e1660
  const URL = `${process.env.API_ENDPOINT}/${project_id}/faq_kb/${chatbot_id}`
  console.log("getBotDetail URL:", URL)
  request({
    url: URL,
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': token
    },
    method: 'GET'
  },
  function(err, response, resbody) {
    if (callback) {
      if (response.statusCode >= 400) {
        callback("Unauthorized", null);
      }
      else {
        console.log("getBotDetail.resbody: ", resbody)
        callback(null, resbody);
      }
    }
  });
}

function getToken(headers) {
  if (headers && headers.authorization) {
    return headers.authorization
  } else {
    return null;
  }
}

function startRasa(settings, completionCallback) {
  if (!settings.MONGODB_URI) {
    throw new Error("settings.MONGODB_URI is mandatory.");
  }
  console.log("Starting RASA connector...");
  console.log("Connecting to mongodb...");
  console.log("settings.KVBASE_COLLECTION:", settings.KVBASE_COLLECTION);
  const kvbase_collection = settings.KVBASE_COLLECTION ? settings.KVBASE_COLLECTION : 'kvstore';
  console.log("kvbase_collection:", kvbase_collection);
  db = new KVBaseMongo(kvbase_collection);
  db.connect(MONGODB_URI, () => {
    console.log("RASA KVBaseMongo successfully connected.");
    if (completionCallback) {
      completionCallback();
    }
  });
}
/*
console.log("Starting RASA connector...");
console.log("Connecting to mongodb...");
console.log("Found process.env.KVBASE_COLLECTION:", process.env.KVBASE_COLLECTION);
const kvbase_collection = process.env.KVBASE_COLLECTION ? process.env.KVBASE_COLLECTION : 'kvstore';
console.log("kvbase_collection:", kvbase_collection);
db = new KVBaseMongo(kvbase_collection);
db.connect(process.env.MONGODB_URI, () => {
  console.log("MongoDB successfully connected.");
  var port = process.env.PORT || 3000;
  app.listen(port, function () {
    console.log('RASA connector listening on port ', port);
  });
});
*/

router.get('/', (req, res) => {
  res.write("Hello from RASA connector (router)");
  res.end();
});

module.exports = { router: router, startRasa: startRasa};
