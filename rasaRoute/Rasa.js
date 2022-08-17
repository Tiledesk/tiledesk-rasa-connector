const request = require('request');

class Rasa {

  contructor(config) {
    this.log = false;
    if (config) {
      this.log = config.log ? true : false;
    }
  }
  
  runRASAQuery(RASAurl, rasa_sender_id, text, callback) {
    if (this.log) {
      console.log("Using RASAurl:", RASAurl)
      console.log("Using rasa_sender_id:", rasa_sender_id)
      console.log("Using text:", text)
    }
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
        if (this.log) {
          console.log("res.statusCode:", res.statusCode)
        }
        if (err) {
          console.error("An error occurred", err);
        }
        else if (res.statusCode >= 400) {
          console.error("status code error: res.statusCode = ", res.statusCode);
        }
        else {
          if (this.log) {
            console.log("RASA reply:", resbody);
          }
          callback(resbody);
        }
      }
    );
  }

  // DEPRECATED
  messageByRASAResponse(result) {
    const initial_bot_answer = result[0].text;
    const message = this.translateToTiledesk(result[0]);
    console.log("le message", message)
    // splits
    let commands = null;
    if (result.length > 1) {
      commands = [];
      for (let i = 0; i < result.length; i++) {
        console.log("iii:", i);
        console.log("result.length", result.length)
        let command_message = this.translateToTiledesk(result[i]);
        // last command eventually gets buttons from the main message 
        /*if ( i === result.length - 1 ) {
          console.log("i === result.length - 1", result.length)
          command_message.attachment = message.attachment;
        }*/
        commands.push({
          type: "message",
          "message": command_message
          //"message": {text: result[i].text}
        });
        if (i <= result.length - 2) {
          commands.push({
          type: "wait",
          time: 500
        });
        }
      }
    }
    if (commands) {
      if (!message.attributes) {
        message.attributes = {}
      }
      message.attributes.commands = commands
    }
    // buttonsAndimage(message)
    // foreach command.type == message: buttonsAndimage(command)
    console.log("returning", JSON.stringify(message))
    return message;
  }

  commandsByRASAResponse(response) {
    let commands = [];
    if (response.length > 0) {
      for (let i = 0; i < response.length; i++) {
        console.log("iii:", i);
        console.log("response.length", response.length)
        let command_message = this.translateToTiledesk(response[i]);
        commands.push({
          type: "message",
          "message": command_message
          //"message": {text: result[i].text}
        });
        if (i <= response.length - 2) {
          commands.push({
            type: "wait",
            time: 300
          });
        }
      }
    }
    console.log("returning", JSON.stringify(commands));
    return commands;
  }
  
  translateToTiledesk(rasa_message) {
    console.log("Translating:", rasa_message);
    /*
    {
    	"recipient_id": "support-group-62ef4ae6eb14a5001a828895-ddcd7ed4b87d408d8108cb5169c424c4",
    	"text": "Here is something to cheer you up:"
    }
    */
    let message = {}
    if (rasa_message.text) {
      message.text = rasa_message.text;
    }
    /*
    {
    	"recipient_id": "support-group-62ef4ae6eb14a5001a828895-ddcd7ed4b87d408d8108cb5169c424c4",
    	"image": "https://i.imgur.com/nGF1K8f.jpg"
    }
    */
    if (rasa_message.image) {
      message.text = " ";
      message.type = "image";
      message.metadata = {
        src: rasa_message.image
      };
    }
    /*
    {
    	"recipient_id": "support-group-62ef4ae6eb14a5001a828895-ddcd7ed4b87d408d8108cb5169c424c4",
    	"text": "I am a bot, powered by Rasa.",
    	"buttons": [{
    		"title": "great",
    		"payload": "/mood_great"
    	}, {
    		"title": "super sad",
    		"payload": "/mood_sad"
    	}]
    }
    */
    if (rasa_message.buttons && rasa_message.buttons.length > 0) {
      const _buttons = rasa_message.buttons;
      let buttons = [];
      _buttons.forEach(b => {
        buttons.push(
          {
            type: "action",
            value: b.title,
            action: b.payload,
            show_echo: true
          }
        )
      });
      if (!message.attributes) {
        message.attributes = {}
      }
      let attachment = {
        type:"template",
        buttons: buttons
      };
      message.attributes.attachment = attachment;
    }
    return message;
  }
    
}

  


module.exports = { Rasa };