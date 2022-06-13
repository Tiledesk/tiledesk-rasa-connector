# Tiledesk native Dialogflow connector

### 1.6 - online
- Now every message has a attribues.intent_info section with confidence level, is_fallback, intent name etc. These info are used i.e. by webhooks to take decisions

### 1.5
- Fires not-found event on the occurrence of a Dialogflow fallback intent
- Adds to each reply message: message.attributes._answerid = intent_name
- Adds to each reply message: message.attributes._raw_message = command.text
- Configuration moved to .env
- updated "@tiledesk/tiledesk-chatbot-client": "^0.5.29"
- log: process.env.API_LOG
- "@tiledesk/tiledesk-chatbot-util": "^0.8.19"

### 1.3
- all tiledesk event hook payload goes in Dialogflow payload

### 1.1
- added: npm tiledesk-chatbot-util
- added: npm tiledesk-chatbot-client
- removed: verbose log messages
- refactored: TiledeskChatbotUtil methods are now "static"
