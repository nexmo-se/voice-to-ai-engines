'use strict'

//-------------

require('dotenv').config();

//--- for Neru installation ----
const neruHost = process.env.NERU_HOST;
console.log('neruHost:', neruHost);

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
console.log("Service phone number:", servicePhoneNumber);

const pstnCalleeNumber = process.env.PSTN_CALLEE_NUMBER;
console.log("Second PSTN phone number:", pstnCalleeNumber);

// const simulatedDelay = process.env.SIMULATED_DELAY; // delay before establishing outbound calling to other PSTN party

//--- Vonage API ---

const { Auth } = require('@vonage/auth');

const credentials = new Auth({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  applicationId: process.env.APP_ID,
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

const appId = process.env.APP_ID; // used by tokenGenerate
const privateKey = fs.readFileSync('./.private.key'); // used by tokenGenerate
const { tokenGenerate } = require('@vonage/jwt');

const vonageNr = new Vonage(credentials, {} );  
const apiBaseUrl = "https://api-us.vonage.com";

//-------------------

// WebSocket server (middleware)
const processorServer = process.env.PROCESSOR_SERVER;

//============= Processing inbound PSTN calls ===============

//-- Incoming PSTN 1 call --
//-- Step a below <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

app.get('/answer', async(req, res) => {

  const pstn1Uuid = req.query.uuid;

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + pstn1Uuid, // PSTN 1
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

  res.status(200).json(nccoResponse);

  // temporarily store the caller number associated to the call uuid of PSTN 1 leg
  app.set('caller_number_from_uuid_' + pstn1Uuid, req.query.from);

});

//------------

app.post('/event', async(req, res) => {

  res.status(200).send('Ok');

  //--

  const hostName = req.hostname;
  const pstn1Uuid = req.body.uuid;

  //--

  if (req.body.type == 'transfer') {  // this is when PSTN 1 leg is effectively connected to the named conference

    const callerNumber = app.get('caller_number_from_uuid_' + pstn1Uuid);

    //-- Create WebSocket 1 leg --
    //-- step b1 below <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< 

    // WebSocket connection URI
    // Custom data: participant identified as 'user1' in this example, could be 'agent', 'customer', 'patient', 'doctor', ...
    // PSTN 1 call direction is 'inbound'
    const wsUri = 'wss://' + processorServer + '/socket?participant=' + 'user1' +'&call_direction=inbound&peer_uuid=' + pstn1Uuid + '&caller_number=' + callerNumber;

    vonage.voice.createOutboundCall({
      to: [{
        type: 'websocket',
        uri: wsUri,
        'content-type': 'audio/l16;rate=16000'  // NEVER change the content-type parameter argument
      }],
      from: {
        type: 'phone',
        number: callerNumber
      },
      answer_url: ['https://' + hostName + '/ws_answer_1?original_uuid=' + pstn1Uuid],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/ws_event_1?original_uuid=' + pstn1Uuid],
      event_method: 'POST'
      })
      .then(res => {
        app.set('wsa1_from_pstn1_' + pstn1Uuid, res.uuid); // associate to PSTN leg A uuid the WebSocket leg A uuid
        console.log(">>> WebSocket 1 create status:", res);
      })
      .catch(err => console.error(">>> WebSocket 1 create error:", err))

    // //-- Create PSTN 2 leg --
    // //-- Step b2 below <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

    // vonage.voice.createOutboundCall({
    //   to: [{
    //     type: 'phone',
    //     number: pstnCalleeNumber
    //   }],
    //   from: {
    //    type: 'phone',
    //    number: servicePhoneNumber
    //   },
    //   answer_url: ['https://' + hostName + '/answer_2?original_uuid=' + pstn1Uuid],
    //   answer_method: 'GET',
    //   event_url: ['https://' + hostName + '/event_2?original_uuid=' + pstn1Uuid],
    //   event_method: 'POST'
    //   })
    //   .then(res => {
    //     console.log(">>> outgoing PSTN 2 call status:", res);
    //     app.set('pstn2_from_pstn1_' + pstn1Uuid, res.uuid);
    //     })
    //   .catch(err => console.error(">>> outgoing PSTN 1 call error:", err))
      
    // //-- Play audio file with ring back tone sound to PSTN leg 1 --

    // vonage.voice.getCall(pstn1Uuid)
    //   .then(res => {
    //     if (res.status == 'answered') { // is PSTN leg 1 still up?

    //       vonage.voice.streamAudio(pstn1Uuid, 'http://client-sdk-cdn-files.s3.us-east-2.amazonaws.com/us.mp3', 0, -0.6)
    //         .then(res => console.log(`>>> streaming ring back tone to call ${pstn1Uuid} status:`, res))
    //         .catch(err => {
    //           console.error(`>>> streaming ring back tone to call ${pstn1Uuid} error:`, err)
    //         });

    //     }
    //    })
    //   .catch(err => console.error(">>> error get call status of PSTN leg A", pstn1Uuid, err))  

    //-- start "leg" recording --
    const accessToken = tokenGenerate(process.env.APP_ID, privateKey, {});

    // request.post(apiRegion + '/v1/legs/' + pstn1Uuid + '/recording', {
    request.post(apiBaseUrl + '/v1/legs/' + pstn1Uuid + '/recording', {
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
          console.log('Error start recording:', pstn1Uuid, error.body);
        }
        else {
          console.log('Start recording response:', pstn1Uuid, response.body);
        }
    });    

  };

  //--

  if (req.body.status == 'completed') {

    //-- terminate WebSocket 1 leg if in progress
    const ws1Uuid = app.get('ws1_from_pstn1_' + pstn1Uuid);

    if (ws1Uuid) {
      vonage.voice.getCall(ws1Uuid)
        .then(res => {
          if (res.status == 'ringing' || res.status == 'answered') {
            vonage.voice.hangupCall(ws1Uuid)
              .then(res => console.log(">>> WebSocket 1 leg terminated", ws1Uuid))
              .catch(err => null) // WebSocket 1 leg has already been terminated
          }
         })
        .catch(err => console.error(">>> error get call status of PSTN leg 1", ws1Uuid, err))    
    };

    //-- terminate PSTN 2 leg if in progress
    const pstn2Uuid = app.get('pstn2_from_pstn1_' + pstn1Uuid);

    // if (pstn2Uuid) {
    //   vonage.voice.getCall(pstn2Uuid)
    //     .then(res => {
    //       if (res.status == 'ringing' || res.status == 'answered') {
    //         vonage.voice.hangupCall(pstn2Uuid)
    //           .then(res => console.log(">>> PSTN 2 leg terminated", pstn2Uuid))
    //           .catch(err => null) // PSTN 2 leg has already been terminated
    //       }
    //      })
    //     .catch(err => console.error(">>> error get call status of PSTN leg 2", pstn2Uuid, err))    
    // };

    //--

    console.log(">>> PSTN 1 leg", pstn1Uuid, "terminated");

    //--

    app.set('caller_number_from_uuid_' + pstn1Uuid, null);  // temporarily stored info no longer needed
    app.set('pstn2_from_pstn1_' + pstn1Uuid, null);         // temporarily stored info no longer needed

  };

});

//--------------

app.get('/ws_answer_1', async(req, res) => {

  const pstn1Uuid = req.query.original_uuid;

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + pstn1Uuid,
      "canHear": [pstn1Uuid],
      "startOnEnter": true
    }
  ];

  res.status(200).json(nccoResponse);

 });

