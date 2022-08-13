require('dotenv').config();
const { parse } = require('querystring');
var express = require('express');
const router = express.Router();
var cors = require('cors');
const uuid = require('uuid');
const bodyParser = require('body-parser');
const https = require('https');
const fs = require('fs');
const request = require('request');
const { TiledeskChatbotClient } = require('@tiledesk/tiledesk-chatbot-client');
const jwt = require('jsonwebtoken');
const { KVBaseMongo } = require('@tiledesk/tiledesk-kvbasemongo');
const mongodb = require("mongodb");

// plugs local (dev in tybot: https://replit.com/@tiledesk/tiledesk-chatbot-external-github#tybotRoute/index.js)
//const { MessagePipeline } = require('./MessagePipeline');
//const { DirectivesChatbotPlug } = require('./DirectivesChatbotPlug');
//const { SplitsChatbotPlug } = require('./SplitsChatbotPlug');
//const { MarkbotChatbotPlug } = require('./MarkbotChatbotPlug');

// plugs prod
const { MessagePipeline } =  require('@tiledesk/tiledesk-chatbot-plugs/MessagePipeline');
const { DirectivesChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/DirectivesChatbotPlug');
const { SplitsChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/SplitsChatbotPlug');
const { MarkbotChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/MarkbotChatbotPlug');
const { WebhookChatbotPlug } = require('@tiledesk/tiledesk-chatbot-plugs/WebhookChatbotPlug');

const { Rasa } = require('./Rasa');
let db;

//var app = express();
router.use(cors());
router.use(bodyParser.json({limit: '50mb'}));
router.use(bodyParser.urlencoded({ extended: true , limit: '50mb'}));

let log = true;
let API_ENDPOINT = null;

router.post("/rasabot", async (req, res) => {
  // delete req.body.payload.request.messages;
  if (log) {
    console.log(" ******* NEW REQUEST *******\n\n\n")
    console.log('req.body:', JSON.stringify(req.body));
  }
  // console.log("BOT: req.body: " + JSON.stringify(req.body));
  // const project_id = req.body.payload.id_project;
  // const channel = req.body.payload.channel;
  // const channel_name = channel ? channel.name : null;
  // console.log("Channel name", channel_name);
  // console.log('req.body.hook:', JSON.stringify(req.body.hook));
  // console.log("PROJECT-ID:", project_id)
  const API_LOG = process.env.API_LOG === 'true' ? true : false;
  var _API_URL = API_ENDPOINT; //process.env.API_ENDPOINT
  const cbclient = new TiledeskChatbotClient({request: req, response: res, APIURL: _API_URL, APIKEY: '____APIKEY____', log: API_LOG});
  const message = req.body.payload;
  if (log) {
    console.log("message:", message);
    console.log("cbclient.APIURL", cbclient.APIURL);
    console.log("cbclient.tiledeskClient.APIURL", cbclient.tiledeskClient.APIURL);
  }
  
  var chatbot_id;
  var chatbot_name;
  chatbot_id = cbclient.chatbot_id; // const chatbot_name = req.body.hook._id;
    chatbot_name = cbclient.chatbot_name; // const chatbot_name = req.body.hook.name;
    // console.log("chatbot_id from body:", chatbot_id)
  // }
  if (log) {
    console.log("CHATBOT-ID: ", chatbot_id)
    console.log("TEXT:" + cbclient.text)
  }
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
      if (log) {
        console.log("request updated with text: ", cbclient.text)
      }
    });
  }

  const rasa_user_id = conversation.request_id;
  if (log) {
    console.log("rasa_user_id: ", rasa_user_id)
  }
  if (log) {console.log("Searching chatbotInfo with key: ", chatbot_id)}
  let chatbotInfo;
  if (process.env.serverUrl) {
    chatbotInfo = {
      serverUrl: process.env.serverUrl
    }
  }
  if (!chatbotInfo) {
    if (log) {console.log("looking for chatbot in db", chatbot_id)}
    chatbotInfo = await db.get(chatbot_id);
    if (log) {console.log("Chatbot found in db!", chatbotInfo);}
  }
  else {
    if (log) {console.log("chatbotInfo gor from .env", chatbotInfo)}
  }
  const RASAurl = chatbotInfo.serverUrl;
  let query_text = cbclient.text
  if (cbclient.action) {
    query_text = cbclient.action;
    console.log("Action:", query_text);
  }
  const rasa = new Rasa({log: log});
  rasa.runRASAQuery(RASAurl, rasa_user_id, cbclient.text, async (result) => {
    if (log) {
      console.log("RASA replied: " + JSON.stringify(result));
    }
    let message;
    if(res.statusCode === 200) {
      if (result && result.length > 0 && result[0].text) {
        message = rasa.messageByRASAResponse(result);
      }
      /* you can optionally check the intent confidence
      var reply = "Intent under confidence threshold, can you rephrase?"
      if (result.intent.confidence > 0.8) {
        reply = result.reply
      }
      */
    }
    else {
      message = {
        text: "(RASA) An error occurred."
      }
    }
    await execPipeline(message, cbclient, API_ENDPOINT, {}, () => {
      if (log) {
        console.log("Message sent.");
      }
    });
  });
})

