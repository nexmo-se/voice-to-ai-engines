'use strict'

//-------------

require('dotenv').config();

//--
const express = require('express');
const bodyParser = require('body-parser')
const app = express();

app.use(bodyParser.json());

//---- CORS policy - Update this section as needed ----

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "OPTIONS,GET,POST,PUT,DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
  next();
});

//--- Vonage API - SDK instance ---

const { Auth } = require('@vonage/auth');

const credentials = new Auth({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  applicationId: process.env.APP_ID,
  privateKey: './.private.key'    // private key file name with a leading dot 
});

const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage(credentials);

//-- Vonage API - A phone number associated to this application (see in dashboard) --

const servicePhoneNumber = process.env.SERVICE_PHONE_NUMBER;
console.log('------------------------------------------------------------');
console.log("You may call in to the phone number:", servicePhoneNumber);
console.log('------------------------------------------------------------');

//-- Vonage API - For optional call leg recording --

const fs = require('fs');
const axios = require('axios');

const appId = process.env.APP_ID; // used by tokenGenerate
const privateKey = fs.readFileSync('./.private.key'); // used by tokenGenerate
const { tokenGenerate } = require('@vonage/jwt');

const apiBaseUrl = 'https://api.nexmo.com';

let recordCalls = false;
if (process.env.RECORD_CALLS == 'true') {
  recordCalls = true
}

//-------------------

// Connector server (middleware)
const processorServer = process.env.PROCESSOR_SERVER;

//---- Custom settings ---
const maxCallDuration = process.env.MAX_CALL_DURATION; // in seconds
const liveAgentPhoneNumber = process.env.LIVE_AGENT_PHONE_NUMBER; // E.164 format without leading '+' sign

//-----------------------------------------------------------------------------------

console.log('------------------------------------------------------------');
console.log('To manually trigger an outbound PSTN call to a phone number,');
console.log('in a web browser, enter the address:');
console.log('https://<this-application-server-address>/call?number=<number>');
console.log("callee <number> must be in E.164 format without '+' sign, or '-', '.' characters");
console.log('for example');
console.log('https://xxxx.ngrok.xxx/call?number=12995551212');
console.log('------------------------------------------------------------');

//============= Processing inbound PSTN calls ===============

//-- Incoming PSTN call --

app.get('/answer', async(req, res) => {

  const uuid = req.query.uuid;

  //--

  if (recordCalls) {
    //-- RTC webhooks need to be enabled for this application in the dashboard --
    
    //-- start "leg" recording --
    const accessToken = tokenGenerate(appId, privateKey, {});
  
    try { 
      // const response = await axios.post(apiRegion + '/v1/legs/' + uuid + '/recording',
      const response = await axios.post(apiBaseUrl + '/v1/legs/' + uuid + '/recording',
        {
          "split": true,
          "streamed": true,
          // "beep": true,
          "public": true,
          "validity_time": 30,
          "format": "mp3",
          // "transcription": {
          //   "language":"en-US",
          //   "sentiment_analysis": true
          // }
        },
        {
          headers: {
            "Authorization": 'Bearer ' + accessToken,
            "Content-Type": 'application/json'
          }
        }
      );
      console.log('\n>>> Start recording on leg:', uuid);
    } catch (error) {
      console.log('\n>>> Error start recording on leg:', uuid, error);
    }

  } 

  //--

  const nccoResponse = [
    {                     //-- this talk action section is optional
      "action": "talk",   
      "text": "Connecting your call. You may now speak.",
      "language": "en-US",
      "style": 11
    },
    {
      "action": "conversation",
      "name": "conf_" + uuid,
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

  res.status(200).json(nccoResponse);

});

//------------

app.post('/event', async(req, res) => {

  res.status(200).send('Ok');

  //--

  const hostName = req.hostname;
  const uuid = req.body.uuid;

  //--

  if (req.body.type == 'transfer') {  // this is when the PSTN leg is effectively connected to the named conference

    //-- Create WebSocket leg --

    // WebSocket connection URI
    // Custom data: participant identified as 'user1' in this example, could be 'agent', 'customer', 'patient', 'doctor', ...
    // PSTN call direction is 'inbound'
    const wsUri = 'wss://' + processorServer + '/socket?participant=' + 'user1' +'&call_direction=inbound&peer_uuid=' + uuid + '&webhook_url=https://' + hostName + '/results';

    vonage.voice.createOutboundCall({
      to: [{
        type: 'websocket',
        uri: wsUri,
        'content-type': 'audio/l16;rate=16000'  // NEVER change the content-type parameter argument
      }],
      from: {
        type: 'phone',
        number: '12995550101' // value does not matter
      },
      answer_url: ['https://' + hostName + '/ws_answer_1?original_uuid=' + uuid],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/ws_event_1?original_uuid=' + uuid],
      event_method: 'POST'
      })
      .then(res => {
        console.log("\n>>> WebSocket create status:", res);
      })
      .catch(err => console.error("\n>>> WebSocket create error:", err))  

  };

});

//--------------

app.get('/ws_answer_1', async(req, res) => {

  const originalUuid = req.query.original_uuid;
  const hostName = req.hostname;

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + originalUuid,
      "startOnEnter": true
    }
  ];

  res.status(200).json(nccoResponse);

  //-- Below, simulate call transfer to a live agent after 15 sec,
  //-- this is just to show an example of call flow and API requests.
  //-- Normally, there is no code in this section (route /ws_answer_1) to transfer call,
  //-- as a transfer to live agent is initiated by user's interaction
  //-- with a Voice AI and other business logic of your actual use case.

  setTimeout ( async() => {

    await axios.post('https://' + hostName + '/trftoliveagentpstn',
      {
        "originalUuid": originalUuid,
        "websocketUuid": req.query.uuid,
        "agentPhoneNumber": liveAgentPhoneNumber
      },
      {
        headers: {
          "Content-Type": 'application/json'
        }
      }
    );

  }, 15000);

 });