//------------

app.post('/ws_event_1', async(req, res) => {

  res.status(200).send('Ok');

  const ws1Uuid = req.body.uuid;
  const pstn1Uuid = req.query.original_uuid;
  
  if (req.body.type == 'transfer') {

    let hostName;

    if (neruHost) {
      hostName = neruHost;
    } else {
      hostName = req.hostname;
    }   

  };

  //--

  if (req.body.status == 'completed') {

    if (!app.get('pstn2_from_pstn1_' + pstn1Uuid)) { // has (outbound) PSTN leg B not yet been created?

      vonage.voice.getCall(pstn1Uuid)
        .then(res => {
          if (res.status != 'completed') {
            vonage.voice.hangupCall(pstn1Uuid)
              .then(res => console.log(">>> Terminating PSTN 1 leg", pstn1Uuid))
              .catch(err => null) // PSTN 1 leg has already been terminated
          }
         })
        .catch(err => console.error(">>> error get call status of PSTN leg 1", pstn1Uuid, err))  

    };

    console.log('>>> WebSocket 1 leg',  ws1Uuid, 'terminated');

    //-- no longer need stored info
    app.set('ws1_from_pstn1_' + pstn1Uuid, null);

  };

  //--

  if (req.body.status == 'started' || req.body.status == 'ringing') {

    vonage.voice.getCall(pstn1Uuid)
      
      .then(res => {

        if (res.status == 'completed') {

          vonage.voice.getCall(ws1Uuid)
          .then(res => {
              if (res.status != 'completed') {
                vonage.voice.hangupCall(ws1Uuid)
                  .then(res => console.log(">>> WebSocket 1 leg terminated", ws1Uuid))
                  .catch(err => null) // WebSocket leg 1  has already been terminated 
              }
             })
          .catch(err => console.error(">>> error get call status of WebSocket leg 1", ws1Uuid, err))  
  
        }
       
       })
      
      .catch(err => console.error(">>> error get status of PSTN leg 1", pstn1Uuid, err))  
  
  };

});