async function execPipeline(static_bot_answer, cbclient, API_ENDPOINT, context, completionCallback) {
  console.log("static_bot_answer:", static_bot_answer);
  // message pipeline
  if (!static_bot_answer.attributes) {
    static_bot_answer.attributes = {}
  }
  static_bot_answer.attributes.directives = true;
  static_bot_answer.attributes.splits = false;
  static_bot_answer.attributes.markbot = false;
  const messagePipeline = new MessagePipeline(static_bot_answer, context);
  let directivesPlug = new DirectivesChatbotPlug(cbclient.supportRequest, API_ENDPOINT, cbclient.token);
  messagePipeline.addPlug(directivesPlug);
  messagePipeline.addPlug(new SplitsChatbotPlug());
  messagePipeline.addPlug(new MarkbotChatbotPlug());
  let bot_answer = await messagePipeline.exec();
  if (log) {
    console.log("End pipeline, bot_answer:", JSON.stringify(bot_answer));
  }
  /*bot_answer = {
    text: "Ciaoo",
    attributes: {
      attachment: {
        type:"template",
        buttons: [
          {
            type: "action",
            value: "Hi",
            action: "Hi",
            show_echo: true
          }
        ]
      }
    }
  };*/
  /*bot_answer = {
	"text": "Hey!",
	"attributes": {
		"attachment": {
			"type": "template",
			"buttons": [{
				"type": "action",
				"value": "Who are you?",
				"action": "Who are you?",
				"show_echo": true
			}, {
				"type": "action",
				"value": "Bye",
				"action": "Bye",
				"show_echo": true
			}]
		},
		"directives": true,
		"splits": false,
		"markbot": false,
		"commands": [{
			"type": "message",
			"message": {
				"text": "Hey!"
			}
		}, {
			"type": "wait",
			"time": 500
		}, {
			"type": "message",
			"message": {
				"text": "How are you?"
			}
		}]
	}
};*/
  cbclient.tiledeskClient.sendSupportMessage(
    cbclient.supportRequest.request_id, bot_answer,
    () => {
      if (log) {
        console.log("Message sent.");
      }
      directivesPlug.processDirectives(() => {
        if (log) {
          console.log("End processing directives.");
        }
        if (completionCallback) {
          completionCallback();
        }
      });
    }
  );
}

/*
function sendBackToTiledesk(cbclient, payload, result) {
  const is_fallback = result.intent.isFallback;
  const intent_confidence = result.intentDetectionConfidence;
  const intent_name = result.intent.displayName;
  if (log) {
    console.log("result.intent.isFallback?", is_fallback);
    console.log(`result.intent.displayName: ${intent_name}`);
    console.log(`Confidence: ${intent_confidence}`);
  }
  // const payload_clone = Object.assign({}, payload);
  // const message_object = delete payload_clone.request;
  const intent_info = {
    intent_name: intent_name,
    is_fallback: is_fallback,
    confidence: intent_confidence,
    message: payload.message // ASPETTO LEO CHE FACCIA QUESTA PATCH
  }
  // if (is_fallback || (!is_fallback && intent_confidence < 0.7)) {
    // console.log("Fallback or inaccurate confidence. Fallback?", is_fallback, "Confidence?", intent_confidence);
    // console.log("FIRING NOT FOUND TEXT:", cbclient.text)
    // fireNotFoundEvent(cbclient, is_fallback, intent_confidence);
  // }
}
*/


/*
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
}*/

router.post('/botcredendials/:project/bots/:chatbot', (req, res) => {
  const chatbot_id = req.params.chatbot;
  if (log) {
    console.log("post bot credentials for", chatbot_id)
    console.log('req.body:', JSON.stringify(req.body));
  }
  const data = req.body;
  if (log) {
    console.log("DATA:", data)
  }
  
  verifyAuthorization(req, function(verified) {
    if (!verified) {
      if (log) {
        console.log("Post Unauthorized.")
      }
      res.status(403).send({success: false, msg: 'Unauthorized'});
      return
    }
    else {
      if (log) {
        console.log("Post Authorized.")
      }
      updateCredentials(chatbot_id, data, res, () => {
        //res.writeHead(200, {'content-type': 'application/json'});
        res.send({"success": true});
        res.end();
      });
    }
  });
});

