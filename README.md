# WebRTC local network camera webapp

A simple webapp to send the camera and microphone of one device easily to another device in the same loal network.

Being a website, it is also easily embeddable in OBS via a browser source. Connection problems can always be resolved on both ends, which makes it comfortable for live streaming.

## Steps
Steps to play the camera and microphone as a livestream on another device:
1. Open the hosted website on your device which you want to share. I have not setup a website, but the [development preview website](https://n38dh3-3000.csb.app/) is available.
2. Select which audio and video input device you want to use, check if in the preview if you have the correct device.
3. Now you need to look at the "Invite" button. You can copy the address via a right click and copy address or click on it to open the share window of your operating system.
4. Send the link to the other device in your local network where you want to stream the video.
5. Open the link on the target device. Or if it is a streaming computer with obs, you can put it inside a browser source.
6. While it is establishing the connection, on the receiving side you can see the status until it plays the stream.

## How it works & topics

### Pairing the two devices
As soons as you open the device on the source device, it will generate an X25519 keypair which will be used to exchange the pairing information. The public key acts as an identifier of your room. Only the public key will be sent in plaintext to the server. Both clients (sender and receiver) keep an ongoing connection (server events) to the webserver, so it can quickly reconnect, should the direct connection break. The keys and all other settings are saved in the local storage of the sender client. If you reload the website it should reconnect to the receiver immediately.

The target device must enter the room via a link that is created with the share button on the source device. The link contains the secret key inside the hash component. The hash component is not available to the server. See this [stackoverflow answer](https://stackoverflow.com/a/3664324). 

The browser page recreates the public key from it, fetches the encrypted offer. It decrypts the offer inside the browser, processes it and sends an encrypted answer back to the server. The server relays it to the source device where it can complete the pairing. The connection to the server is only kept open, so you can easily reload on the receiving device, if you encounter a problem. 

### After pairing
After pairing the two devices all audio und video content is transmitted via the peer-to-peer connection directly over the local network. This enables you to have high quality and low latency streaming, even if the own internet connection is not that good. 

### Getting rid of the audio
If you don't want to hear the recorded audio, you must mute it on client side. This can be done by tapping on the video so it enters fullscreen, where the controls are visible. In the case of obs you can just remove audio from the browser source or mute it in the audio mixer.

### Ensure to only activate sending if you need it
If you are done using this app, you should turn off sending your camera data. You could start the app by mistake and could leak sensitive information, if you are currently live. I wished i could have implemented a better usage flow from the get go, where this can not happen, but i messed up with the organisation of the code, which makes it a little difficult.

### Troubleshooting problems
You can reload any time on both ends to reestablish the direct connection. On the sender side you can also use various buttons. You can start/stop sending the camera, which enables you to rearrange your device to point to your next object without showing unwanted things in the process. If it just does not want to connect, you can try to tap on the "Restart camera" button.

If the receiver client for your key is opened more than once, it will constantly lose the connection, because all the receiver client are fight for the peer connection. The sender does not yet support sending to multiple receivers simultaneously. You can see the amount of active receiver clients below the video in the "Receiver count" field. If you close a receiver, it may take 30 seconds until the connection gets dropped.

### Security description
With the secret key it can transfer the pairing information securely to the source device without leaking network information outside of the local network. Although i am not sure how valuable the information of a local network can be. The webrtc pairing is only limited to the local network, so public information is not in it. 

In case of the codesandbox servers the ip addresses are discoverable via the request headers, which are put by the cloud infrastructure (cloudfare etc.). You can see in the source code of the server, that it is not reading those headers in any way. The webserver in the sandbox does not save any connection data and only operates in working memory. If all clients have disconnected the server removes all information attached to the public key from memory.

The target device can not find out the public ip address of the source device. The website server uses the randomly generated keys to connect them. These keys are generated by the sender client. If it happens that you leak the private key the local network informationen gets readable. Should someone else outside of the network open the website, you can see that the "Receiver count" is getting increased, but it can not access any audio and video data, because these are only transmitted to devices in the local network.

### Transmission over the internet
This is not directly supported and you would probably need a vpn tunnel to achieve this. At least you can not leak your camera and microphone data by mistake to the internet. Only if you are in a call or live and have it embedded in a streaming application.

## State of the project
As of now the webapp is fully functional. 

### Used libraries
- The [typescript](https://www.typescriptlang.org/) compiler got used.
- [htmx](https://htmx.org) for basic initial templating and for handling the communication to the webserver. 
- [htmx-serverless](https://github.com/ernestmarcinko/htmx-serverless) extension is used to provide further initial templating without doing a request to the server. While developing the app i falled back to direct dom manipulation, which was often a lot easier for me right now. 
- The [tailwindcss](https://tailwindcss.com) is currently added but not really used. 
- Instead i used [picocss](https://picocss.com/docs/), because i wanted a dark theme. There may be other css frameworks, but i couldn't find it quickly.
- [sodium-plus](https://github.com/paragonie/sodium-plus) and [sodium-native](https://github.com/sodium-friends/sodium-native) are used by the clients for encryption.
- [simple-peer](https://github.com/feross/simple-peer/) handles the peer communication in the local network
- [@kitajs/html](https://github.com/kitajs/html) and [@kitajs/ts-html-plugin](https://github.com/kitajs/ts-html-plugin) were heavily used for creating the html text.

### Used editor
I have used the online code editor [codesandbox.io] while developing the app. Thanks for providing this service. It was easy to get everything running and also available on the smartphone. To test the app on the smartphone i needed a https webserver, which this service additionally provides.

### State of the code
Almost everything client related is in the App.tsx file. It is really chaotic and stuff is mixed which should be separated. Some literals are copied over and over again instead putting them in a constant. Fixing latter first and the separting would be advised. Somehow i got everything working, especially the reconnect part was horrible to get somewhat right. I think there are still some bugs, which resolve itself only because of the reconnect logic. There are also some timeouts to quickly curcumvent some hanging in the reconnect logic. Definitely not fully happy with this code, but it seems to work, so i let it for now at this state.

### If you want to tinker arround
I have setup a [codesandbox development environment](https://codesandbox.io/p/github/XevErylux/webrtc-camera). Watch mode compiling is configured. There is no production build script. Only the vendor bundle gets minified. Something in the configuration seems to be wrong. If you open it inside a new sandbox, the tasks get stuck. Restarting the task and reload the website got it running somehow. I don't know right now how to fix it.

## License
### MIT
Copyright (c) 2023 github.com/XevErylux

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