//--------------

app.get('/answer_2', async(req, res) => {

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + req.query.original_uuid,
      "startOnEnter": true,
      "endOnExit": true
    }
  ];

  res.status(200).json(nccoResponse);

  // temporarily store the callee number associated to the call uuid of PSTN 2 leg
  app.set('callee_number_from_uuid_' + req.query.uuid, req.query.to);

});

//--------------

app.post('/event_2', async(req, res) => {

  res.status(200).send('Ok');

  //--

  let hostName;

  if (neruHost) {
    hostName = neruHost;
  } else {
    hostName = req.hostname;
  }

  //--

  const pstn1Uuid = req.query.original_uuid;
  const pstn2Uuid = req.body.uuid;
  const status = req.body.status;

  //--

  if (req.body.type == 'transfer') {

    const calleeNumber = app.get('callee_number_from_uuid_' + pstn2Uuid);

    //-- Create WebSocket 2 leg --
    //-- step c below <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

    // WebSocket connection URI
    // Custom data: participant identified as 'user2' in this example, could be 'agent', 'customer', 'patient', 'doctor', ...
    // PSTN 2 call direction is 'outbound'
    const wsUri = 'wss://' + processorServer + '/socket?participant=' + 'user2' +'&call_direction=outbound&peer_uuid=' + pstn2Uuid + '&callee_number=' + calleeNumber;

    vonage.voice.createOutboundCall({
      to: [{
        type: 'websocket',
        uri: wsUri,
        'content-type': 'audio/l16;rate=16000'  // NEVER change the content-type parameter argument
      }],
      from: {
        type: 'phone',
        number: calleeNumber
      },
      answer_url: ['https://' + hostName + '/ws_answer_2?original_uuid=' + pstn1Uuid + '&pstn2_uuid=' + pstn2Uuid],
      answer_method: 'GET',
      event_url: ['https://' + hostName + '/ws_event_2?original_uuid=' + pstn1Uuid + '&pstn2_uuid=' + pstn2Uuid],
      event_method: 'POST'
      })
      .then(res => {
        app.set('ws2_from_pstn2_' + pstn2Uuid, res.uuid); // associate to PSTN leg 2 uuid the WebSocket leg 2 uuid
        console.log(">>> WebSocket 2 create status:", res);
      })
      .catch(err => console.error(">>> WebSocket 2 create error:", err))


    // TBD: Move this section under "transfer" of websocket 2
    // vonage.voice.getCall(pstn1Uuid)
    //   .then(res => {
    //     if (res.status == 'answered') { // is PSTN 1 leg still up?

    //       // stop music-on-hold ring back tone (music-on-hold)      
    //       vonage.voice.stopStreamAudio(pstn1Uuid)
    //         .then(res => console.log(`>>> stop streaming ring back tone to call ${pstn1Uuid} status:`, res))
    //         .catch(err => {
    //           console.log(`>>> stop streaming ring back tone to call ${pstn1Uuid} error:`, err.body);
    //         });
    //     }
    //    })
    //   .catch(err => console.error(">>> error get call status of PSTN leg 1", pstn1Uuid, err)) 
  
  };

  //--

  if (status == 'ringing' || status == 'answered') {
    
    vonage.voice.getCall(pstn1Uuid)
      .then(res => {
        if (res.status == 'completed') { // has PSTN 1 leg terminated?

          vonage.voice.hangupCall(pstn2Uuid)
            .then(res => console.log(">>> PSTN leg 2 terminated", pstn2Uuid))
            .catch(err => null) // PSTN leg 2 has already been terminated 
        
        }
       })
      .catch(err => console.error(">>> error get call status of PSTN leg 2", pstn2Uuid, err)) 

  };

  //--

  if (status == 'completed') {
    
    console.log('>>> PSTN 2 leg',  pstn2Uuid, 'terminated');

    app.set('pstn2_from_pstn1_' + pstn1Uuid, null);         //-- no longer need stored info
    app.set('callee_number_from_uuid_' + pstn2Uuid, null);  //-- no longer need stored info
  
  };

});

