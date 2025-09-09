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

//-------

const servicePhoneNumber = process.env.SERVICE_PHONE_NUMBER;
console.log('------------------------------------------------------------');
console.log("You may call in to the phone number:", servicePhoneNumber);
console.log('------------------------------------------------------------');

//--- Vonage API ---

const { Auth } = require('@vonage/auth');

const appId = process.env.APP_ID;

const credentials = new Auth({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  applicationId: appId,
  privateKey: './.private.key'    // private key file name with a leading dot 
});

const apiRegion = "https://" + process.env.API_REGION;

const options = {
  apiHost: apiRegion
};

const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage(credentials, options);

//-- For call leg recording --

const fs = require('fs');
const request = require('request');

const privateKey = fs.readFileSync('./.private.key'); // used by tokenGenerate
const { tokenGenerate } = require('@vonage/jwt');

const vonageNr = new Vonage(credentials, {} );

const region = process.env.API_REGION.substring(4, 6);
// console.log("region:", region);
const apiBaseUrl = "https://api-" + region +".vonage.com";
console.log("apiBaseUrl:", apiBaseUrl);

//-------------------

// Connector server (middleware)
const processorServer = process.env.PROCESSOR_SERVER;

//-------------------

let recordCalls = false;
if (process.env.RECORD_CALLS == 'true') {
  recordCalls = true
  console.log(">>> Call recordings enabled")
}

//---- Custom settings ---
const maxCallDuration = process.env.MAX_CALL_DURATION; // in seconds

console.log('------------------------------------------------------------');
console.log('To manually trigger an outbound PSTN call to a phone number,');
console.log('in a web browser, enter the address:');
console.log('https://<this-application-server-address>/call?number=<number>');
console.log("<number> must in E.164 format without '+' sign, or '-', '.' characters");
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

    // request.post(apiRegion + '/v1/legs/' + uuid + '/recording', {
    request.post(apiBaseUrl + '/v1/legs/' + uuid + '/recording', {
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            "content-type": "application/json",
        },
        body: {
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
        json: true,
      }, function (error, response, body) {
        if (error) {
          console.log('Error start recording on leg:', uuid, error.body);
        }
        else {
          console.log('Start recording on leg:', uuid, response.body);
        }
    });
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
        console.log(">>> WebSocket create status:", res);
      })
      .catch(err => console.error(">>> WebSocket create error:", err))  

  };

});

//--------------

app.get('/ws_answer_1', async(req, res) => {

  const uuid = req.query.original_uuid;

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + uuid,
      "startOnEnter": true
    }
  ];

  res.status(200).json(nccoResponse);

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
      advanced_machine_detection: {
        "behavior": "continue",
        "mode": "default",  // use this value for the latest AMD implementation
        "beep_timeout": 45
      },
      ringing_timer: 25,
      limit: 50, //  in seconds, limit outbound call duration for demos purposes
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

    request.post(apiBaseUrl + '/v1/legs/' + req.body.uuid + '/recording', {
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            "content-type": "application/json",
        },
        body: {
          "split": true,
          "streamed": true,
          "public": true,
          "validity_time": 30,
          "format": "mp3"
        },
        json: true,
      }, function (error, response, body) {
        if (error) {
          console.log('error start recording:', error.body);
        }
        else {
          console.log('start recording response:', response.body);
        }
    });
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
        console.log(">>> WebSocket create status:", res);
      })
      .catch(err => console.error(">>> WebSocket create error:", err))   

  };

});

//--------------

app.get('/ws_answer_2', async(req, res) => {

  const uuid = req.query.original_uuid;

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + uuid,
      "startOnEnter": true
    }
  ];

  res.status(200).json(nccoResponse);

 });

//------------

app.post('/ws_event_2', async(req, res) => {

  res.status(200).send('Ok');

});

//------------

app.post('/results', async(req, res) => {

  console.log(req.body)

  res.status(200).send('Ok');

});

//-------------

//-- Retrieve call recordings --
//-- RTC webhook URL set to 'https://<server>/rtc' for this application in the dashboard --

app.post('/rtc', async(req, res) => {

  res.status(200).send('Ok');

  switch (req.body.type) {

    case "audio:record:done": // leg recording, get the audio file
      console.log('\n>>> /rtc audio:record:done');
      console.log('req.body.body.destination_url', req.body.body.destination_url);
      console.log('req.body.body.recording_id', req.body.body.recording_id);

      await vonageNr.voice.downloadRecording(req.body.body.destination_url, './post-call-data/' + req.body.body.recording_id + '_' + req.body.body.channel.id + '.mp3');
 
      break;

    case "audio:transcribe:done": // leg recording, get the transcript
      console.log('\n>>> /rtc audio:transcribe:done');
      console.log('req.body.body.transcription_url', req.body.body.transcription_url);
      console.log('req.body.body.recording_id', req.body.body.recording_id);

      await vonageNr.voice.downloadTranscription(req.body.body.transcription_url, './post-call-data/' + req.body.body.recording_id + '.txt');  

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
