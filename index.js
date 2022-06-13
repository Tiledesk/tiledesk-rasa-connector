require('dotenv').config();
const { parse } = require('querystring');
var express = require('express');
var cors = require('cors');
const uuid = require('uuid');
const bodyParser = require('body-parser');
const https = require('https');
const formidable = require('formidable');
const fs = require('fs');
const request = require('request');
const { TiledeskChatbotClient } = require('@tiledesk/tiledesk-chatbot-client');
const jwt = require('jsonwebtoken');
let { KVBaseMongo } = require('./KVBaseMongo');
console.log("KVBaseMongo", KVBaseMongo)
var mongodb = require("mongodb");
let db = new KVBaseMongo();

var app = express();
app.use(cors());
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({ extended: true , limit: '50mb'}));

// const structjson = require('./structJson.js');

// async function getChatbotData(chatbot_id, callback) {
//   get(chatbot_id, function(err, reply) {
//     if (err) throw err;
//     callback(reply.value)
//   })
// }

function runRASAQuery(RASAurl, text, callback) {

  request(
    {
      url: `${RASAurl}`,
      method: 'POST',
      headers: {
        "Content-Type": "application/json"
      },
      json: {
        "message": text
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
        if (resbody && resbody.length > 0 && resbody[0].text) {
          resbody.reply = resbody[0].text;  
        }
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

// function runDFQueryOnTiledeskChatbotId(text, chatbot_id, sessionId, payload, callback) {
//   if (!text) throw "Text can't be null"
//   // console.log("DF QUERY: chatbot_id: ", chatbot_id);
//   // console.log("DF QUERY: sessionId: ", sessionId);
//   // console.log("DF QUERY: query text: ", text);
//   console.log("DF QUERY: payload: ", JSON.stringify(payload))
//   const payload_for_df = payload || {}
//   getChatbotData(chatbot_id, function(value) {
//     // console.log("VALUE: ", value)
    
//     let credentials = value.credentials
//     let kbs_comma_separated_string = value.kbs
//     let language_code = value.language
//     // console.log("CREDENTIALS: ", credentials)
//     console.log("KBS: ", kbs_comma_separated_string)
//     console.log("language: ", language_code)
//     const agent_id = credentials.project_id
//     console.log("agent_id: ", agent_id)
//     let kbs_array = null
//     if (kbs_comma_separated_string) {
//       const split_pattern = /[,]/mg
//       let kbs = kbs_comma_separated_string.split(split_pattern)
//       if (kbs.length > 0) {
//         kbs_array = []
//         for (var i=0; i < kbs.length; i++) {
//           let kb_id = kbs[i].trim()
//           if (kb_id != '') {
//             const knowledgeBaseFullName = kbs[i].trim() //`NzEwOTcxNzA2MzEwNjU2MDAwMA`;
//             const knowbase = new dialogflow.KnowledgeBasesClient();
//             const knowledgeBasePath = knowbase.knowledgeBasePath(
//               agent_id,
//               knowledgeBaseFullName
//             );
//             kbs_array.push(knowledgeBasePath)
//           }
//         }
//       }
//     }
    
//     const sessionClient = new dialogflow.SessionsClient({'credentials':credentials});
//     const sessionPath = sessionClient.sessionPath(agent_id, sessionId);
//     console.log("sessionPath: ", sessionPath)
//     var request;
    
//     console.log("DF QUERY. Input Text: ", text)
//     request = {
//       session: sessionPath,
//       queryInput: {
//         text: {
//           text: text,
//           languageCode: language_code
//         },
//       },
//       queryParams: {
//         // payload: structjson.jsonToStructProto(payload_for_df)
//       },
//     };
//     console.log("payload_for_df: " + payload_for_df)
//     if (payload_for_df) {
//       request.queryParams.payload = structjson.jsonToStructProto(payload_for_df)
//     }
//     if (kbs_array) {
//       request.queryParams.knowledgeBaseNames = kbs_array
//     }
//     // console.log("REQUEST: ", request)
//     // Send request and log result
//     sessionClient.detectIntent(request).then (function(responses) {
//       var responses_str = JSON.stringify(responses)
//       const result = responses[0].queryResult;
//       // console.log("RESULT: ", result);
//       // console.log(`Query text: ${result.queryText}`);
//       // console.log("intent.isFallback?", result.intent.isFallback);
//       // console.log("intent.displayName?", result.intent.displayName);
//       // console.log(`Detected Intent: ${result.intent.displayName}`);
//       // console.log(`Confidence: ${result.intentDetectionConfidence}`);
//       // console.log(`Query Result: ${result.fulfillmentText}`);
//       if (result.knowledgeAnswers && result.knowledgeAnswers.answers) {
//         const answers = result.knowledgeAnswers.answers;
//         console.log(`There are ${answers.length} answer(s);`);
//         answers.forEach(a => {
//           console.log(`   answer: ${a.answer}`);
//           console.log(`   confidence: ${a.matchConfidence}`);
//           console.log(`   match confidence level: ${a.matchConfidenceLevel}`);
//         });
//       }
//       callback(result);
//     });
//   });
// }

/**********************
***** NEW BOT *********
***********************/

const CLIENT_TIMESTAMP = "clienttimestamp"

app.post("/tdbot/:chatbot?", async (req, res) => {
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
  
  // const chatbot_name = req.body.hook.name;
  
  var _API_URL = process.env.API_ENDPOINT
  const cbclient = new TiledeskChatbotClient({request: req, response: res, APIURL: _API_URL, APIKEY: '____APIKEY____', log: API_LOG});

  console.log("cbclient.APIURL", cbclient.APIURL)
  console.log("cbclient.tiledeskClient.APIURL", cbclient.tiledeskClient.APIURL)
  
  var chatbot_id;
  var chatbot_name;
  // if (req.params.chatbot) {
  //   chatbot_id = req.params.chatbot;
  //   console.log("chatbot_id from params:", chatbot_id)
  // }
  // else {
    chatbot_id = cbclient.chatbot_id; // const chatbot_name = req.body.hook._id;
    chatbot_name = cbclient.chatbot_name; // const chatbot_name = req.body.hook.name;
    // console.log("chatbot_id from body:", chatbot_id)
  // }
  console.log("CHATBOT-ID: ", chatbot_id)

  console.log(" ******* TEXT *******" + cbclient.text)
  let payload = {}
  let conversation = cbclient.supportRequest
  payload.tiledesk = req.body;
  // immediately reply back
  res.status(200).send({"success":true});
  // updates request's first text, so agents can see
  // it updated in real time on the panel
  if (cbclient.message_subtype !== "info") {
    var properties = {
      "first_text": cbclient.text
    }
    cbclient.updateRequest(properties, null, function(err) {
      console.log("request updated with text: ", cbclient.text)
    })
  }

  const dialogflow_session_id = conversation.request_id
  // runDFQueryOnTiledeskChatbotId(cbclient.text, chatbot_id, dialogflow_session_id, payload, function(result) {
  //   sendBackToTiledesk(cbclient, req.body.payload, result);
  // });

  const RASAserver = await get(chatbot_id);
  runRASAQuery(RASAserver, text, function(result) {
    console.log("BOT: RASA REPLY: " + JSON.stringify(result));
    if(res.statusCode === 200) {

      /* you can optionally check the intent confidence
      var reply = "Intent under confidence threshold, can you rephrase?"
      if (result.intent.confidence > 0.8) {
        reply = result.reply
      }
      */
      
      sendMessage(
        {
          "text": result.reply + "\n* Ok\n* Unhappy",
          attributes: {
            microlanguage: true
          }
        },
        project_id,
        recipient_id,
        token,
        (err) => {
          console.log("Message sent. Error? ", err);
        }
      );
      
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

app.post('/botcredendials/:project/bots/:chatbot', (req, res) => {
  const chatbot_id = req.params.chatbot;
  console.log("post bot credentials for", chatbot_id)
  var form = new formidable.IncomingForm();
  // FORM.PARSE in advance: to avoid H18 error
  // Our 503s (H18 errors) were caused by us not consuming POST data from the socket for some requests.
  // src: https://github.com/copleykj/socialize-cloudinary/issues/1
  form.parse(req, function (err, fields, files) {
    console.log("Form parsed.")
    verifyAuthorization(req, function(verified) {
      if (!verified) {
        console.log("Post Unauthorized.")
        res.status(403).send({success: false, msg: 'Unauthorized.'});
        return
      }
      else {
        console.log("Post Authorized.")
        updateCredentials(chatbot_id, fields, files, res)
      }
    })
  })
});

function updateCredentials(chatbot_id, fields, files, res) {
  console.log("updating chatbot: ", chatbot_id)
  console.log("fields = ", fields)
  console.log("files-STRINGFY = ", JSON.stringify(files))
  get(chatbot_id, function(err, reply) {
    console.log("chatbot found: ", reply)
    let content = {}
    if (reply && reply.value) {
      content = reply.value
      console.log("chatbot found: ", JSON.stringify(content))
    }
    if (fields && fields.kbs && fields.kbs.trim() != '') {
      content.kbs = fields.kbs
      console.log("kbs found: ", content.kbs)
    }
    else {
      content.kbs = null
    }
    content.language = (fields && fields.language)? fields.language : 'en'
    if (files['file']) {
      var path = files["file"].path;
      if (path) {
        fs.readFile(path, 'utf8', function(err, data) {
          if (err) throw err;
          const filename = files["file"].name
          console.log('saving file: ' , filename);
          // console.log(data)
          let credentials;
          try {
            credentials = JSON.parse(data)
          } catch(e) {
              console.log('Invalid JSON credentials file.', data);
              res.status(500).send({success: false, msg: 'Not a valid JSON file.', msgkey: "invalid-JSON-file"});
              return
          }
          content.credentials = credentials
          content.credentials_filename = filename
          console.log("got credentials of: ", credentials.project_id)
          set(chatbot_id, content, function(err) {
            console.log("data saved with credentials. err?", err)
          })
          res.writeHead(200, {'content-type': 'application/json'});
          res.write('{\"success\": true}');
          res.end();
        });
      }
    }
    else {
      console.log("saving content (no credentials): ", JSON.stringify(content))
      set(chatbot_id, content, function(err) {
        console.log("data saved (no credentials). err?", err)
        res.writeHead(200, {'content-type': 'application/json'});
        res.write('{\"success\": true}');
        res.end();
      })
    }
  });
  // })
}

app.get('/botcredendials/:project/bots/:chatbot', (req, res) => {
  verifyAuthorization(req, function(verified) {
    if (!verified) {
      console.log("Get Unauthorized.")
      res.status(403).send({success: false, msg: 'Unauthorized.'});
    }
    else {
      console.log("Get Authorized.")
      const chatbot_id = req.params.chatbot;
      console.log("getting chatbot: ", chatbot_id)
      get(chatbot_id, function(err, reply) {
        let response = {}
        if (err || !reply) {
          response.success = false
          response.errMessage = err
          res.writeHead(200, {'content-type': 'application/json'});
          res.write(JSON.stringify(response));
          res.end();
          return
        }
        response.success = true
        if (reply.value && reply.value.credentials && reply.value.credentials_filename) {
          response.credentials = reply.value.credentials_filename
        } else {
          response.credentials = null
        }
        response.language = reply.value.language
        response.kbs = reply.value.kbs
        res.writeHead(200, {'content-type': 'application/json'});
        res.write(JSON.stringify(response));
        res.end();
      })
    }
  });
});

app.delete('/botcredendials/:project/bots/:chatbot', (req, res) => {
  verifyAuthorization(req, function(verified) {
    if (!verified) {
      console.log("Delete Unauthorized.")
      res.status(403).send({success: false, msg: 'Unauthorized.'});
    }
    else {
      const chatbot_id = req.params.chatbot;
      console.log("deleting chatbot: ", chatbot_id)
      remove(chatbot_id, function(err) {
        // REMOVED: [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client
        // res.writeHead(200, {'content-type': 'application/json'});
        res.status(200).send({success: true});
        res.end();
      })
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
  // https://tiledesk-server-pre.herokuapp.com/5e51984fc9c41700175e165c/faq_kb/5e519889c9c41700175e1660
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
    console.log("getBotDetail.resbody: ", resbody)
    callback(err, resbody)
  });
}

function getToken(headers) {
  if (headers && headers.authorization) {
    return headers.authorization
  } else {
    return null;
  }
}

/******************************************
 *********** BOT PERSISTENCE **************
 ******************************************/

const BOTS_COLLECTION = "bots"
function get(key) {
  
  // db.collection(BOTS_COLLECTION).findOne({ key: key }, function(err, doc) {
  //   callback(err, doc)
  // });
}

function set(key, content, callback) {
  // db.collection(BOTS_COLLECTION).updateOne({key: key}, { $set: { value: content, key: key } }, { upsert: true }, function(err, doc) {
  //   callback(err)
  // });
}

function remove(key, callback) {
  // db.collection(BOTS_COLLECTION).deleteOne({key: key}, function(err) {
  //   console.log("delete err? ", err)
  //   callback(err)
  // });
}

// console.log("connecting to mongodb...")
// mongodb.MongoClient.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true }, function (err, client) {
//   if (err) {
//     console.log(err);
//     process.exit(1);
//   } else {
//     console.log("MongoDB successfully connected.")
//   }
//   db = client.db();
//   console.log("Database connection ready");
//   db.collection("bots").createIndex(
//     { "key": 1 }, { unique: true }
//   );
db.connect(process.env.MONGODB_URI, () => {
  var port = process.env.PORT || 3000;
  app.listen(port, function () {
    console.log('Example app listening on port ', port);
  });
});
  
// });

app.get('/', (req, res) => {
  res.write("Hello from Dialogflow connector 1.0.1");
  res.end();
});