//------------

app.post('/ws_event_1', async(req, res) => {

  res.status(200).send('Ok');

});

//============= Initiating outbound PSTN calls ===============

//-- Use case where the PSTN call is outbound
//-- manually trigger outbound PSTN call to "number" - see sample request below
//-- sample request: https://<server-address>/call?number=12995550101

app.get('/call', async(req, res) => {

  if (req.query.number == null) {

    res.status(200).send('"number" parameter missing as query parameter - please check');
  
  } else {

    // code may be added here to make sure the number is in valid E.164 format (without leading '+' sign)
  
    res.status(200).send('Ok');  

    const hostName = req.hostname;

    //-- Outgoing PSTN call --

    vonage.voice.createOutboundCall({
      to: [{
        type: 'phone',
        number: req.query.number
      }],
      from: {
       type: 'phone',
       number: servicePhoneNumber
      },
      limit: maxCallDuration, // limit outbound call duration for demos purposes
      answer_url: ['https://' + hostName + '/answer_2'],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/event_2'],
      event_method: 'POST'
      })
      .then(res => console.log(">>> Outgoing PSTN call status:", res))
      .catch(err => console.error(">>> Outgoing PSTN call error:", err))

    }

});

//-----------------------------

app.get('/answer_2', async(req, res) => {

  const  hostName = req.hostname;
  const uuid = req.query.uuid;   

  // WebSocket connection URI
  // Custom data: participant identified as 'user1' in this example, could be 'agent', 'customer', 'patient', 'doctor', '6tf623f9ffk4dcj91' ...
  // PSTN call direction is 'outbound'
  const wsUri = 'wss://' + processorServer + '/socket?participant=' + 'user1' +'&call_direction=outbound&peer_uuid=' + uuid + '&caller_number=' + req.query.from + '&callee_number=' + req.query.to + '&webhook_url=https://' + hostName + '/results';

  const nccoResponse = [
    {
      "action": "talk",
      "text": "Hello. This is a call from your preferred provider. You may now speak.",
      "language": "en-US",
      "style": 11
    },
    {
      "action": "conversation",
      "name": "conf_" + uuid,
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

  res.status(200).json(nccoResponse);

 });

//------------

app.post('/event_2', async(req, res) => {

  res.status(200).send('Ok');

  //--

  const hostName = req.hostname;
  const uuid = req.body.uuid;

  //--

    if (req.body.status == 'ringing' && recordCalls) {  

    const accessToken = tokenGenerate(appId, privateKey, {});

    try { 
      // const response = await axios.post(apiRegion + '/v1/legs/' + uuid + '/recording',
      const response = await axios.post(apiBaseUrl + '/v1/legs/' + uuid + '/recording',
        {
          "split": true,
          "streamed": true,
          "public": true,
          "validity_time": 30,
          "format": "mp3"
        },
        {
          headers: {
            "Authorization": 'Bearer ' + accessToken,
            "Content-Type": 'application/json'
          }
        }
      );
      console.log('\n>>> Start recording on leg:', uuid);
    } catch (error) {
      console.log('\n>>> Error start recording on leg:', uuid, error);
    }

  }

  //--

  if (req.body.type == 'transfer') {  // this is when the PSTN leg is effectively connected to the named conference

    //-- Create WebSocket leg --

    // WebSocket connection URI
    // Custom data: participant identified as 'user1' in this example, could be 'agent', 'customer', 'patient', 'doctor', ...
    // PSTN call direction is 'inbound'
    const wsUri = 'wss://' + processorServer + '/socket?participant=' + 'user1' +'&call_direction=outbound&peer_uuid=' + uuid + '&webhook_url=https://' + hostName + '/results';

    vonage.voice.createOutboundCall({
      to: [{
        type: 'websocket',
        uri: wsUri,
        'content-type': 'audio/l16;rate=16000'  // NEVER change the content-type parameter argument
      }],
      from: {
        type: 'phone',
        number: '12995550101' // value does not matter
      },
      answer_url: ['https://' + hostName + '/ws_answer_2?original_uuid=' + uuid],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/ws_event_2?original_uuid=' + uuid],
      event_method: 'POST'
      })
      .then(res => {
        console.log("\n>>> WebSocket create status:", res);
      })
      .catch(err => console.error("\n>>> WebSocket create error:", err))   

  };

});

//--------------

app.get('/ws_answer_2', async(req, res) => {

  const originalUuid = req.query.original_uuid;
  const hostName = req.hostname;

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + originalUuid,
      "startOnEnter": true
    }
  ];

  res.status(200).json(nccoResponse);

  //-- Below, simulate call transfer to a live agent after 15 sec,
  //-- this is just to show an example of call flow and API requests.
  //-- Normally, there is no code in this section (route /ws_answer_2) to transfer call,
  //-- as a transfer to live agent is initiated by user's interaction
  //-- with a Voice AI and other business logic of your actual use case.

  setTimeout ( async() => {

    await axios.post('https://' + hostName + '/trftoliveagentpstn',
      {
        "originalUuid": originalUuid,
        "websocketUuid": req.query.uuid,
        "agentPhoneNumber": liveAgentPhoneNumber
      },
      {
        headers: {
          "Content-Type": 'application/json'
        }
      }
    );

  }, 15000);


 });