//--------------

app.get('/ws_answer_2', async(req, res) => {

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conf_" + req.query.original_uuid,
      "canHear": [req.query.pstn2_uuid],
      "startOnEnter": true
    }
  ];

  res.status(200).json(nccoResponse);

 });

//------------

app.post('/ws_event_2', async(req, res) => {

  res.status(200).send('Ok');

  const ws2Uuid = req.body.uuid;
  
  // if (req.body.type == 'transfer') {

  //   const pstn1Uuid = req.query.original_uuid;

  //   // Stop MoH on PSTN 1 leg

  //   vonage.voice.getCall(pstn1Uuid)
  //     .then(res => {
  //       if (res.status == 'answered') { // is PSTN 1 leg still up?

  //         // stop music-on-hold ring back tone (music-on-hold)      
  //         vonage.voice.stopStreamAudio(pstn1Uuid)
  //           .then(res => console.log(`>>> stop streaming ring back tone to call ${pstn1Uuid} status:`, res))
  //           .catch(err => {
  //             console.log(`>>> stop streaming ring back tone to call ${pstn1Uuid} error:`, err.body);
  //           });
  //       }
  //      })
  //     .catch(err => console.error(">>> error get call status of PSTN leg 1", pstn1Uuid, err)) 

  // };

  //--

  if (req.body.status == 'completed') {

    console.log('>>> WebSocket 2 leg',  ws2Uuid, 'terminated');

  };

  //--

  if (req.body.status == 'started' || req.body.status == 'ringing') {

    const pstn2Uuid = req.query.pstn2_uuid;

    vonage.voice.getCall(pstn2Uuid)
      
      .then(res => {

        if (res.status == 'completed') {

          vonage.voice.hangupCall(ws2Uuid)
            .then(res => console.log(">>> WebSocket leg 2 terminated", ws2Uuid))
            .catch(err => null) // WebSocket leg 2 has already been terminated 
  
        }
       
       })
      
      .catch(err => console.error(">>> Error get status of PSTN leg 2", pstn2Uuid, err))  
  
  };

});

//-- Retrieve call recordings --

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
 

//--- If this application is hosted on VCR (Vonage Code Runtime) serverless infrastructure (aka Neru) --------

app.get('/_/health', async(req, res) => {

  res.status(200).send('Ok');

});

//=========================================

const port = process.env.NERU_APP_PORT || process.env.PORT || 8000;

app.listen(port, () => console.log(`Voice API application listening on port ${port}!`));

//------------