async function updateCredentials(chatbot_id, data, res, callback) {
  if (log) {
    console.log("updating chatbot: ", chatbot_id)
  }
  const value = await db.get(chatbot_id);
  if (log) {
    console.log("chatbot found: ", value);
  }
  let content = {}
  if (value) {
    content = value;
  }
  if (data && data.serverUrl && data.serverUrl.trim() != '') {
    content.serverUrl = data.serverUrl
    if (log) {
      console.log("value.serverUrl updated.");
    }
  }
  else {
    content.serverUrl = null;
  }
  if (log) {
    console.log("saving content: ", JSON.stringify(content));
  }
  await db.set(chatbot_id, content);
  if (log) {
    console.log("data saved.");
  }
  callback();
}

router.get('/botcredendials/:project/bots/:chatbot', (req, res) => {
  verifyAuthorization(req, async (verified) => {
    if (!verified) {
      if (log) {
        console.log("Get Unauthorized.")
      }
      res.status(403).send({success: false, msg: 'Unauthorized.'});
    }
    else {
      if (log) {
        console.log("Get Authorized.")
      }
      const chatbot_id = req.params.chatbot;
      if (log) {
        console.log("getting chatbot: ", chatbot_id)
      }
      let response = {};
      try {
        const reply = await db.get(chatbot_id);
        if (log) {
          console.log("reply:", reply)
        }
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
      if (log) {
        console.log("Delete Unauthorized.")
      }
      res.status(403).send({success: false, msg: 'Unauthorized'});
    }
    else {
      const chatbot_id = req.params.chatbot;
      if (log) {
        console.log("deleting chatbot: ", chatbot_id)
      }
      await db.remove(chatbot_id);
      res.status(200).send({success: true});
      res.end();
    }
  });
});

function verifyAuthorization(req, callback) {
  const chatbot_id = req.params.chatbot;
  const project_id = req.params.project;
  if (log) {
    console.log("veryfing user...", JSON.stringify(req.headers))
  }
  var token = getToken(req.headers);
  if (log) {
    console.log("got token: ", token)
  }
  if (!token) {
    if (log) {
      console.log("No token provided.")
    }
    callback(false)
    return
  }
  getBotDetail(project_id, chatbot_id, token, function(err, bot) {
    if (log) {
      console.log("getBotDetail ok", err, bot)
    }
    if (err) {
      console.error("getBotDetail err", err)
      callback(false)
    }
    else if (bot && bot.success && bot.success == false) {
      if (log) {
        console.log("getBotDetail bot && bot.success && bot.success == false")
      }
      callback(false)
    }
    else {
      if (log) {
        console.log("getBotDetail true")
      }
      callback(true)
    }
  })
}

function getBotDetail(project_id, chatbot_id, token, callback) {
  // e.g. https://tiledesk-server-pre.herokuapp.com/5e51984fc9c41700175e165c/faq_kb/5e519889c9c41700175e1660
  const URL = `${API_ENDPOINT}/${project_id}/faq_kb/${chatbot_id}`
  if (log) {
    console.log("getBotDetail URL:", URL)
  }
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
        if (log) {
          console.log("getBotDetail.resbody:", resbody)
        }
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
  //throw "ERRORRRRRRRR";
  console.log("Starting RASA with Settings:......", settings);
  if (!settings.MONGODB_URI) {
    throw new Error("settings.MONGODB_URI is mandatory.");
  }
  if (!settings.API_ENDPOINT) {
    throw new Error("settings.API_ENDPOINT is mandatory.");
  }
  else {
    API_ENDPOINT = settings.API_ENDPOINT;
    console.log("(RASA) settings.API_ENDPOINT:", API_ENDPOINT);
  }
  /*if (settings.chatbotInfo) {
    chatbotInfo = settings.chatbotInfo;
    console.log("(RASA) Got chatbotInfo:", chatbotInfo);
  }*/
  if (!settings.log) {
    log = false;
  }
  console.log("Starting RASA connector...");
  console.log("(RASA) Connecting to mongodb...");
  console.log("(RASA) settings.KVBASE_COLLECTION:", settings.KVBASE_COLLECTION);
  const kvbase_collection = settings.KVBASE_COLLECTION ? settings.KVBASE_COLLECTION : 'kvstore';
  console.log("(RASA) kvbase_collection:", kvbase_collection);
  db = new KVBaseMongo(kvbase_collection);
  db.connect(settings.MONGODB_URI, () => {
    console.log("(RASA) KVBaseMongo successfully connected.");
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
