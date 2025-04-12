# Sample application using Vonage Voice API to connect Voice Calls to AI Engines

You may use this Voice API application to connect voice calls to AI Engines using one of the Connectors listed in the Set up section.

Voice calls may be:</br>
inbound/outbound,</br>
PSTN calls (cell phones, landline phones, fixed phones),</br>
SIP connections/trunks using [Standard SIP trunks](https://developer.vonage.com/en/sip/overview) or [Programmable SIP Trunks](https://developer.vonage.com/en/voice/voice-api/concepts/programmable-sip),</br>
[WebRTC](https://developer.vonage.com/en/vonage-client-sdk/overview) clients (iOS/Android/JavaScript).</br>

## About this sample Voice API application

This application connects voice calls to a Connector server by using the [WebSockets feature](https://developer.vonage.com/en/voice/voice-api/concepts/websockets) of Vonage Voice API.</br>

When a voice call is established, this Voice API application triggers a WebSocket connection from Vonage platform to the Connector server which streams audio in one or both directions between the voice call and the AI engines. 

Instead of using this sample Voice API application, you may use your own existing Voice API application to establish WebSockets with the Connector server to connect your managed voice calls with the AI engines.

Your new or existing Voice API application may be written with any programming language using [server SDKs](https://developer.vonage.com/en/tools) or with direct [REST API] (https://developer.vonage.com/en/api/voice) calls.

You may also have your Vonage Video API WebRTC Clients establish sessions with AI engines through the [Audio Connector](https://tokbox.com/developer/guides/audio-connector) and the peer Connector server as listed in the next section.


## Set up

### Set up the sample Connector server - Host server public hostname and port

First set up the Connector server (aka middleware server) from one of the following repositories</br>
https://github.com/nexmo-se/dg-oai-11l-connector,</br>
https://github.com/nexmo-se/elevenlabs-agent-ws-connector,</br>
https://github.com/nexmo-se/openai-realtime-connector,</br>
https://github.com/nexmo-se/websocket-server-variant-3.</br>

_Note:
The current repository https://github.com/nexmo-se/vonage-deepgram-voice-agent combines both the sample Voice API application and the Connector application in one server program.<br>
Soon, the standalone Connector application for Deepgram Voice Agent will be created like the other Connector repositories listed above._

Default local (not public!) of that Connector server `port` is: 6000.

If you plan to test using `Local deployment` with ngrok (Internet tunneling service) for both the sample middleware server application and this sample Voice API application, you may set up [multiple ngrok tunnels](https://ngrok.com/docs/agent/config/#tunnel-configurations).

For the next steps, you will need:
- That middleware public hostname and if necessary public port,</br>
e.g. `xxxxxxxx.ngrok.io`, `xxxxxxxx.herokuapp.com`, `myserver.mycompany.com:32000`  (as **`PROCESSOR_SERVER`**),</br>
no `port` is necessary with ngrok or heroku as public hostname.</br>

### Set up your Vonage Voice API application credentials and phone number

[Log in to your](https://dashboard.nexmo.com/sign-in) or [sign up for a](https://dashboard.nexmo.com/sign-up) Vonage APIs account.

Go to [Your applications](https://dashboard.nexmo.com/applications), access an existing application or [+ Create a new application](https://dashboard.nexmo.com/applications/new).

Under Capabilities section (click on [Edit] if you do not see this section):

Enable Voice
- Under Answer URL, leave HTTP GET, and enter https://\<host\>:\<port\>/answer (replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running)</br>
- Under Event URL, **select** HTTP POST, and enter https://\<host\>:\<port\>/event (replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running)</br>
Note: If you are using ngrok for this sample application, the answer URL and event URL look like:</br>
https://yyyyyyyy.ngrok.io/answer</br>
https://yyyyyyyy.ngrok.io/event</br> 	
- Click on [Generate public and private key] if you did not yet create or want new ones, save the private key file in this application folder as .private.key (leading dot in the file name).</br>
**IMPORTANT**: Do not forget to click on [Save changes] at the bottom of the screen if you have created a new key set.</br>
- Link a phone number to this application if none has been linked to the application.

Please take note of your **application ID** and the **linked phone number** (as they are needed in the very next section).

For the next steps, you will need:</br>
- Your [Vonage API key](https://dashboard.nexmo.com/settings) (as **`API_KEY`**)</br>
- Your [Vonage API secret](https://dashboard.nexmo.com/settings), not signature secret, (as **`API_SECRET`**)</br>
- Your `application ID` (as **`APP_ID`**),</br>
- The **`phone number linked`** to your application (as **`SERVICE_PHONE_NUMBER`**), your phone will **call that number**,</br>

### Local setup

Copy or rename .env-example to .env<br>
Update parameters in .env file<br>
Have Node.js installed on your system, this application has been tested with Node.js version 18.19<br>

Install node modules with the command:<br>
 ```bash
npm install
```

Launch the application:<br>
```bash
node voice-to-ai-engines
```
Default local (not public!) of this application server `port` is: 8000.

### How to make PSTN calls

#### Inbound calling

Call the **`phone number linked`** to your application to get connected to the Conversational AI Agent.

#### Outbound calling

To manually trigger an outbound PSTN call to a number, open a web browser, enter the address:<br>

_https://\<server-address\>/call?callee=\<number\>_<br>

the \<number\> must be in E.164 format without leading '+' sign, or '-', '.' characters

for example, it looks like

https://xxxx.ngrok.app/call?callee=12995551212

Upon answering the call, the callee will get connected to the Conversational AI Agent.

Of course, you may programmatically initiate outbound calls by using the API call listed in the corresponding webhook section (i.e. `/call`).

### Cloud deployment

Instructions on how to deploy both this Voice API application as well as the peer Connector application to [Vonage Cloud Runtime](https://developer.vonage.com/en/vonage-cloud-runtime/getting-started/technical-details) serverless infrastructure will be posted here soon.

## Additional resources

If you have questions, join our [Community Slack](https://developer.vonage.com/community/slack) or message us on [X](https://twitter.com/VonageDev?adobe_mc=MCMID%3D61117212728348884173699984659581708157%7CMCORGID%3DA8833BC75245AF9E0A490D4D%2540AdobeOrg%7CTS%3D1740259490).