//-------------

app.post('/ws_event_2', async(req, res) => {

  res.status(200).send('Ok');

});

//------------

app.post('/trftoliveagentpstn', async(req, res) => {

  res.status(200).send('Ok');

  //--

  const originalUuid = req.body.originalUuid;
  const hostName = req.hostname;

  //-- Terminate WebSocket to Voice AI (if you do not use AI Assisting live agent) --

  vonage.voice.hangupCall(req.body.websocketUuid)
    .then(res => console.log(">>> Terminated WebSocket leg", uuid))
    .catch(err => null) // WebSocket leg has already terminated

  //-- Outgoing PSTN call --

  vonage.voice.createOutboundCall({ // Initiate call to live agent
    to: [{
      type: 'phone',
      number: req.body.agentPhoneNumber
    }],
    from: {
     type: 'phone',
     number: servicePhoneNumber
    },
    answer_url: ['https://' + hostName + '/answer_liveagent?original_uuid=' + originalUuid],
    answer_method: 'GET',
    event_url: ['https://' + hostName + '/event_liveagent?original_uuid=' + originalUuid],
    event_method: 'POST'
    })
    .then(res => console.log(">>> Outgoing PSTN call to live agent status:", res))
    .catch(err => console.error(">>> Outgoing PSTN call to live agent error:", err))

  //-- Play ring back tone (as "Music on Hold") to waiting remote party --
    vonage.voice.streamAudio(originalUuid, 'http://client-sdk-cdn-files.s3.us-east-2.amazonaws.com/us.mp3', 0, -0.6)

});

//------------

app.get('/answer_liveagent', async(req, res) => {

  const originalUuid = req.query.original_uuid;

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + originalUuid,
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

  res.status(200).json(nccoResponse);

  //-- Stop ring back tone (as MoH) to waiting remote party --
  vonage.voice.stopStreamAudio(originalUuid);

});  

//--------------  

app.post('/event_liveagent', async(req, res) => {

  res.status(200).send('Ok');

});

//--------------  

app.post('/results', async(req, res) => {

  console.log(req.body)

  res.status(200).send('Ok');

});

//-------------

//-- Retrieve call recordings --
//-- RTC webhook URL set to 'https://<this-server>/rtc' for this application in the dashboard --

app.post('/rtc', async(req, res) => {

  res.status(200).send('Ok');

  switch (req.body.type) {

    case "audio:record:done": // leg recording, get the audio file
      console.log('\n>>> /rtc audio:record:done');
      console.log('req.body.body.destination_url', req.body.body.destination_url);
      console.log('req.body.body.recording_id', req.body.body.recording_id);

      await vonage.voice.downloadRecording(req.body.body.destination_url, './post-call-data/' + req.body.body.recording_id + '_' + req.body.body.channel.id + '.mp3');
 
      break;

    case "audio:transcribe:done": // leg recording, get the transcript
      console.log('\n>>> /rtc audio:transcribe:done');
      console.log('req.body.body.transcription_url', req.body.body.transcription_url);
      console.log('req.body.body.recording_id', req.body.body.recording_id);

      await vonage.voice.downloadTranscription(req.body.body.transcription_url, './post-call-data/' + req.body.body.recording_id + '.txt');  

      break;      
    
    default:  
      // do nothing

  }

});
 

//--- If this application is hosted on VCR (Vonage Cloud Runtime) serverless infrastructure --------

app.get('/_/health', async(req, res) => {

  res.status(200).send('Ok');

});

//=========================================

const port = process.env.VCR_PORT || process.env.PORT || 8000;

app.listen(port, () => console.log(`\nVoice API application listening on port ${port}`));

//------------
