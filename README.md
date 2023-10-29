# WebRTC camera

> This project is still in development. Its basically a template with installed libraries and a readme with the project description.

You can send the camera and microphone on one device and let it play on the other device in the same local network. This makes it possible to have a network camera which is easily embeddable in OBS via a browser source.

## Steps
Steps to play the camera and microphone as a livestream on another device:
1. Open the website on your device which you want to share. Currently only the [development preview website](https://n38dh3-3000.csb.app/) is available.
2. Select which camera you want to use and click on the share button. 
3. Send the link to the other device in your local network where you want to play the video. 
4. Open the link on the target device or embed it into obs as a browser source.
5. After a short period of time the video should start playing.

## How it works

### Pairing the two devices
As soons as you open the device on the source device, it will generate an X25519 keypair which will be used to exchange the pairing information. Only the public key will be sent to the server, which is also used to identify a room. The source device keeps a short lived connection to the server, until the target device entered the room. The target device must enter the room via a link that is created with the share button on the source device. The link contains the secret key inside the hash component. The hash component is not available in the server, see this [stackoverflow answer](https://stackoverflow.com/a/3664324). The browser page recreates the public key from it, fetches the encrypted offer. It decrypts the offer inside the browser, processes it and sends an encrypted answer back to the server. The server relays it to the source device where it can complete the pairing. The connection to the server is only kept open, so you can easily reload on the target device, if you encounter a problem. If you reload the website on the source device, it will create a new keypair and you need to share the link again to the target device.

### After pairing
After pairing the two devices all communication is done via webrtc with a peer-to-peer connection directly over the local network. This enables you too have high quality and low latency streaming, even if the own internet connection is not that good.

### Security description
With the secret key it can transfer the pairing information securely to the source device without leaking network information outside of the local network. Although i am not sure how valuable the information of a local network can be. The webrtc pairing is only limited to the local network, so public information is not in it. Technically the server has the public ip address while the website is open, but it stays only in memory on the server. The target device can not find out the public ip address of the source device. The website server uses the randomly generated keys to connect them.

## State of the project
Currently i have only applied a website template. Added htmx, expressjs and tailwindcss. And setup a [codesandbox development environment](https://codesandbox.io/p/github/XevErylux/webrtc-camera). Configured server and client side typescript in watch mode. You can tinker around with this project in your browser, but at the moment there is not much to see. I hope i can fill the true content shortly.

## License
MIT
